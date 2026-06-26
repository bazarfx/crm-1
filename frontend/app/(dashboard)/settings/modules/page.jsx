'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, SlidersHorizontal, Table2, Trash2, Lock, Loader2, Boxes,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { iconForModule } from '@/lib/modules';
import { invalidateModules } from '@/lib/modules';
import { cn } from '@/lib/utils';

export default function ModulesPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'schema_editor']}>
      <ModulesContent />
    </RoleGuard>
  );
}

function ModulesContent() {
  const router = useRouter();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setModules(unwrap(await api.get('/modules')) || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (m) => {
    if (m.record_count > 0) {
      toast.error('Module has records. Delete them or deactivate the module first.');
      return;
    }
    if (!confirm(`Delete module "${m.label_plural}"? Its fields stay defined but it disappears from the CRM.`)) return;
    try {
      await api.delete(`/modules/${m.id}`);
      invalidateModules();
      toast.success('Module deleted');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Modules</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
            Every data type in the CRM. Built-ins ship with the platform; create custom modules
            to track anything else, each with its own fields and records.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push('/settings/modules/new')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New module
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                {['Module', 'Fields', 'Records', 'Status', 'Type', ''].map((h, i) => (
                  <th key={i} className="text-left p-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </td></tr>
              )}
              {!loading && modules.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No modules.</td></tr>
              )}
              {modules.map((m) => {
                const Icon = iconForModule(m);
                return (
                  <tr key={m.id} className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors', !m.is_active && 'opacity-60')}>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-8 w-8 rounded-lg inline-flex items-center justify-center flex-shrink-0"
                          style={{ background: `${m.color}1a`, color: m.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{m.label_plural}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{m.key}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/settings/fields?entity=${m.key}`)}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {m.field_count ?? 0} field{m.field_count === 1 ? '' : 's'}
                      </button>
                    </td>
                    <td className="p-3 text-muted-foreground tabular-nums">
                      {m.record_count == null ? '—' : m.record_count}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn(
                        'text-[10px]',
                        m.is_active ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'text-muted-foreground',
                      )}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {m.is_system ? (
                        <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground">
                          <Lock className="h-2.5 w-2.5" /> System
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">Custom</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1">
                        {!m.is_system && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push(`/m/${m.key}`)}>
                            <Table2 className="h-3 w-3 mr-1" /> Records
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push(`/settings/fields?entity=${m.key}`)}>
                          <SlidersHorizontal className="h-3 w-3 mr-1" /> Fields
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push(`/settings/modules/${m.id}`)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        {!m.is_system && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => remove(m)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
