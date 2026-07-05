'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Edit, Archive, RotateCcw, ChevronDown, ChevronUp, Eye, Trash2, Loader2, LayoutGrid } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import RoleGuard from '@/components/layout/RoleGuard';
import api from '@/lib/api';
import { invalidateFieldDefinitions } from '@/lib/dynamic';
import { useModules } from '@/lib/modules';
import { FieldTypePalette } from '@/components/dynamic/FieldTypePalette';
import { cn } from '@/lib/utils';

export default function FieldsAdminPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'schema_editor']}>
      <Suspense fallback={(
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}>
        <FieldsContent />
      </Suspense>
    </RoleGuard>
  );
}

function FieldsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { modules } = useModules();
  // Tabs come from the modules registry so custom modules get a fields tab.
  // Every module gets a fields tab (incl. inactive ones — schema editing is
  // legitimate on a deactivated module).
  const ENTITIES = useMemo(
    () => (modules || [])
      .slice()
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map((m) => ({ key: m.key, label: m.label_plural })),
    [modules],
  );
  const [defs, setDefs] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState(() => sp.get('entity') || 'lead');

  const load = async () => {
    try {
      const { data } = await api.get(
        `/field-definitions?include_archived=${showArchived ? 'true' : 'false'}`
      );
      setDefs(data.data.items || []);
      invalidateFieldDefinitions();
    } catch (e) {
      toast.error('Failed to load fields');
    }
  };

  useEffect(() => { load(); }, [showArchived]);

  // Keep activeTab valid as the registry resolves — guards a stale/deleted
  // ?entity key so the tab body never renders permanently blank.
  useEffect(() => {
    if (ENTITIES.length && !ENTITIES.some((e) => e.key === activeTab)) {
      setActiveTab(ENTITIES[0].key);
    }
  }, [ENTITIES, activeTab]);

  const archive = async (id) => {
    if (!confirm('Archive this field? Existing data will be preserved but hidden from the UI.')) return;
    try {
      await api.post(`/field-definitions/${id}/archive`);
      toast.success('Archived');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const restore = async (id) => {
    try {
      await api.post(`/field-definitions/${id}/restore`);
      toast.success('Restored');
      load();
    } catch (e) {
      toast.error('Failed');
    }
  };

  // Hard delete — only safe when no records hold a value for this field.
  // Check usage first so the confirm prompt can be honest about whether
  // the operation will actually go through; the backend rechecks anyway.
  const hardDelete = async (d) => {
    let count = 0;
    try {
      const { data } = await api.get(`/field-definitions/${d.id}/usage-count`);
      count = data?.data?.count ?? 0;
    } catch (_) { /* fall through — backend will refuse if needed */ }

    if (count > 0) {
      toast.error(
        `${count} record${count === 1 ? '' : 's'} still hold a value for "${d.field_key}". Archive it instead, or migrate the data first.`,
      );
      return;
    }
    if (!confirm(
      `Permanently delete "${d.label}"? This cannot be undone.\n\n` +
      `The field has no data in any record. Archive is safer if you might want it back.`,
    )) return;

    try {
      await api.delete(`/field-definitions/${d.id}`);
      toast.success('Deleted permanently');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    }
  };

  const reorder = async (entityType, ordered_ids) => {
    try {
      await api.post('/field-definitions/reorder', { entity_type: entityType, ordered_ids });
      load();
    } catch (e) {
      toast.error('Failed');
    }
  };

  const move = (entityType, fieldId, direction) => {
    const list = defs.filter(d => d.entity_type === entityType && (!d.is_archived || showArchived));
    const sorted = [...list].sort((a, b) => (a.display_order || 100) - (b.display_order || 100));
    const idx = sorted.findIndex(d => d.id === fieldId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    reorder(entityType, sorted.map(d => d.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Custom fields</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define custom fields on every entity. Changes appear instantly across the CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/settings/fields/layout?entity=${activeTab}`)}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Layout
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="overflow-x-auto justify-start">
          {ENTITIES.map(e => {
            const count = defs.filter(d => d.entity_type === e.key && !d.is_archived).length;
            return (
              <TabsTrigger key={e.key} value={e.key} className="gap-1.5">
                {e.label}
                {count > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">{count}</Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ENTITIES.map(entity => {
          const rows = defs
            .filter(d => d.entity_type === entity.key)
            .sort((a, b) => (a.display_order || 100) - (b.display_order || 100));

          return (
            <TabsContent key={entity.key} value={entity.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Fields appear in this order on {entity.label.toLowerCase()} forms and detail pages.
                </p>
                <Button size="sm" onClick={() => router.push(`/settings/fields/new?entity=${entity.key}`)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />New field
                </Button>
              </div>

              <FieldTypePalette entityKey={entity.key} />

              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left p-3 font-medium text-muted-foreground">Field</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Section</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Flags</th>
                        <th className="p-3 text-right font-medium text-muted-foreground">Order</th>
                        <th className="p-3 text-right font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            No custom fields yet. Click &quot;New field&quot; to add one.
                          </td>
                        </tr>
                      )}
                      {rows.map((d, idx, arr) => (
                        <tr
                          key={d.id}
                          className={cn(
                            'border-b last:border-0 hover:bg-muted/20',
                            d.is_archived && 'opacity-60'
                          )}
                        >
                          <td className="p-3">
                            <p className="font-medium">{d.label}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{d.field_key}</p>
                            {d.helper_text && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{d.helper_text}</p>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px]">{d.field_type}</Badge>
                          </td>
                          <td className="p-3">{d.section || 'Custom'}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {d.is_required && (
                                <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">
                                  Required
                                </Badge>
                              )}
                              {d.is_filterable && (
                                <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-500/30">
                                  Filterable
                                </Badge>
                              )}
                              {d.is_visible_in_list && (
                                <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                                  In list
                                </Badge>
                              )}
                              {d.is_archived && (
                                <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">
                                  Archived
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex">
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={idx === 0}
                                className="h-6 w-6"
                                onClick={() => move(entity.key, d.id, 'up')}
                              >
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={idx === arr.length - 1}
                                className="h-6 w-6"
                                onClick={() => move(entity.key, d.id, 'down')}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => router.push(`/settings/fields/${d.id}`)}
                              >
                                <Edit className="h-3 w-3 mr-1" />Edit
                              </Button>
                              {d.is_archived ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-emerald-400"
                                  onClick={() => restore(d.id)}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />Restore
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-400"
                                  onClick={() => archive(d.id)}
                                >
                                  <Archive className="h-3 w-3 mr-1" />Archive
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => hardDelete(d)}
                                title="Permanently delete — only allowed when no records use this field"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
