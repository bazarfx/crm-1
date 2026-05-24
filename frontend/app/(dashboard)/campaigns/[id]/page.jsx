'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Megaphone, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { LANGUAGES } from '@/lib/languages';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

export default function CampaignDetailPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <CampaignDetailContent />
    </RoleGuard>
  );
}

function CampaignDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState(null);
  const [form, setForm] = useState({});
  const [leadCount, setLeadCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/campaigns/${id}/with-fields`)
      .then((r) => {
        const c = unwrap(r);
        setCampaign(c);
        setForm({
          name: c.name || '',
          ad_set_name: c.ad_set_name || '',
          ad_name: c.ad_name || '',
          platform: c.platform || 'facebook',
          language: c.language || '',
          is_active: c.is_active !== false,
          start_date: c.start_date ? String(c.start_date).slice(0, 10) : '',
          end_date: c.end_date ? String(c.end_date).slice(0, 10) : '',
          budget: c.budget ?? '',
          custom_fields: c.custom_fields || {},
        });
        // Lead count comes from getOne, not with-fields — fire-and-forget.
        api.get(`/campaigns/${id}`)
          .then((r2) => setLeadCount(unwrap(r2)?.lead_count ?? null))
          .catch(() => {});
      })
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load campaign'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const updateField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, budget: form.budget === '' ? null : Number(form.budget) };
      const res = await api.patch(`/campaigns/${id}`, payload);
      const updated = unwrap(res);
      setCampaign(updated);
      setForm({
        ...payload,
        custom_fields: updated.custom_fields || {},
      });
      setHasChanges(false);
      toast.success('Campaign updated');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs text-muted-foreground p-6">Loading…</p>;
  if (!campaign) return <p className="text-sm text-muted-foreground p-6">Campaign not found.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/campaigns')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" /> {campaign.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              {campaign.language && <LanguageBadge language={campaign.language} size="xs" />}
              <span className="capitalize">{campaign.platform || '—'}</span>
              <Badge
                variant="outline"
                className={campaign.is_active
                  ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]'
                  : 'text-muted-foreground text-[10px]'}
              >
                {campaign.is_active ? 'Active' : 'Paused'}
              </Badge>
              {leadCount !== null && (
                <span className="text-muted-foreground">· {leadCount.toLocaleString('en-IN')} leads</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ManageFieldsButton entityType="campaign" size="sm" />
          {hasChanges && (
            <Button onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle>Campaign details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={form.name || ''} onChange={(e) => updateField('name', e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ad set</Label>
                  <Input value={form.ad_set_name || ''} onChange={(e) => updateField('ad_set_name', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ad name</Label>
                  <Input value={form.ad_name || ''} onChange={(e) => updateField('ad_name', e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Platform</Label>
                  <Select value={form.platform} onValueChange={(v) => updateField('platform', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Language</Label>
                  <Select value={form.language || ''} onValueChange={(v) => updateField('language', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" value={form.start_date || ''} onChange={(e) => updateField('start_date', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End date</Label>
                  <Input type="date" value={form.end_date || ''} onChange={(e) => updateField('end_date', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget (₹)</Label>
                  <Input type="number" value={form.budget ?? ''} onChange={(e) => updateField('budget', e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <Label className="text-xs">Active</Label>
                <Switch checked={!!form.is_active} onCheckedChange={(v) => updateField('is_active', v)} />
              </div>
              {/* Custom fields */}
              <DynamicFields
                entityType="campaign"
                values={form.custom_fields || {}}
                onChange={(cf) => updateField('custom_fields', cf)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Assigned groups</CardTitle></CardHeader>
            <CardContent>
              {Array.isArray(campaign.groups) && campaign.groups.length > 0 ? (
                <div className="space-y-1.5">
                  {campaign.groups.map((g) => (
                    <div key={g.id} className="text-xs flex items-center gap-2">
                      <span className="font-medium">{g.name}</span>
                      {g.language && <LanguageBadge language={g.language} size="xs" />}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No groups assigned yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              Leads with a `campaign_name` matching this campaign get auto-linked at ingest time.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
