'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check, AlertCircle, ArrowLeft, ChevronRight, Shield, Phone,
  Headphones, Archive, UserCog, UserPlus,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/lib/languages';
import { useStore } from '@/store/useStore';
import api, { unwrap } from '@/lib/api';

// Each "profile" is one bucket the creator picks in step 1. The `role` field is
// what we actually persist on the User. Admins can't create admins.
const PROFILES = [
  {
    id: 'admin',
    role: 'admin',
    title: 'Admin',
    blurb: 'Full management access. Just needs credentials.',
    icon: Shield,
    color: 'purple',
    superAdminOnly: true,
  },
  {
    id: 'tele_sales',
    role: 'tele_sales',
    title: 'Teleseller',
    blurb: 'Works leads in a specific language. Round-robin assigned.',
    icon: Phone,
    color: 'emerald',
  },
  {
    id: 'senior',
    role: 'senior',
    title: 'Senior',
    blurb: 'Handles leads who opened an ARK account directly in the app (no campaign).',
    icon: Headphones,
    color: 'blue',
  },
  {
    id: 'back_office',
    role: 'back_office',
    title: 'Back Office',
    blurb: 'Read-only access for operations + reporting.',
    icon: Archive,
    color: 'slate',
  },
  {
    id: 'custom',
    role: 'custom',
    title: 'Other (Custom)',
    blurb: 'Hand-pick exactly which permissions this user gets.',
    icon: UserCog,
    color: 'amber',
  },
];

const LEVEL_LABEL = {
  none: 'No access',
  read: 'Read only',
  own: 'Own records',
  group: 'Group scope',
  all: 'Full access',
};

const COLOR_BG = {
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300',
  slate: 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
};

const EMPTY = {
  first_name: '',
  last_name: '',
  email: '',
  password: 'Test@1234',
  languages: [],
  permissions: {}, // permission_key → level, only for custom
};

export default function CreateUserDialog({ open, onOpenChange, onCreated }) {
  const currentUser = useStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const visibleProfiles = useMemo(
    () => PROFILES.filter((p) => isSuperAdmin || !p.superAdminOnly),
    [isSuperAdmin],
  );

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null); // selected profile object
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(1);
    setProfile(null);
    setForm(EMPTY);
  };

  const close = () => {
    if (saving) return;
    onOpenChange(false);
    setTimeout(reset, 200); // allow exit animation to finish
  };

  const goToProfile = (p) => {
    setProfile(p);
    setForm(EMPTY);
    setStep(2);
  };

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
      const grantedCount = Object.values(form.permissions).filter((l) => l && l !== 'none').length;
      if (grantedCount === 0) {
        toast.error('Pick at least one non-"none" permission for a custom user');
        return;
      }
    }

    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      password: form.password,
      role: profile.role,
    };

    if (profile.role === 'tele_sales' || profile.role === 'senior') {
      payload.languages = form.languages;
    }
    if (profile.role === 'custom') {
      payload.permissions = form.permissions;
    }

    setSaving(true);
    try {
      const res = await api.post('/users', payload);
      const created = unwrap(res);
      const name = `${created?.first_name || form.first_name} ${created?.last_name || form.last_name}`.trim();
      toast.success(`Created ${name} (${profile.title})`);
      onCreated?.(created);
      onOpenChange(false);
      setTimeout(reset, 200);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                aria-label="Back to profile picker"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {step === 1 ? 'New user — pick a profile' : `New ${profile?.title || ''}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Different profiles need different details. Pick the one that fits.'
              : profile?.blurb}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <ProfilePicker profiles={visibleProfiles} onPick={goToProfile} />
        ) : (
          <ProfileForm
            profile={profile}
            form={form}
            setForm={setForm}
            saving={saving}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          {step === 2 && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Creating…' : `Create ${profile?.title || 'user'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
function ProfilePicker({ profiles, onPick }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {profiles.map((p) => {
        const Icon = p.icon;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className={cn(
              'text-left rounded-lg border p-3 transition-all',
              'hover:border-foreground/40 hover:bg-muted/30',
              'flex items-start gap-3',
            )}
          >
            <div className={cn(
              'h-9 w-9 rounded-md inline-flex items-center justify-center flex-shrink-0 border',
              COLOR_BG[p.color],
            )}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">{p.title}</p>
                {p.superAdminOnly && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none">
                    Super admin only
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{p.blurb}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 self-center" />
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
function ProfileForm({ profile, form, setForm, saving }) {
  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      <CredentialsBlock form={form} setForm={setForm} disabled={saving} />

      {(profile.role === 'tele_sales' || profile.role === 'senior') && (
        <LanguageBlock form={form} setForm={setForm} role={profile.role} />
      )}

      {profile.role === 'custom' && (
        <PermissionsBlock form={form} setForm={setForm} />
      )}

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs flex gap-2">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          Default password: <code className="font-mono">{form.password}</code>. The user is prompted to change it on first login.
        </div>
      </div>
    </div>
  );
}

function CredentialsBlock({ form, setForm, disabled }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">First name</Label>
          <Input
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            className="h-9 text-sm"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Last name</Label>
          <Input
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            className="h-9 text-sm"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
          className="h-9 text-sm"
          placeholder="agent@thework.ltd"
          disabled={disabled}
        />
      </div>
    </>
  );
}

function LanguageBlock({ form, setForm, role }) {
  const toggle = (lang) => {
    const has = (form.languages || []).includes(lang);
    setForm({
      ...form,
      languages: has
        ? form.languages.filter((l) => l !== lang)
        : [...(form.languages || []), lang],
    });
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1.5">
        Languages spoken
        <Badge variant="outline" className="text-[9px] text-red-600 dark:text-red-400 border-red-500/30 h-4 px-1 leading-none">
          At least 1 required
        </Badge>
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => {
          const selected = (form.languages || []).includes(l.value);
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => toggle(l.value)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1 text-xs rounded-md border transition-colors',
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
      <p className="text-[10px] text-muted-foreground">
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

function PermissionsBlock({ form, setForm }) {
  const [matrix, setMatrix] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/role-permissions');
        setMatrix(unwrap(res) || null);
      } catch {
        toast.error('Failed to load permission catalog');
      } finally {
        setLoadingMatrix(false);
      }
    })();
  }, []);

  const setLevel = (permKey, level) => {
    setForm({
      ...form,
      permissions: { ...form.permissions, [permKey]: level },
    });
  };

  const fillAll = (level) => {
    if (!matrix?.matrix) return;
    const next = { ...form.permissions };
    for (const cat of Object.values(matrix.matrix)) {
      for (const permKey of Object.keys(cat.permissions || {})) {
        next[permKey] = level;
      }
    }
    setForm({ ...form, permissions: next });
  };

  if (loadingMatrix) {
    return (
      <div className="border rounded-lg p-4 text-xs text-muted-foreground">
        Loading permission catalog…
      </div>
    );
  }
  if (!matrix?.matrix) {
    return (
      <div className="border border-red-500/30 rounded-lg p-3 text-xs text-red-600 dark:text-red-400">
        Could not load permissions. The custom user can still be created with no access, but you should grant permissions immediately after.
      </div>
    );
  }

  const categories = Object.entries(matrix.matrix).sort(
    ([, a], [, b]) => (a.meta?.order ?? 99) - (b.meta?.order ?? 99),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          Permissions for this custom user
        </Label>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Quick fill:</span>
          {['none', 'read', 'all'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => fillAll(lvl)}
              className="h-6 px-2 text-[10px] rounded border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {LEVEL_LABEL[lvl]}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg divide-y max-h-[36vh] overflow-y-auto">
        {categories.map(([catKey, cat]) => (
          <div key={catKey} className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
              {cat.meta?.label || catKey}
            </p>
            <div className="space-y-1.5">
              {Object.entries(cat.permissions || {}).map(([permKey, perm]) => {
                const current = form.permissions[permKey] || 'none';
                return (
                  <div key={permKey} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{perm.description || permKey}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{permKey}</p>
                    </div>
                    <Select value={current} onValueChange={(v) => setLevel(permKey, v)}>
                      <SelectTrigger className="h-7 w-32 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(matrix.valid_levels || ['none', 'read', 'own', 'group', 'all']).map((lvl) => (
                          <SelectItem key={lvl} value={lvl} className="text-xs">
                            {LEVEL_LABEL[lvl] || lvl}
                          </SelectItem>
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
      <p className="text-[10px] text-muted-foreground">
        Each permission stored as a per-user override. Editable later from the user's row → Edit permissions.
      </p>
    </div>
  );
}
