'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Boxes } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import DataTable from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { DynamicFilterBar } from '@/components/dynamic/DynamicFilterBar';
import { DynamicFilterChips } from '@/components/dynamic/DynamicFilterChips';
import { DynamicCell } from '@/components/dynamic/DynamicCell';
import { fetchFieldDefinitions, visibleFields, formatValue } from '@/lib/dynamic';
import { fetchModules, moduleByKey, iconForModule } from '@/lib/modules';

dayjs.extend(relativeTime);

export default function ModuleRecordsPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'schema_editor']}>
      <RecordsContent />
    </RoleGuard>
  );
}

// Pick a human title for a record: the first visible text-ish field value.
function recordTitle(record, titleDef) {
  if (titleDef) {
    const v = record.custom_fields?.[titleDef.field_key];
    if (v != null && v !== '') return formatValue(titleDef, v);
  }
  return `${record.id?.slice(0, 8) || 'record'}…`;
}

function RecordsContent() {
  const { key } = useParams();
  const router = useRouter();
  const role = useStore((s) => s.user)?.role;

  const [mod, setMod] = useState(() => moduleByKey(key));
  const [defs, setDefs] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const limit = 25;

  // Resolve the module (label/icon) if not already cached.
  useEffect(() => {
    if (mod) return;
    fetchModules().then((list) => setMod(list.find((m) => m.key === key) || null)).catch(() => {});
  }, [key, mod]);

  // Field definitions → columns.
  useEffect(() => {
    if (!role) return;
    fetchFieldDefinitions({ entity_type: key, force: true })
      .then((d) => setDefs(visibleFields(d, role)))
      .catch(() => {});
  }, [key, role]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit, search: search || undefined };
      for (const k of Object.keys(filters)) {
        if (k.startsWith('cf_') && filters[k] !== '' && filters[k] != null) params[k] = filters[k];
      }
      const res = await api.get(`/modules/${key}/records`, { params });
      const payload = unwrap(res);
      const list = Array.isArray(payload) ? payload : (payload?.items || []);
      setRows(list);
      setTotal(res?.data?.pagination?.total ?? list.length);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load records');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [key, page, search, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const listCols = useMemo(() => defs.filter((d) => d.is_visible_in_list), [defs]);
  const titleDef = useMemo(
    () => defs.find((d) => ['text', 'email', 'phone'].includes(d.field_type)) || null,
    [defs],
  );

  const columns = useMemo(() => {
    const base = [
      {
        id: '__title',
        header: mod?.label_singular || 'Record',
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{recordTitle(row.original, titleDef)}</span>
        ),
        enableSorting: false,
      },
    ];
    for (const def of listCols) {
      if (def.field_key === titleDef?.field_key) continue;
      base.push({
        id: `cf_${def.field_key}`,
        header: def.label,
        cell: ({ row }) => <DynamicCell definition={def} value={row.original.custom_fields?.[def.field_key]} />,
        enableSorting: false,
      });
    }
    base.push({
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => {
        const v = row.original.created_at || row.original.createdAt;
        return <span className="text-xs text-muted-foreground">{v ? dayjs(v).fromNow() : '—'}</span>;
      },
    });
    return base;
  }, [listCols, titleDef, mod]);

  const Icon = iconForModule(mod || key);
  const plural = mod?.label_plural || 'Records';
  const singular = mod?.label_singular || 'Record';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-lg inline-flex items-center justify-center flex-shrink-0" style={{ background: `${mod?.color || '#64748B'}1a`, color: mod?.color || '#64748B' }}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{plural}</h1>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{total.toLocaleString('en-IN')}</span> {total === 1 ? singular.toLowerCase() : plural.toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DynamicFilterBar entityType={key} filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />
          <Button size="sm" onClick={() => router.push(`/m/${key}/new`)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New {singular.toLowerCase()}
          </Button>
        </div>
      </div>

      <DynamicFilterChips entityType={key} filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />

      {listCols.length === 0 && !loading && defs.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 px-6 text-center">
          <div className="h-12 w-12 rounded-xl bg-muted mx-auto flex items-center justify-center"><Boxes className="h-6 w-6 text-muted-foreground" /></div>
          <p className="text-sm font-medium mt-4">No fields defined yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add fields to this module before creating records.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(`/settings/fields?entity=${key}`)}>
            Manage fields
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          total={total}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onSearch={(q) => { setSearch(q); setPage(1); }}
          searchPlaceholder={`Search ${plural.toLowerCase()}…`}
          onRowClick={(r) => router.push(`/m/${key}/${r.id}/edit`)}
        />
      )}
    </div>
  );
}
