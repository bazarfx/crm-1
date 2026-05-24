'use client';

import { useEffect, useState } from 'react';
import {
  Plus, Edit, Archive, RotateCcw, ChevronUp, ChevronDown, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FieldEditorDialog } from '@/app/(dashboard)/settings/fields/FieldEditorDialog';
import api, { unwrap } from '@/lib/api';
import { invalidateFieldDefinitions } from '@/lib/dynamic';

const ENTITY_LABELS = {
  lead: 'Lead',
  user: 'User',
  deal: 'Deal',
  campaign: 'Campaign',
  group: 'Group',
  lead_activity: 'Activity',
};

/**
 * Slide-in panel for managing every custom field on one entity in one place.
 * Triggered by the gear icon on the EditableForm wrapper; also reachable
 * from /settings/fields (link in the header).
 *
 * Reorders are persisted via /field-definitions/reorder which writes
 * display_order in stride-10 increments.
 */
export function SchemaSidePanel({ entityType, open, onOpenChange }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    if (!entityType) return;
    setLoading(true);
    try {
      const res = await api.get('/field-definitions', {
        params: {
          entity_type: entityType,
          include_archived: showArchived ? 'true' : 'false',
        },
      });
      setFields(unwrap(res)?.items || []);
      // Any open form on the same page should re-fetch on next open.
      invalidateFieldDefinitions();
    } catch (e) {
      toast.error('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityType, showArchived]);

  const archive = async (id) => {
    if (!window.confirm('Archive this field? Existing data is preserved.')) return;
    try {
      await api.post(`/field-definitions/${id}/archive`);
      toast.success('Archived');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Archive failed');
    }
  };

  const restore = async (id) => {
    try {
      await api.post(`/field-definitions/${id}/restore`);
      toast.success('Restored');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Restore failed');
    }
  };

  const move = async (id, direction) => {
    const sorted = fields
      .filter((f) => !f.is_archived)
      .sort((a, b) => (a.display_order || 100) - (b.display_order || 100));
    const idx = sorted.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    try {
      await api.post('/field-definitions/reorder', {
        entity_type: entityType,
        ordered_ids: sorted.map((f) => f.id),
      });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Reorder failed');
    }
  };

  const active = fields
    .filter((f) => !f.is_archived)
    .sort((a, b) => (a.display_order || 100) - (b.display_order || 100));
  const archived = fields.filter((f) => f.is_archived);
  const entityLabel = ENTITY_LABELS[entityType] || entityType;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2">
            <span>Manage {entityLabel} fields</span>
            <Button asChild size="sm" variant="ghost" className="h-7 text-[10px]">
              <Link href="/settings/fields">
                <ExternalLink className="h-3 w-3 mr-1" />Full editor
              </Link>
            </Button>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Add, reorder, or archive custom fields on {entityLabel.toLowerCase()}s.
            Changes apply instantly everywhere this entity appears.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-3 overflow-y-auto">
          <Button size="sm" className="w-full" onClick={() => setCreatingNew(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add new field
          </Button>

          {loading && (
            <div className="text-xs text-muted-foreground text-center py-3">Loading…</div>
          )}

          {!loading && active.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No custom fields yet for {entityLabel.toLowerCase()}s.
            </p>
          )}

          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Active ({active.length})
              </p>
              {active.map((f, idx, arr) => (
                <Card key={f.id} className="hover:bg-muted/20 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium truncate">{f.label}</p>
                          <Badge variant="outline" className="text-[9px] h-4">
                            {f.field_type}
                          </Badge>
                          {f.is_required && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-4 text-red-500 dark:text-red-400 border-red-500/30"
                            >
                              Required
                            </Badge>
                          )}
                          {f.is_filterable && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-4 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            >
                              Filterable
                            </Badge>
                          )}
                          {f.is_visible_in_list && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-4 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            >
                              In list
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                          {f.field_key}
                        </p>
                        {f.helper_text && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {f.helper_text}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === 0}
                          onClick={() => move(f.id, 'up')}
                          title="Move up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === arr.length - 1}
                          onClick={() => move(f.id, 'down')}
                          title="Move down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setEditingField(f)}
                          title="Edit"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500 dark:text-red-400"
                          onClick={() => archive(f.id)}
                          title="Archive"
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="pt-3 border-t">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showArchived ? '↑ Hide' : '↓ Show'} archived ({archived.length})
            </button>
          </div>

          {showArchived && archived.length > 0 && (
            <div className="space-y-2 opacity-70">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Archived ({archived.length})
              </p>
              {archived.map((f) => (
                <Card key={f.id} className="border-amber-500/20 bg-amber-500/5">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{f.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {f.field_key}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-emerald-600 dark:text-emerald-400"
                        onClick={() => restore(f.id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />Restore
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <FieldEditorDialog
          field={editingField}
          entityType={entityType}
          open={!!editingField || creatingNew}
          onOpenChange={(o) => {
            if (!o) {
              setEditingField(null);
              setCreatingNew(false);
              load();
            }
          }}
          onSaved={() => {
            setEditingField(null);
            setCreatingNew(false);
            load();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export default SchemaSidePanel;
