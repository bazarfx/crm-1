'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Plus, MoreHorizontal, KeyRound, UserX, UserCheck, Trash2, LogIn, FileText,
  RotateCcw, Search, Languages, LayoutGrid, List, Pencil, UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import ResetPasswordModal from '@/components/users/ResetPasswordModal';
import ChangeLanguageDialog from '@/components/users/ChangeLanguageDialog';
import { LanguageBadge, LanguageList } from '@/components/shared/LanguageBadge';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { labelFor, colorsFor } from '@/lib/languages';
import { fetchRoles } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { setTokens } from '@/lib/auth';
import { DynamicFilterBar } from '@/components/dynamic/DynamicFilterBar';
import { DynamicFilterChips } from '@/components/dynamic/DynamicFilterChips';
import { useDynamicColumns } from '@/components/dynamic/DynamicColumns';
import { DynamicCell } from '@/components/dynamic/DynamicCell';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';

dayjs.extend(relativeTime);

// Each named pill maps to a single concrete role; "Others" is the complement
// (every role NOT covered by a named pill), derived from the live roles
// registry so custom roles can never silently disappear from every pill.
const NAMED_PILL_ROLES = {
  tele_sales: ['tele_sales'],
  senior: ['senior'],
  floor_manager: ['floor_manager'],
};
const NAMED_PILL_KEYS = ['tele_sales', 'senior', 'floor_manager'];
// Used until the roles registry resolves.
const FALLBACK_OTHERS = ['back_office', 'auditor', 'admin', 'super_admin', 'archive', 'schema_editor', 'custom'];

// Role pill set under the Active tab. The first two get the grouped-by-
// language layout; everything else uses the flat table.
const ROLE_PILLS = [
  { value: 'all',           label: 'All' },
  { value: 'tele_sales',    label: 'Telesellers' },
  { value: 'senior',        label: 'Seniors' },
  { value: 'floor_manager', label: 'Floor managers' },
  { value: 'others',        label: 'Others' },
];

const LANGUAGE_GROUPED_ROLES = ['tele_sales', 'senior'];

// Visible keyboard-focus ring for hand-rolled buttons (matches shadcn).
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

export default function UsersPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'auditor', 'back_office']}>
      <UsersContent />
    </RoleGuard>
  );
}

function UsersContent() {
  const router = useRouter();
  const currentUser = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const isAdminOrAbove =
    currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const [activeTab, setActiveTab] = useState('active');
  const [rolePill, setRolePill] = useState('all');
  const [viewMode, setViewMode] = useState('grouped'); // grouped | flat
  const [selectedLanguage, setSelectedLanguage] = useState('all');

  const [users, setUsers] = useState([]);
  const [byLanguage, setByLanguage] = useState(null);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingDeleted, setLoadingDeleted] = useState(true);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [total, setTotal] = useState(0);

  // Custom field filters (cf_* keys). Forwarded to /users so the backend can
  // narrow by the JSONB custom_fields column.
  const [customFilters, setCustomFilters] = useState({});

  // Live role keys (built-ins + custom) for the drift-proof "Others" set.
  const [roleKeys, setRoleKeys] = useState(null);
  const othersRoles = useMemo(() => {
    const base = roleKeys && roleKeys.length ? roleKeys : FALLBACK_OTHERS;
    return base.filter((k) => !NAMED_PILL_KEYS.includes(k));
  }, [roleKeys]);

  // Custom-field columns + manage button live in the page header.
  const dynUser = useDynamicColumns('user');

  const useGroupedView = LANGUAGE_GROUPED_ROLES.includes(rolePill) && viewMode === 'grouped';

  // Active-users list (flat). Honours role filter + search + pagination.
  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const params = { page, limit, search };
      // Server-side role filtering — single role or a multi-role CSV (Others),
      // so totals + pages stay correct instead of post-filtering one page.
      const roles = rolePill === 'others' ? othersRoles : NAMED_PILL_ROLES[rolePill];
      if (roles && roles.length) {
        if (roles.length === 1) params.role = roles[0];
        else params.roles = roles.join(',');
      }
      for (const k of Object.keys(customFilters)) {
        if (customFilters[k] !== '' && customFilters[k] != null) params[k] = customFilters[k];
      }
      const res = await api.get('/users', { params });
      const list = unwrap(res) || [];
      setUsers(list);
      setTotal(res?.data?.pagination?.total || list.length);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoadingActive(false);
    }
  }, [page, limit, search, rolePill, customFilters, othersRoles]);

  // Grouped-by-language view for tele_sales / senior. Falls back to the flat
  // list if /users/by-language isn't available (so the page still works on a
  // backend without the new endpoint).
  const loadByLanguage = useCallback(async () => {
    if (!LANGUAGE_GROUPED_ROLES.includes(rolePill)) {
      setByLanguage(null);
      return;
    }
    try {
      const res = await api.get('/users/by-language', { params: { role: rolePill } });
      setByLanguage(unwrap(res) || null);
    } catch {
      setByLanguage(null);
    }
  }, [rolePill]);

  const loadDeleted = useCallback(async () => {
    if (!isAdminOrAbove) return;
    setLoadingDeleted(true);
    try {
      const res = await api.get('/users/deleted');
      setDeletedUsers(unwrap(res) || []);
    } catch {
      // permissions denial, silent
    } finally {
      setLoadingDeleted(false);
    }
  }, [isAdminOrAbove]);

  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => { loadByLanguage(); }, [loadByLanguage]);
  useEffect(() => { loadDeleted(); }, [loadDeleted]);
  // Warm the roles registry — feeds RoleBadge labels/colours AND the
  // drift-proof "Others" complement set.
  useEffect(() => {
    fetchRoles()
      .then((list) => setRoleKeys((list || []).map((r) => r.key)))
      .catch(() => {});
  }, []);

  // Reset language selection whenever the role pill changes so the user
  // doesn't carry an obsolete language filter into a new role view.
  useEffect(() => {
    setSelectedLanguage('all');
    setPage(1);
  }, [rolePill]);

  const refresh = () => { loadActive(); loadByLanguage(); loadDeleted(); };

  const activeFilters =
    !!search || rolePill !== 'all'
    || Object.keys(customFilters).some((k) => customFilters[k] !== '' && customFilters[k] != null);
  const clearFilters = () => { setSearch(''); setRolePill('all'); setCustomFilters({}); setPage(1); };

  const visibleCfDefs = dynUser.customDefs.filter((d) => dynUser.visibleColumns[d.field_key]);
  // User · Role · Languages · Status · Last active · (cf…) · actions
  const flatColCount = 6 + visibleCfDefs.length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage user accounts, roles, and access
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <dynUser.PickerButton />
          <ManageFieldsButton entityType="user" size="sm" />
          {isAdminOrAbove && (
            <Button size="sm" onClick={() => router.push('/users/new')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New user
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1.5">
            Active users
            {total > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{total}</Badge>
            )}
          </TabsTrigger>
          {isAdminOrAbove && (
            <TabsTrigger value="deleted" className="gap-1.5">
              Deleted
              {deletedUsers.length > 0 && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                  {deletedUsers.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── ACTIVE TAB ───────────────────────────────────────── */}
        <TabsContent value="active" className="space-y-3">
          {/* One coherent control row: role filter (segmented) · search · trailing cluster */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
              {ROLE_PILLS.map((p) => {
                const active = rolePill === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setRolePill(p.value)}
                    className={cn(
                      'h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                      FOCUS_RING,
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder="Search by name or email…"
                className="pl-9 h-9"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DynamicFilterBar
                entityType="user"
                filters={customFilters}
                onChange={(next) => { setPage(1); setCustomFilters(next); }}
              />
              {LANGUAGE_GROUPED_ROLES.includes(rolePill) && (
                <div className="flex items-center gap-0.5 border rounded-md p-0.5 h-9">
                  <button
                    type="button"
                    onClick={() => setViewMode('grouped')}
                    className={cn(
                      'h-7 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                      FOCUS_RING,
                      viewMode === 'grouped' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    aria-pressed={viewMode === 'grouped'}
                  >
                    <LayoutGrid className="h-3 w-3" /> Grouped
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('flat')}
                    className={cn(
                      'h-7 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                      FOCUS_RING,
                      viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    aria-pressed={viewMode === 'flat'}
                  >
                    <List className="h-3 w-3" /> Flat
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active custom-field filter chips */}
          <DynamicFilterChips
            entityType="user"
            filters={customFilters}
            onChange={(next) => { setPage(1); setCustomFilters(next); }}
          />

          {/* Grouped view */}
          {useGroupedView && byLanguage?.groups ? (
            <div className="space-y-3">
              {/* Language sub-band — a refinement of the toolbar, grouped only */}
              <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                <span className="text-xs text-muted-foreground mr-1">Languages</span>
                <LanguagePill
                  label="All"
                  count={byLanguage.total_users ?? byLanguage.groups.reduce((a, g) => a + (g.count || 0), 0)}
                  active={selectedLanguage === 'all'}
                  onClick={() => setSelectedLanguage('all')}
                />
                {byLanguage.groups.map((g) => (
                  <LanguagePill
                    key={g.language}
                    language={g.language}
                    label={labelFor(g.language)}
                    count={g.count}
                    active={selectedLanguage === g.language}
                    onClick={() => setSelectedLanguage(g.language)}
                  />
                ))}
              </div>
              <GroupedUsersView
                byLanguage={byLanguage}
                selectedLanguage={selectedLanguage}
                role={rolePill}
                currentUser={currentUser}
                isAdminOrAbove={isAdminOrAbove}
                onChange={refresh}
                onImpersonate={(data) => doImpersonate(data, setUser)}
                router={router}
              />
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">User</th>
                        <th className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Role</th>
                        <th className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Languages</th>
                        <th className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Last active</th>
                        {visibleCfDefs.map((d) => (
                          <th key={d.field_key} className="text-left px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
                            {d.label}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {loadingActive && Array.from({ length: 6 }).map((_, i) => (
                        <UserRowSkeleton key={i} cols={flatColCount} />
                      ))}
                      {!loadingActive && users.length === 0 && (
                        <tr>
                          <td colSpan={flatColCount} className="px-3 py-12">
                            <div className="flex flex-col items-center text-center">
                              <UsersRound className="h-7 w-7 text-muted-foreground/50" />
                              <p className="text-sm font-medium mt-3">No users match these filters</p>
                              {activeFilters && (
                                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                                  Clear filters
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {!loadingActive && users.map((u) => (
                        <UserRow
                          key={u.id}
                          user={u}
                          currentUser={currentUser}
                          isAdminOrAbove={isAdminOrAbove}
                          onChange={refresh}
                          onImpersonate={(data) => doImpersonate(data, setUser)}
                          router={router}
                          dynColumns={dynUser}
                        />
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {total > limit && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                    <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── DELETED TAB ──────────────────────────────────────── */}
        {isAdminOrAbove && (
          <TabsContent value="deleted">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Deleted at</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDeleted && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!loadingDeleted && deletedUsers.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No deleted users</td></tr>
                    )}
                    {deletedUsers.map((u) => (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <p className="font-medium">{u.first_name} {u.last_name}</p>
                          <p className="text-muted-foreground text-[11px]">{u.email}</p>
                        </td>
                        <td className="p-3"><RoleBadge role={u.role} /></td>
                        <td className="p-3 text-muted-foreground">
                          {u.deletedAt
                            ? new Date(u.deletedAt).toLocaleString('en-IN', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={async () => {
                              try {
                                await api.post(`/users/${u.id}/restore`);
                                toast.success('User restored and activated');
                                refresh();
                              } catch {
                                toast.error('Restore failed');
                              }
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" /> Restore &amp; activate
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
}

function doImpersonate(data, setUser) {
  try {
    const orig = window.localStorage.getItem('crm1-token-original');
    if (!orig) {
      const a = window.localStorage.getItem('crm1-access-token');
      if (a) window.localStorage.setItem('crm1-token-original', a);
    }
  } catch {}
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  setUser(data.user);
  window.location.href = '/dashboard';
}

/* Skeleton row matching the flat table column count. */
function UserRowSkeleton({ cols }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-36 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </td>
      {Array.from({ length: Math.max(0, cols - 1) }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Language pill (for the per-language filter row above grouped view)
 * ────────────────────────────────────────────────────────────────── */
function LanguagePill({ language, label, count, active, onClick }) {
  const c = language ? colorsFor(language) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium border transition-colors',
        FOCUS_RING,
        active
          ? language
            ? cn(c.bg, c.text, 'border-current/40')
            : 'bg-foreground text-background border-foreground'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {label}
      {typeof count === 'number' && (
        <span className="font-mono tabular-nums text-[10px] opacity-70">{count}</span>
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Grouped-by-language view (one card per language)
 * ────────────────────────────────────────────────────────────────── */
function GroupedUsersView({
  byLanguage, selectedLanguage, role, currentUser, isAdminOrAbove, onChange, onImpersonate, router,
}) {
  const groups = useMemo(() => {
    return (byLanguage.groups || []).filter(
      (g) => selectedLanguage === 'all' || g.language === selectedLanguage
    );
  }, [byLanguage, selectedLanguage]);

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          No users in this language.
        </CardContent>
      </Card>
    );
  }

  const noun = role === 'tele_sales' ? 'telesellers' : 'seniors';

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.language}>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <LanguageBadge language={group.language} primary />
                <span className="text-sm font-medium">{labelFor(group.language)}</span>
                <span className="text-xs text-muted-foreground">
                  {group.count} {noun}
                </span>
              </div>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {(group.users || []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUser={currentUser}
                    isAdminOrAbove={isAdminOrAbove}
                    onChange={onChange}
                    onImpersonate={onImpersonate}
                    router={router}
                    variant="grouped"
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Single user row — status quick-toggle + 3-dot actions menu
 * ────────────────────────────────────────────────────────────────── */
function UserRow({ user, currentUser, isAdminOrAbove, onChange, onImpersonate, router, variant, dynColumns }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const isSelf = user.id === currentUser?.id;
  const isSuperAdminRow = user.role === 'super_admin';
  const isCurrentSuperAdmin = currentUser?.role === 'super_admin';
  const canQuickToggle = isAdminOrAbove && !isSuperAdminRow && !isSelf;
  // Admin & super_admin can re-language tele_sales / senior. Everyone else
  // sees the menu item hidden — including floor managers, who can move
  // people between groups but not change the language identity itself.
  const canChangeLanguage =
    (currentUser?.role === 'admin' || currentUser?.role === 'super_admin') &&
    ['tele_sales', 'senior'].includes(user.role);

  const deactivate = async () => {
    if (!confirm(`Deactivate ${user.first_name} ${user.last_name}? They'll be logged out within 30 seconds.`)) return;
    try {
      await api.patch(`/users/${user.id}/deactivate`);
      toast.success('User deactivated');
      onChange();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed'); }
  };

  const activate = async () => {
    try {
      await api.patch(`/users/${user.id}/activate`);
      toast.success('User activated');
      onChange();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed'); }
  };

  const softDelete = async () => {
    if (!confirm(`Move ${user.first_name} ${user.last_name} to recycle bin?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('User moved to recycle bin');
      onChange();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed'); }
  };

  const impersonate = async () => {
    if (!confirm(`Log in as ${user.first_name} ${user.last_name}? Your current session will be replaced.`)) return;
    try {
      const res = await api.post(`/users/${user.id}/impersonate`);
      const payload = unwrap(res) || {};
      toast.success(`Logged in as ${payload.user?.first_name || user.first_name}`);
      onImpersonate(payload);
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to impersonate'); }
  };

  const initials = `${(user.first_name?.[0] || '').toUpperCase()}${(user.last_name?.[0] || '').toUpperCase()}` || '?';

  // Clicking the row opens this user's dashboard view (stats, conversion,
  // by-language perf, etc.). Buttons inside the action cells must stopPropagation
  // so they don't also navigate.
  const openDashboard = () => router.push(`/users/${user.id}/dashboard`);

  return (
    <tr
      className="group border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
      onClick={openDashboard}
    >
      {/* Identity — avatar + name + email (every variant) */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-tight truncate group-hover:underline">{user.first_name} {user.last_name}</p>
            <p className="text-muted-foreground text-[11px] leading-tight truncate">{user.email}</p>
          </div>
        </div>
      </td>

      {variant !== 'grouped' && (
        <td className="px-3 py-2"><RoleBadge role={user.role} /></td>
      )}

      <td className="px-3 py-2">
        <LanguageList languages={user.languages} />
      </td>

      {/* Status — one-click toggle (no menu). stopPropagation so it doesn't
          also navigate to the dashboard. */}
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        {canQuickToggle ? (
          <button
            type="button"
            onClick={user.is_active ? deactivate : activate}
            title={user.is_active ? 'Click to deactivate' : 'Click to activate'}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium border transition-colors',
              FOCUS_RING,
              user.is_active
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                : 'text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', user.is_active ? 'bg-emerald-500' : 'bg-red-500')} />
            {user.is_active ? 'Active' : 'Inactive'}
          </button>
        ) : (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium',
            user.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', user.is_active ? 'bg-emerald-500' : 'bg-red-500')} />
            {user.is_active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>

      {/* Last active */}
      <td className="px-3 py-2 text-muted-foreground">
        {user.last_login_at ? dayjs(user.last_login_at).fromNow() : <span className="opacity-60">Never</span>}
      </td>

      {/* Dynamic custom-field columns — only render in the flat view
          (dynColumns is undefined in the grouped variant). */}
      {dynColumns && dynColumns.customDefs
        .filter((d) => dynColumns.visibleColumns[d.field_key])
        .map((d) => (
          <td key={d.field_key} className="px-3 py-2">
            <DynamicCell definition={d} value={user.custom_fields?.[d.field_key]} />
          </td>
        ))}

      {/* 3-dot menu — stopPropagation so opening it doesn't also navigate. */}
      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${user.first_name} ${user.last_name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user.first_name} {user.last_name}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {isAdminOrAbove && !isSuperAdminRow && (
              <DropdownMenuItem onClick={() => router.push(`/users/${user.id}/edit`)}>
                <Pencil className="h-3.5 w-3.5 mr-2 text-blue-600 dark:text-blue-400" /> Edit
              </DropdownMenuItem>
            )}
            {isAdminOrAbove && !isSuperAdminRow && !isSelf && user.is_active && (
              <DropdownMenuItem onClick={deactivate} className="text-amber-600 dark:text-amber-400">
                <UserX className="h-3.5 w-3.5 mr-2" /> Deactivate
              </DropdownMenuItem>
            )}
            {isAdminOrAbove && !isSuperAdminRow && !isSelf && !user.is_active && (
              <DropdownMenuItem onClick={activate} className="text-emerald-600 dark:text-emerald-400">
                <UserCheck className="h-3.5 w-3.5 mr-2" /> Activate
              </DropdownMenuItem>
            )}
            {isAdminOrAbove && !isSuperAdminRow && (
              <DropdownMenuItem onClick={() => setResetOpen(true)}>
                <KeyRound className="h-3.5 w-3.5 mr-2" /> Reset password
              </DropdownMenuItem>
            )}
            {canChangeLanguage && (
              <DropdownMenuItem onClick={() => setLangOpen(true)}>
                <Languages className="h-3.5 w-3.5 mr-2 text-purple-600 dark:text-purple-400" />
                Change language
              </DropdownMenuItem>
            )}
            {isCurrentSuperAdmin && !isSuperAdminRow && !isSelf && (
              <DropdownMenuItem onClick={impersonate}>
                <LogIn className="h-3.5 w-3.5 mr-2" /> Impersonate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(`/activity-logs?user=${user.id}`)}>
              <FileText className="h-3.5 w-3.5 mr-2" /> View activity
            </DropdownMenuItem>
            {isAdminOrAbove && !isSuperAdminRow && !isSelf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={softDelete} className="text-red-600 dark:text-red-400">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete user
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ResetPasswordModal open={resetOpen} onOpenChange={setResetOpen} user={user} />
        <ChangeLanguageDialog
          open={langOpen}
          onOpenChange={setLangOpen}
          user={user}
          onChanged={onChange}
        />
      </td>
    </tr>
  );
}
