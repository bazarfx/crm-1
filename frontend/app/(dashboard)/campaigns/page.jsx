'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Megaphone, Search, Pencil, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { DynamicFilterBar } from '@/components/dynamic/DynamicFilterBar';
import { useDynamicColumns } from '@/components/dynamic/DynamicColumns';
import { DynamicCell } from '@/components/dynamic/DynamicCell';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';
import CampaignDialog from '@/components/campaigns/CampaignDialog';

export default function CampaignsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <CampaignsContent />
    </RoleGuard>
  );
}

function CampaignsContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [customFilters, setCustomFilters] = useState({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const dyn = useDynamicColumns('campaign');

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = { limit: 100, search: search || undefined };
      for (const k of Object.keys(customFilters)) {
        if (customFilters[k] !== '' && customFilters[k] != null) params[k] = customFilters[k];
      }
      const res = await api.get('/campaigns', { params });
      const payload = unwrap(res);
      const list = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);
      setItems(list);
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable' : 'Could not load campaigns');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, customFilters]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Meta Ads campaigns + group routing. Custom fields editable per campaign.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DynamicFilterBar
            entityType="campaign"
            filters={customFilters}
            onChange={setCustomFilters}
          />
          <dyn.PickerButton />
          <ManageFieldsButton entityType="campaign" size="sm" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New campaign
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns by name…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {err && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-400">{err}</CardContent>
        </Card>
      )}

      {!loading && items.length === 0 && !err && (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          message="Create one to start grouping leads by ad source."
        />
      )}

      {items.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Language</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Platform</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Groups</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Status</th>
                  {dyn.customDefs
                    .filter((d) => dyn.visibleColumns[d.field_key])
                    .map((d) => (
                      <th key={d.field_key} className="text-left p-3 font-medium text-muted-foreground text-xs">
                        {d.label}
                      </th>
                    ))}
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-blue-500 dark:hover:text-blue-400">
                        {c.name}
                      </Link>
                      {c.ad_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-xs">{c.ad_name}</p>
                      )}
                    </td>
                    <td className="p-3">
                      {c.language ? <LanguageBadge language={c.language} size="xs" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="p-3 capitalize text-xs text-muted-foreground">{c.platform || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {Array.isArray(c.groups) && c.groups.length > 0
                        ? c.groups.map((g) => g.name).join(', ')
                        : <span>—</span>}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={c.is_active
                          ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]'
                          : 'text-muted-foreground text-[10px]'}
                      >
                        {c.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </td>
                    {dyn.customDefs
                      .filter((d) => dyn.visibleColumns[d.field_key])
                      .map((d) => (
                        <td key={d.field_key} className="p-3">
                          <DynamicCell definition={d} value={c.custom_fields?.[d.field_key]} />
                        </td>
                      ))}
                    <td className="p-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(c)}
                        title="Edit campaign + custom fields"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Open detail">
                        <Link href={`/campaigns/${c.id}`}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <CampaignDialog
        open={creating}
        onOpenChange={setCreating}
        campaign={null}
        onSaved={load}
      />
      <CampaignDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        campaign={editing}
        onSaved={load}
      />
    </div>
  );
}
