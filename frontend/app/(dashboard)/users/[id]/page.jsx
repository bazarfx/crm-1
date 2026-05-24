'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Mail, Phone, Languages as LanguagesIcon, AlertCircle,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { LanguageList, LanguageBadge } from '@/components/shared/LanguageBadge';
import { LANGUAGES } from '@/lib/languages';
import useStore from '@/store/useStore';
import { cn } from '@/lib/utils';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';

const ROLE_OPTIONS = [
  { value: 'admin',         label: 'Admin',         superAdminOnly: true },
  { value: 'schema_editor', label: 'Schema editor', superAdminOnly: true },
  { value: 'floor_manager', label: 'Floor manager' },
  { value: 'senior',        label: 'Senior' },
  { value: 'tele_sales',    label: 'Teleseller' },
  { value: 'back_office',   label: 'Back office' },
  { value: 'auditor',       label: 'Auditor' },
  { value: 'custom',        label: 'Custom (per-user permissions)' },
];

export default function UserDetailPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager', 'auditor', 'back_office']}>
      <UserDetailContent />
    </RoleGuard>
  );
}

function UserDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user: currentUser } = useStore();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdminOrAbove = isSuperAdmin || currentUser?.role === 'admin';

  const [user, setUser] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // Prefer the with-fields envelope so we get cf metadata in one call.
    api.get(`/users/${id}/with-fields`)
      .then((r) => {
        const u = unwrap(r);
        setUser(u);
        setForm({
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          email: u.email || '',
          role: u.role,
          languages: u.languages || [],
          custom_fields: u.custom_fields || {},
          is_active: u.is_active !== false,
        });
      })
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load user'))
      .finally(() => setLoading(false));
  }, [id]);

  const updateField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setHasChanges(true);
  };
  const toggleLang = (lang) => {
    const next = (form.languages || []).includes(lang)
      ? form.languages.filter((l) => l !== lang)
      : [...(form.languages || []), lang];
    updateField('languages', next);
  };

  const canEdit = isAdminOrAbove;
  const requiresLang = ['tele_sales', 'senior'].includes(form.role);

  const save = async () => {
    if (requiresLang && (!form.languages || form.languages.length === 0)) {
      toast.error('At least one language is required for this role');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch(`/users/${id}`, form);
      const updated = unwrap(res);
      setUser(updated);
      setForm({
        first_name: updated.first_name || '',
        last_name: updated.last_name || '',
        email: updated.email || '',
        role: updated.role,
        languages: updated.languages || [],
        custom_fields: updated.custom_fields || {},
        is_active: updated.is_active !== false,
      });
      setHasChanges(false);
      toast.success('User updated');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground p-6">Loading…</p>;
  }
  if (!user) {
    return <p className="text-sm text-muted-foreground p-6">User not found.</p>;
  }

  const visibleRoles = ROLE_OPTIONS.filter((r) => isSuperAdmin || !r.superAdminOnly);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/users')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              {user.first_name} {user.last_name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="capitalize">{user.role?.replace(/_/g, ' ')}</span>
              {user.email && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
                </>
              )}
              <Badge variant="outline" className={cn(
                'text-[10px]',
                user.is_active
                  ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'text-red-600 dark:text-red-400 border-red-500/30',
              )}>
                {user.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ManageFieldsButton entityType="user" size="sm" />
          {canEdit && hasChanges && (
            <Button onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First name</Label>
                <Input value={form.first_name || ''} onChange={(e) => updateField('first_name', e.target.value)} disabled={!canEdit} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last name</Label>
                <Input value={form.last_name || ''} onChange={(e) => updateField('last_name', e.target.value)} disabled={!canEdit} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email || ''} onChange={(e) => updateField('email', e.target.value.toLowerCase())} disabled={!canEdit} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={form.role || ''} onValueChange={(v) => updateField('role', v)} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {visibleRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requiresLang && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <LanguagesIcon className="h-3 w-3" /> Languages
                    <span className="text-[9px] text-red-500 dark:text-red-400">Required</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map((l) => {
                      const sel = (form.languages || []).includes(l.value);
                      return (
                        <button
                          key={l.value}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleLang(l.value)}
                          className={cn(
                            'px-3 py-1 text-xs rounded border transition-colors',
                            sel
                              ? 'bg-purple-500/15 border-purple-500/50 text-purple-700 dark:text-purple-300 font-medium'
                              : 'bg-transparent border-border hover:bg-muted text-muted-foreground',
                            !canEdit && 'opacity-60 cursor-not-allowed',
                          )}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom fields render inline next to native ones. */}
              <div className="sm:col-span-2">
                <DynamicFields
                  entityType="user"
                  values={form.custom_fields || {}}
                  onChange={(cf) => updateField('custom_fields', cf)}
                  disabled={!canEdit}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Languages</CardTitle></CardHeader>
            <CardContent>
              <LanguageList languages={user.languages} />
            </CardContent>
          </Card>

          {!canEdit && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                You don&apos;t have permission to edit this user. Floor managers + admins can.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
