'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check, Save, AlertCircle, Mail, Loader2, UserCog, Languages as LangIcon, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/lib/languages';
import { fetchRoles } from '@/lib/roles';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';

// Used until /roles resolves, and as a hard fallback if it fails.
const FALLBACK_ROLE_OPTIONS = [
  { value: 'admin',         label: 'Admin',           superAdminOnly: true },
  { value: 'schema_editor', label: 'Schema editor',   superAdminOnly: true },
  { value: 'floor_manager', label: 'Floor manager' },
  { value: 'senior',        label: 'Senior' },
  { value: 'tele_sales',    label: 'Teleseller' },
  { value: 'back_office',   label: 'Back office' },
  { value: 'auditor',       label: 'Auditor' },
  { value: 'custom',        label: 'Custom (per-user permissions)' },
];

// System roles only super_admins may assign.
const SUPER_ADMIN_ONLY_ROLES = ['admin', 'schema_editor', 'super_admin'];

export default function EditUserPage() {
  const params = useParams();
  const id = params?.id;
  return (
    <RoleGuard allow={['super_admin', 'admin']}>
      <EditUserContent id={id} />
    </RoleGuard>
  );
}

function EditUserContent({ id }) {
  const router = useRouter();
  const currentUser = useStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [roleOptions, setRoleOptions] = useState(FALLBACK_ROLE_OPTIONS);

  // Dynamic role list — includes any custom roles created in the role tree.
  useEffect(() => {
    let alive = true;
    fetchRoles()
      .then((list) => {
        if (!alive || !Array.isArray(list) || list.length === 0) return;
        const opts = list
          .filter((r) => r.is_assignable && r.key !== 'super_admin')
          .map((r) => ({
            value: r.key,
            label: r.name,
            superAdminOnly: SUPER_ADMIN_ONLY_ROLES.includes(r.key),
          }));
        if (opts.length) setRoleOptions(opts);
      })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/users/${id}`)
      .then((r) => {
        if (!alive) return;
        const u = unwrap(r) || {};
        setDisplayName(`${u.first_name || ''} ${u.last_name || ''}`.trim());
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
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleLang = (lang) => setForm((p) => ({
    ...p,
    languages: (p.languages || []).includes(lang)
      ? p.languages.filter((l) => l !== lang)
      : [...(p.languages || []), lang],
  }));

  const requiresLang = ['tele_sales', 'senior'].includes(form?.role);
  let visibleRoles = roleOptions.filter((r) => isSuperAdmin || !r.superAdminOnly);
  // Always keep the user's current role selectable even if it's normally hidden
  // (e.g. an admin editing a super_admin-only role), so the Select isn't blank.
  if (form?.role && !visibleRoles.some((r) => r.value === form.role)) {
    const cur = roleOptions.find((r) => r.value === form.role);
    visibleRoles = [...visibleRoles, cur || { value: form.role, label: form.role.replace(/_/g, ' ') }];
  }

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
      await api.patch(`/users/${id}`, form);
      toast.success(`${form.first_name} ${form.last_name} updated`);
      router.push('/users');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={UserCog}
        title={loading ? 'Edit user' : `Edit ${displayName || 'user'}`}
        parent="Users"
        parentHref="/users"
        backHref="/users"
        actions={(
          <>
            <ManageFieldsButton entityType="user" label="Fields" size="sm" />
            <Button variant="outline" size="sm" onClick={() => router.push('/users')} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )}
      />

      {loading || !form ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <FormPageBody>
          <p className="text-sm text-muted-foreground -mb-1">
            Changes save immediately. Role + language changes affect future round-robin only.
          </p>

          <FormSection icon={Mail} title="Identity" description="Name and sign-in email.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="First name" required>
                <Input value={form.first_name} onChange={(e) => setF('first_name', e.target.value)} />
              </Field>
              <Field label="Last name" required>
                <Input value={form.last_name} onChange={(e) => setF('last_name', e.target.value)} />
              </Field>
              <Field label="Email" className="sm:col-span-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="email" value={form.email} onChange={(e) => setF('email', e.target.value.toLowerCase())} className="pl-9" />
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection icon={ShieldCheck} title="Role" description="What this user can do across the CRM.">
            <Field label="Role" hint={!isSuperAdmin ? 'Admin / schema editor are super-admin only' : undefined}>
              <Select value={form.role || ''} onValueChange={(v) => setF('role', v)}>
                <SelectTrigger className="h-10 max-w-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {visibleRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          {requiresLang && (
            <FormSection icon={LangIcon} title="Languages spoken" description="Drives round-robin assignment for this user.">
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => {
                  const sel = (form.languages || []).includes(l.value);
                  return (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => toggleLang(l.value)}
                      className={cn(
                        'inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border transition-colors',
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
              {(form.languages || []).length === 0 && (
                <p className="text-[11px] text-red-500 dark:text-red-400 mt-2">Select at least one language.</p>
              )}
            </FormSection>
          )}

          <FormSection icon={UserCog} title="Custom fields" description="Organisation-specific fields defined by your admins.">
            <DynamicFields
              entityType="user"
              values={form.custom_fields || {}}
              onChange={(cf) => setF('custom_fields', cf)}
              hideEmptySections
            />
          </FormSection>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>Reassignments and role changes are audit-logged. Existing assigned leads stay where they are.</div>
          </div>
        </FormPageBody>
      )}
    </div>
  );
}
