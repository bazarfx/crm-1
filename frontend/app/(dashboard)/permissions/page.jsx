'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, RotateCcw, Copy, Lock, AlertTriangle,
  Users, FlaskConical, UserCog, FolderOpen, Megaphone, BarChart3,
  Settings as SettingsIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { cn } from '@/lib/utils';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function PermissionsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin']}>
      <PermissionsContent />
    </RoleGuard>
  );
}

const CATEGORY_ICONS = {
  leads: Users,
  trial_leads: FlaskConical,
  users: UserCog,
  groups: FolderOpen,
  campaigns: Megaphone,
  reports: BarChart3,
  settings: SettingsIcon,
  system: Shield,
};

const ROLE_PILL = {
  super_admin:   'text-red-500 dark:text-red-400 bg-red-500/10 border-red-500/30',
  admin:         'text-purple-500 dark:text-purple-400 bg-purple-500/10 border-purple-500/30',
  floor_manager: 'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  senior:        'text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
  tele_sales:    'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  back_office:   'text-slate-500 dark:text-slate-400 bg-slate-500/10 border-slate-500/30',
  auditor:       'text-teal-500 dark:text-teal-400 bg-teal-500/10 border-teal-500/30',
  archive:       'text-gray-500 dark:text-gray-400 bg-gray-500/10 border-gray-500/30',
};

const LEVEL_TINT = {
  all:   'text-emerald-600 dark:text-emerald-400',
  own:   'text-amber-600 dark:text-amber-400',
  group: 'text-blue-600 dark:text-blue-400',
  read:  'text-teal-600 dark:text-teal-400',
  none:  'text-muted-foreground',
};

function PermissionsContent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({ from_role: 'admin', to_role: 'floor_manager' });
  const [resetRole, setResetRole] = useState('all');
  const fetchPermissions = useStore((s) => s.fetchPermissions);

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const res = await api.get('/role-permissions');
      setData(unwrap(res));
    } catch (e) {
      toast.error('Failed to load permissions matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix();
  }, []);

  const updateCell = async (role, permission_key, level) => {
    if (data?.non_editable_roles?.includes(role)) {
      toast.error('This role is locked');
      return;
    }
    const cellKey = `${role}:${permission_key}`;
    setSaving(cellKey);
    try {
      await api.patch(
        `/role-permissions/${encodeURIComponent(role)}/${encodeURIComponent(permission_key)}`,
        { level }
      );
      setData((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const cat of Object.values(next.matrix || {})) {
          const perm = cat.permissions?.[permission_key];
          if (perm) perm.roles[role] = level;
        }
        return next;
      });
      toast.success('Updated', { duration: 1500 });
      fetchPermissions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(null);
    }
  };

  const handleCopy = async () => {
    try {
      await api.post('/role-permissions/copy', copyForm);
      toast.success(`Copied ${copyForm.from_role} → ${copyForm.to_role}`);
      setCopyDialogOpen(false);
      loadMatrix();
      fetchPermissions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Copy failed');
    }
  };

  const handleReset = async () => {
    try {
      const body = resetRole === 'all' ? {} : { role: resetRole };
      const res = await api.post('/role-permissions/reset', body);
      const payload = unwrap(res) || {};
      toast.success(res.data?.message || `Reset ${payload.reset || 0} permissions`);
      setResetDialogOpen(false);
      loadMatrix();
      fetchPermissions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Reset failed');
    }
  };

  const handleDisableCategory = async (role, category) => {
    if (!confirm(`Disable all ${category} permissions for ${role}?`)) return;
    try {
      await api.post('/role-permissions/disable-category', { role, category });
      toast.success(`Disabled ${category} for ${role}`);
      loadMatrix();
      fetchPermissions();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const sortedCategories = useMemo(() => {
    if (!data?.matrix) return [];
    return Object.entries(data.matrix).sort(
      ([, a], [, b]) => (a.meta?.order || 99) - (b.meta?.order || 99)
    );
  }, [data]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading permission matrix…</div>;
  }
  if (!data) {
    return <div className="text-sm text-muted-foreground">No matrix data.</div>;
  }

  const editableRoles = data.editable_roles || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
            <Shield className="h-5 w-5 text-red-500 dark:text-red-400" />
            Role permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Edit what each role can access — changes take effect within 60 seconds (or instantly within this process).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy role
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to defaults
          </Button>
        </div>
      </div>

      {/* Lockout notice */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Lock className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium">Super admin row is locked</p>
              <p className="text-muted-foreground">
                Super admin always has full access (level: <span className="font-mono">all</span>) for every permission. This cannot be changed to prevent lockout. The super admin column is hidden from the matrix below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={sortedCategories[0]?.[0]} className="space-y-3">
        <TabsList className="w-full overflow-x-auto justify-start h-auto p-1 flex-wrap">
          {sortedCategories.map(([key, cat]) => {
            const Icon = CATEGORY_ICONS[key] || Shield;
            return (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {cat.meta?.label || key}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {sortedCategories.map(([catKey, cat]) => (
          <TabsContent key={catKey} value={catKey} className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{cat.meta?.label || catKey}</CardTitle>
                <CardDescription>
                  {Object.keys(cat.permissions || {}).length} permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[260px]">
                        Permission
                      </th>
                      {editableRoles.map((role) => (
                        <th
                          key={role}
                          className="p-3 font-medium text-muted-foreground min-w-[120px]"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] capitalize border', ROLE_PILL[role])}
                            >
                              {role.replace(/_/g, ' ')}
                            </Badge>
                            <button
                              onClick={() => handleDisableCategory(role, catKey)}
                              className="text-[9px] text-muted-foreground hover:text-red-500 dark:hover:text-red-400 transition-colors underline-offset-2 hover:underline"
                              title={`Disable all ${cat.meta?.label || catKey} for ${role}`}
                            >
                              disable all
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cat.permissions || {}).map(([permKey, perm]) => (
                      <tr
                        key={permKey}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="p-3 sticky left-0 bg-card">
                          <p className="font-mono text-[11px] text-muted-foreground">{permKey}</p>
                          <p className="text-xs mt-0.5">{perm.description}</p>
                        </td>
                        {editableRoles.map((role) => {
                          const currentLevel = perm.roles?.[role] || 'none';
                          const cellKey = `${role}:${permKey}`;
                          const isSaving = saving === cellKey;
                          return (
                            <td key={role} className="p-2 text-center">
                              <Select
                                value={currentLevel}
                                onValueChange={(v) => updateCell(role, permKey, v)}
                                disabled={isSaving}
                              >
                                <SelectTrigger
                                  className={cn(
                                    'h-8 text-xs w-[100px] mx-auto justify-between',
                                    LEVEL_TINT[currentLevel],
                                    isSaving && 'opacity-50'
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    <span className="text-muted-foreground">None</span>
                                  </SelectItem>
                                  <SelectItem value="all">
                                    <span className="text-emerald-600 dark:text-emerald-400">All</span>
                                  </SelectItem>
                                  <SelectItem value="own">
                                    <span className="text-amber-600 dark:text-amber-400">Own only</span>
                                  </SelectItem>
                                  <SelectItem value="group">
                                    <span className="text-blue-600 dark:text-blue-400">Group</span>
                                  </SelectItem>
                                  <SelectItem value="read">
                                    <span className="text-teal-600 dark:text-teal-400">Read only</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-medium">Levels:</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> All — full access
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Own — only their assigned records
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Group — within their group(s)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-teal-500" /> Read — view only
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gray-500" /> None — no access
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Copy dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy permissions between roles</DialogTitle>
            <DialogDescription>
              Replace the target role's permissions with the source role's
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Copy from</label>
              <Select
                value={copyForm.from_role}
                onValueChange={(v) => setCopyForm({ ...copyForm, from_role: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(data.roles || []).map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Copy to</label>
              <Select
                value={copyForm.to_role}
                onValueChange={(v) => setCopyForm({ ...copyForm, to_role: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs">
              <strong>Warning:</strong> This will overwrite all of{' '}
              <span className="capitalize">{copyForm.to_role.replace(/_/g, ' ')}</span>'s
              permissions with those of{' '}
              <span className="capitalize">{copyForm.from_role.replace(/_/g, ' ')}</span>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCopy} disabled={copyForm.from_role === copyForm.to_role}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              Reset permissions to defaults
            </DialogTitle>
            <DialogDescription>
              Restore the original out-of-the-box permission settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Reset which role?</label>
              <Select value={resetRole} onValueChange={setResetRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All editable roles</SelectItem>
                  {editableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
