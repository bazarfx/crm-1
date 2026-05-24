'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LANGUAGES } from '@/lib/languages';
import api, { unwrap } from '@/lib/api';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

/**
 * Single component used for both create and edit. Pass `campaign={null}`
 * for create; pass an existing object for edit. Backend cf integration
 * is done — payload flows through processIncomingCustomFields.
 */
export default function CampaignDialog({ open, onOpenChange, campaign, onSaved }) {
  const isEdit = !!campaign?.id;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setForm({
        name: campaign.name || '',
        ad_set_name: campaign.ad_set_name || '',
        ad_name: campaign.ad_name || '',
        platform: campaign.platform || 'facebook',
        language: campaign.language || '',
        is_active: campaign.is_active !== false,
        start_date: campaign.start_date ? String(campaign.start_date).slice(0, 10) : '',
        end_date: campaign.end_date ? String(campaign.end_date).slice(0, 10) : '',
        budget: campaign.budget ?? '',
        custom_fields: campaign.custom_fields || {},
      });
    } else {
      setForm({
        name: '', ad_set_name: '', ad_name: '',
        platform: 'facebook', language: '', is_active: true,
        start_date: '', end_date: '', budget: '',
        custom_fields: {},
      });
    }
  }, [open, campaign, isEdit]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        budget: form.budget === '' ? null : Number(form.budget),
      };
      if (isEdit) {
        await api.patch(`/campaigns/${campaign.id}`, payload);
      } else {
        const res = await api.post('/campaigns', payload);
        unwrap(res);
      }
      toast.success(isEdit ? 'Campaign updated' : 'Campaign created');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle>{isEdit ? `Edit ${form.name || 'campaign'}` : 'New campaign'}</DialogTitle>
              <DialogDescription>
                Campaign metadata + custom fields. Leads with a matching `campaign_name` at ingest get linked here.
              </DialogDescription>
            </div>
            <ManageFieldsButton entityType="campaign" size="sm" />
          </div>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name || ''} onChange={(e) => setF('name', e.target.value)} className="h-9 text-sm" placeholder="TK | Tamil-L.F-Post | 20 MAY" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ad set</Label>
              <Input value={form.ad_set_name || ''} onChange={(e) => setF('ad_set_name', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ad name</Label>
              <Input value={form.ad_name || ''} onChange={(e) => setF('ad_name', e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setF('platform', v)}>
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
              <Select value={form.language || ''} onValueChange={(v) => setF('language', v)}>
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
              <Input type="date" value={form.start_date || ''} onChange={(e) => setF('start_date', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={form.end_date || ''} onChange={(e) => setF('end_date', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Budget (₹)</Label>
              <Input type="number" value={form.budget ?? ''} onChange={(e) => setF('budget', e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Label className="text-xs">Active</Label>
            <Switch checked={!!form.is_active} onCheckedChange={(v) => setF('is_active', v)} />
          </div>

          {/* Custom fields */}
          <DynamicFields
            entityType="campaign"
            values={form.custom_fields || {}}
            onChange={(cf) => setF('custom_fields', cf)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
