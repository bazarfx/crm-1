'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Shield, Users, BarChart3, Bell, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export default function SettingsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      <SettingsContent />
    </RoleGuard>
  );
}

const CATEGORY_META = {
  assignment: {
    label: 'Lead assignment',
    icon: Users,
    description: 'Control how leads are distributed to telesellers',
  },
  display: {
    label: 'Display',
    icon: BarChart3,
    description: 'UI and display preferences',
  },
  general: {
    label: 'General',
    icon: SlidersHorizontal,
    description: 'General CRM behavior',
  },
  notifications: {
    label: 'Notifications',
    icon: Bell,
    description: 'Toast and alert preferences',
  },
  system: {
    label: 'System (super admin only)',
    icon: Shield,
    description: 'Core system switches — use with caution',
  },
};

function SettingsContent() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const user = useStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    api
      .get('/settings')
      .then((r) => setSettings(unwrap(r) || {}))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  /** Update a single setting and patch local state in place (preserves order). */
  const updateSetting = async (key, value) => {
    setSaving(key);
    try {
      await api.patch(`/settings/${encodeURIComponent(key)}`, { value });
      setSettings((prev) => {
        const next = {};
        for (const [cat, rows] of Object.entries(prev)) {
          next[cat] = rows.map((s) => (s.key === key ? { ...s, value } : s));
        }
        return next;
      });
      toast.success('Setting saved');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save setting');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading settings…</div>;
  }

  const visibleCategories = Object.entries(CATEGORY_META).filter(([cat]) => {
    const rows = settings[cat] || [];
    if (!rows.length) return false;
    if (cat === 'system' && !isSuperAdmin) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage how the CRM assigns leads and behaves
        </p>
      </div>

      {visibleCategories.map(([cat, meta]) => {
        const rows = settings[cat] || [];
        const Icon = meta.icon;
        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {meta.label}
              </CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {rows.map((row, i) => (
                <div key={row.key || row.id || i}>
                  <SettingRow
                    setting={row}
                    saving={saving === row.key}
                    isSuperAdmin={isSuperAdmin}
                    onChange={(v) => updateSetting(row.key, v)}
                  />
                  {i < rows.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {visibleCategories.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No settings configured yet. Settings will appear once they are seeded by the backend.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Dynamic row renderer — picks the right input based on value shape
 * ------------------------------------------------------------------ */
function SettingRow({ setting, saving, isSuperAdmin, onChange }) {
  const value = setting.value;
  const isSystemOnly = !setting.is_editable_by_admin;
  const lockedForRole = !isSuperAdmin && isSystemOnly;

  // Object value with `enabled` → toggle
  if (value && typeof value === 'object' && 'enabled' in value) {
    return (
      <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
        <Switch
          checked={!!value.enabled}
          onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
          disabled={saving || lockedForRole}
        />
      </Row>
    );
  }

  // Specific keys with enumerated options
  if (setting.key === 'assignment.mode' && value && typeof value === 'object') {
    return (
      <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
        <Select
          value={value.mode}
          onValueChange={(v) => onChange({ ...value, mode: v })}
          disabled={saving || lockedForRole}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="round_robin">Round robin</SelectItem>
            <SelectItem value="manual">Manual only</SelectItem>
            <SelectItem value="language_first">Language first</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    );
  }

  if (setting.key === 'assignment.duplicate_action' && value && typeof value === 'object') {
    return (
      <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
        <Select
          value={value.action}
          onValueChange={(v) => onChange({ ...value, action: v })}
          disabled={saving || lockedForRole}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">Skip duplicate</SelectItem>
            <SelectItem value="reassign_to_owner">Reassign to original assignee</SelectItem>
            <SelectItem value="create_new">Create new lead</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    );
  }

  // Object value with a single numeric key (limit/count/seconds/minutes/days/value)
  if (value && typeof value === 'object') {
    const numKey = ['limit', 'count', 'seconds', 'minutes', 'days', 'value'].find(
      (k) => typeof value[k] === 'number'
    );
    if (numKey) {
      return (
        <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
          <Input
            type="number"
            className="w-28 text-right"
            defaultValue={value[numKey]}
            disabled={saving || lockedForRole}
            onBlur={(e) =>
              onChange({ ...value, [numKey]: parseInt(e.target.value, 10) || 0 })
            }
          />
        </Row>
      );
    }
  }

  // Object value with a string `value` field
  if (value && typeof value === 'object' && typeof value.value === 'string') {
    return (
      <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
        <Input
          className="w-48"
          defaultValue={value.value}
          disabled={saving || lockedForRole}
          onBlur={(e) => onChange({ ...value, value: e.target.value })}
        />
      </Row>
    );
  }

  // Bare primitive — show read-only
  return (
    <Row label={setting.label} description={setting.description} systemOnly={isSystemOnly}>
      <span className="text-xs font-mono text-muted-foreground">
        {value === null || value === undefined ? '—' : JSON.stringify(value)}
      </span>
    </Row>
  );
}

function Row({ label, description, systemOnly, children }) {
  return (
    <div className="flex items-start justify-between py-4 gap-4">
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm font-medium">{label}</Label>
          {systemOnly && (
            <Badge
              variant="outline"
              className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30"
            >
              super admin only
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
