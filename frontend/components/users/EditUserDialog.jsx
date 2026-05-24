'use client';

import { useEffect, useState } from 'react';
import { Check, Save, AlertCircle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/lib/languages';
import api, { unwrap } from '@/lib/api';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

const ROLE_OPTIONS = [
  { value: 'admin',         label: 'Admin',           superAdminOnly: true },
  { value: 'schema_editor', label: 'Schema editor',   superAdminOnly: true },
  { value: 'floor_manager', label: 'Floor manager' },
  { value: 'senior',        label: 'Senior' },
  { value: 'tele_sales',    label: 'Teleseller' },
  { value: 'back_office',   label: 'Back office' },
  { value: 'auditor',       label: 'Auditor' },
  { value: 'custom',        label: 'Custom (per-user permissions)' },
];

/**
 * Edit an existing user. Loads `/users/:id` on open, allows changing
 * first_name / last_name / role / languages / custom_fields, then
 * PATCHes the diff. Languages are required for tele_sales / senior.
 *
 * Trigger from any users-list row action — pass the user object (or just
 * its id) plus an `onSaved` callback to refresh the caller's list.
 */
export default function EditUserDialog({ open, onOpenChange, user, currentUserRole, onSaved }) {
  const isSuperAdmin = currentUserRole === 'super_admin';
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    setLoading(true);
    api.get(`/users/${user.id}`)
      .then((r) => {
        const u = unwrap(r) || user;
        setForm({
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          email: u.email || '',
          role: u.role,
          languages: u.languages || [],
          custom_fields: u.custom_fields || {},
        });
      })
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load user'))
      .finally(() => setLoading(false));
  }, [open, user?.id]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleLang = (lang) => setForm((p) => ({
    ...p,
    languages: (p.languages || []).includes(lang)
      ? p.languages.filter((l) => l !== lang)
      : [...(p.languages || []), lang],
  }));

  const requiresLang = ['tele_sales', 'senior'].includes(form.role);
  const visibleRoles = ROLE_OPTIONS.filter((r) => isSuperAdmin || !r.superAdminOnly);

  const save = async () => {
    if (!form.first_name || !form.last_name) {
      toast.error('First and last name are required');
      return;
    }
    if (requiresLang && (!form.languages || form.languages.length === 0)) {
      toast.error('At least one language is required for this role');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, form);
      toast.success(`${form.first_name} ${form.last_name} updated`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle>Edit {form.first_name || user.first_name} {form.last_name || user.last_name}</DialogTitle>
              <DialogDescription>
                Changes save immediately. Role + language changes affect future round-robin only.
              </DialogDescription>
            </div>
            <ManageFieldsButton entityType="user" size="sm" />
          </div>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First name</Label>
                <Input value={form.first_name || ''} onChange={(e) => setF('first_name', e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last name</Label>
                <Input value={form.last_name || ''} onChange={(e) => setF('last_name', e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email || ''} onChange={(e) => setF('email', e.target.value.toLowerCase())} className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role || ''} onValueChange={(v) => setF('role', v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {visibleRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSuperAdmin && (
                <p className="text-[10px] text-muted-foreground">
                  Only super admins can change role to admin or schema editor.
                </p>
              )}
            </div>

            {requiresLang && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  Languages spoken
                  <span className="text-[9px] text-red-500 dark:text-red-400">Required</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map((l) => {
                    const sel = (form.languages || []).includes(l.value);
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => toggleLang(l.value)}
                        className={cn(
                          'inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border transition-colors',
                          sel
                            ? 'bg-purple-500/15 border-purple-500/50 text-purple-700 dark:text-purple-300 font-medium'
                            : 'bg-transparent border-border hover:bg-muted text-muted-foreground',
                        )}
                      >
                        {sel && <Check className="h-3 w-3" />}
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom fields */}
            <DynamicFields
              entityType="user"
              values={form.custom_fields || {}}
              onChange={(cf) => setF('custom_fields', cf)}
            />

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                Reassignments and role changes are audit-logged. Existing assigned leads stay where they are.
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
