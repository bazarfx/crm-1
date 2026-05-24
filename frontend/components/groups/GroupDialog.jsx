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
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LANGUAGES } from '@/lib/languages';
import api, { unwrap } from '@/lib/api';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

/** Create / edit a group. `group=null` for create. */
export default function GroupDialog({ open, onOpenChange, group, onSaved }) {
  const isEdit = !!group?.id;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setForm({
        name: group.name || '',
        type: group.type || 'telesales',
        language: group.language || '',
        description: group.description || '',
        is_active: group.is_active !== false,
        custom_fields: group.custom_fields || {},
      });
    } else {
      setForm({
        name: '', type: 'telesales', language: '', description: '',
        is_active: true, custom_fields: {},
      });
    }
  }, [open, group, isEdit]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/groups/${group.id}`, form);
      } else {
        const res = await api.post('/groups', form);
        unwrap(res);
      }
      toast.success(isEdit ? 'Group updated' : 'Group created');
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
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle>{isEdit ? `Edit ${form.name || 'group'}` : 'New group'}</DialogTitle>
              <DialogDescription>
                Groups route language-tagged leads to a pool of telesellers or seniors via round robin.
              </DialogDescription>
            </div>
            <ManageFieldsButton entityType="group" size="sm" />
          </div>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name || ''} onChange={(e) => setF('name', e.target.value)} className="h-9 text-sm" placeholder="Tamil Team" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setF('type', v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telesales">Telesales (lead handlers)</SelectItem>
                  <SelectItem value="senior">Senior (direct-ARK)</SelectItem>
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

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setF('description', e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Who's in this group? What's it for?"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Label className="text-xs">Active</Label>
            <Switch checked={!!form.is_active} onCheckedChange={(v) => setF('is_active', v)} />
          </div>

          <DynamicFields
            entityType="group"
            values={form.custom_fields || {}}
            onChange={(cf) => setF('custom_fields', cf)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
