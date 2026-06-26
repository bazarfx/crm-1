'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, Phone, Headphones, Archive, UserCog, ChevronRight, Check,
  AlertCircle, UserPlus, Mail, Loader2, KeyRound, Users as UsersIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

const PROFILES = [
  {
    id: 'admin', role: 'admin', title: 'Admin',
    blurb: 'Full management access. Just needs credentials.',
    icon: Shield, color: 'purple', superAdminOnly: true,
  },
  {
    id: 'tele_sales', role: 'tele_sales', title: 'Teleseller',
    blurb: 'Works leads in a specific language. Round-robin assigned.',
    icon: Phone, color: 'emerald',
  },
  {
    id: 'senior', role: 'senior', title: 'Senior',
    blurb: 'Handles leads who opened an ARK account directly in the app (no campaign).',
    icon: Headphones, color: 'blue',
  },
  {
    id: 'back_office', role: 'back_office', title: 'Back Office',
    blurb: 'Read-only access for operations + reporting.',
    icon: Archive, color: 'slate',
  },
  {
    id: 'custom', role: 'custom', title: 'Other (Custom)',
    blurb: 'Hand-pick exactly which permissions this user gets.',
    icon: UserCog, color: 'amber',
  },
];

const LEVEL_LABEL = {
  none: 'No access', read: 'Read only', own: 'Own records',
  group: 'Group scope', all: 'Full access',
};

const COLOR_BG = {
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300',
  slate: 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
};

const EMPTY = {
  first_name: '', last_name: '', email: '', password: 'Test@1234',
  languages: [], permissions: {}, custom_fields: {},
};

export default function NewUserPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin']}>
      <NewUserContent />
    </RoleGuard>
  );
}

function NewUserContent() {
  const router = useRouter();
  const currentUser = useStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const visibleProfiles = useMemo(
    () => PROFILES.filter((p) => isSuperAdmin || !p.superAdminOnly),
    [isSuperAdmin],
  );

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [customRoles, setCustomRoles] = useState([]);

  // Custom roles (created in the role tree) become extra pickable profiles.
  useEffect(() => {
    let alive = true;
    fetchRoles()
      .then((list) => {
        if (!alive || !Array.isArray(list)) return;
        setCustomRoles(
          list.filter((r) => !r.is_system && r.is_assignable && r.show_in_tree && r.key !== 'custom'),
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const pick = (p) => { setProfile(p); setForm(EMPTY); };
  const pickCustomRole = (r) => pick({
    id: r.key, role: r.key, title: r.name,
    blurb: r.description || 'Custom role with hand-tuned permissions.',
    icon: UserCog, color: 'amber', dynamic: true,
  });

  const handleSave = async () => {
    if (!profile) return;
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error('Name and email are required');
      return;
    }
    if (profile.role === 'tele_sales' || profile.role === 'senior') {
      if (!Array.isArray(form.languages) || form.languages.length === 0) {
        toast.error('Select at least one language');
        return;
      }
    }
    if (profile.role === 'custom') {
      const granted = Object.values(form.permissions).filter((l) => l && l !== 'none').length;
      if (granted === 0) {
        toast.error('Pick at least one non-"none" permission for a custom user');
        return;
      }
    }

    const payload = {
      first_name: form.first_name, last_name: form.last_name,
      email: form.email, password: form.password, role: profile.role,
    };
    if (profile.role === 'tele_sales' || profile.role === 'senior') payload.languages = form.languages;
    if (profile.role === 'custom') payload.permissions = form.permissions;
    if (form.custom_fields && Object.keys(form.custom_fields).length > 0) payload.custom_fields = form.custom_fields;

    setSaving(true);
    try {
      const res = await api.post('/users', payload);
      const created = unwrap(res);
      const name = `${created?.first_name || form.first_name} ${created?.last_name || form.last_name}`.trim();
      toast.success(`Created ${name} (${profile.title})`);
      router.push('/users');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 1: profile picker ────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="-mt-4 lg:-mt-6">
        <FormPageHeader
          icon={UserPlus}
          title="Pick a profile"
          parent="Users"
          parentHref="/users"
          backHref="/users"
        />
        <FormPageBody width="max-w-4xl">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New user — pick a profile</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Different profiles need different details. Pick the one that fits.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleProfiles.map((p) => (
              <ProfileCard key={p.id} profile={p} onClick={() => pick(p)} />
            ))}
          </div>

          {customRoles.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Custom roles</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customRoles.map((r) => (
                  <ProfileCard
                    key={r.id}
                    profile={{ id: r.key, title: r.name, blurb: r.description || 'Custom role.', icon: UserCog, color: 'amber' }}
                    onClick={() => pickCustomRole(r)}
                  />
                ))}
              </div>
            </div>
          )}
        </FormPageBody>
      </div>
    );
  }

  // ── Step 2: the form ──────────────────────────────────────────────────
  const Icon = profile.icon;
  const needsLanguages = profile.role === 'tele_sales' || profile.role === 'senior';

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={Icon}
        title={`New ${profile.title}`}
        parent="Users"
        parentHref="/users"
        onBack={() => setProfile(null)}
        badge={profile.superAdminOnly && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 leading-none">Super admin only</Badge>
        )}
        actions={(
          <>
            <ManageFieldsButton entityType="user" label="Fields" size="sm" />
            <Button variant="outline" size="sm" onClick={() => setProfile(null)} disabled={saving}>
              Change profile
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Creating…' : `Create ${profile.title}`}
            </Button>
          </>
        )}
      />

      <FormPageBody>
        <p className="text-sm text-muted-foreground -mb-1">{profile.blurb}</p>

        <FormSection icon={Mail} title="Credentials" description="The account's sign-in details.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <Field label="First name" required>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} disabled={saving} />
            </Field>
            <Field label="Last name" required>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} disabled={saving} />
            </Field>
            <Field label="Email" required className="sm:col-span-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                  className="pl-9"
                  placeholder="agent@thework.ltd"
                  disabled={saving}
                />
              </div>
            </Field>
          </div>
          <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs flex gap-2">
            <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              Default password: <code className="font-mono font-medium">{form.password}</code>. The user is prompted to change it on first login.
            </div>
          </div>
        </FormSection>

        {needsLanguages && (
          <FormSection icon={UsersIcon} title="Languages spoken" description="Drives round-robin assignment for this user.">
            <LanguageBlock form={form} setForm={setForm} role={profile.role} />
          </FormSection>
        )}

        {profile.role === 'custom' && (
          <PermissionsSection form={form} setForm={setForm} />
        )}

        <FormSection icon={UserCog} title="Custom fields" description="Organisation-specific fields defined by your admins.">
          <DynamicFields
            entityType="user"
            values={form.custom_fields || {}}
            onChange={(cf) => setForm((p) => ({ ...p, custom_fields: cf }))}
            hideEmptySections
          />
        </FormSection>
      </FormPageBody>
    </div>
  );
}

function ProfileCard({ profile, onClick }) {
  const Icon = profile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group text-left rounded-xl border bg-card p-5 transition-all shadow-sm',
        'hover:border-foreground/30 hover:shadow-md hover:-translate-y-0.5',
        'flex items-start gap-4',
      )}
    >
      <div className={cn('h-11 w-11 rounded-lg inline-flex items-center justify-center flex-shrink-0 border', COLOR_BG[profile.color] || COLOR_BG.slate)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{profile.title}</p>
          {profile.superAdminOnly && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none">Super admin only</Badge>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground mt-1 leading-snug">{profile.blurb}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 self-center transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function LanguageBlock({ form, setForm, role }) {
  const toggle = (lang) => {
    const has = (form.languages || []).includes(lang);
    setForm({
      ...form,
      languages: has ? form.languages.filter((l) => l !== lang) : [...(form.languages || []), lang],
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => {
          const selected = (form.languages || []).includes(l.value);
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => toggle(l.value)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border transition-colors',
                selected
                  ? 'bg-purple-500/15 border-purple-500/50 text-purple-700 dark:text-purple-300 font-medium'
                  : 'bg-transparent border-border hover:bg-muted text-muted-foreground',
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {l.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {role === 'senior'
          ? 'Direct-ARK leads in any of these languages will round-robin to this senior.'
          : 'Campaign leads in any of these languages will round-robin to this teleseller.'}
        {(form.languages || []).length === 0 && (
          <span className="text-red-500 dark:text-red-400"> Select at least one.</span>
        )}
      </p>
    </div>
  );
}

function PermissionsSection({ form, setForm }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/role-permissions');
        setMatrix(unwrap(res) || null);
      } catch {
        toast.error('Failed to load permission catalog');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setLevel = (permKey, level) =>
    setForm((p) => ({ ...p, permissions: { ...p.permissions, [permKey]: level } }));

  const fillAll = (level) => {
    if (!matrix?.matrix) return;
    setForm((p) => {
      const next = { ...p.permissions };
      for (const cat of Object.values(matrix.matrix)) {
        for (const permKey of Object.keys(cat.permissions || {})) next[permKey] = level;
      }
      return { ...p, permissions: next };
    });
  };

  const grantedCount = Object.values(form.permissions).filter((l) => l && l !== 'none').length;

  const headerExtras = (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Quick fill:</span>
      {['none', 'read', 'all'].map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => fillAll(lvl)}
          className="h-7 px-2.5 text-[11px] rounded-md border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {LEVEL_LABEL[lvl]}
        </button>
      ))}
    </div>
  );

  return (
    <FormSection
      icon={UserPlus}
      title="Permissions for this custom user"
      description="Each permission is stored as a per-user override — editable later from the user's row."
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <Badge variant="outline" className={cn('text-[10px]', grantedCount > 0 ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')}>
          {grantedCount} granted
        </Badge>
        {headerExtras}
      </div>

      {loading ? (
        <div className="rounded-lg border p-6 text-center text-xs text-muted-foreground">Loading permission catalog…</div>
      ) : !matrix?.matrix ? (
        <div className="rounded-lg border border-red-500/30 p-3 text-xs text-red-600 dark:text-red-400">
          Could not load permissions. The custom user can still be created with no access; grant permissions immediately after.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(matrix.matrix)
            .sort(([, a], [, b]) => (a.meta?.order ?? 99) - (b.meta?.order ?? 99))
            .map(([catKey, cat]) => (
              <div key={catKey}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                  {cat.meta?.label || catKey}
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {Object.entries(cat.permissions || {}).map(([permKey, perm]) => {
                    const current = form.permissions[permKey] || 'none';
                    const active = current !== 'none';
                    return (
                      <div
                        key={permKey}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors',
                          active ? 'border-primary/30 bg-primary/[0.03]' : 'bg-card',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{perm.description || permKey}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{permKey}</p>
                        </div>
                        <Select value={current} onValueChange={(v) => setLevel(permKey, v)}>
                          <SelectTrigger className="h-8 w-32 text-[11px] flex-shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(matrix.valid_levels || ['none', 'read', 'own', 'group', 'all']).map((lvl) => (
                              <SelectItem key={lvl} value={lvl} className="text-xs">{LEVEL_LABEL[lvl] || lvl}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </FormSection>
  );
}
