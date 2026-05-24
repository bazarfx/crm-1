'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, MoreHorizontal, KeyRound, UserX, UserCheck, Trash2, LogIn, FileText,
  ChevronDown, RotateCcw, Search, Languages, LayoutGrid, List, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import ResetPasswordModal from '@/components/users/ResetPasswordModal';
import CreateUserDialog from '@/components/users/CreateUserDialog';
import EditUserDialog from '@/components/users/EditUserDialog';
import ChangeLanguageDialog from '@/components/users/ChangeLanguageDialog';
import { LanguageBadge, LanguageList } from '@/components/shared/LanguageBadge';
import { labelFor, colorsFor } from '@/lib/languages';
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
import { useDynamicColumns } from '@/components/dynamic/DynamicColumns';
import { DynamicCell } from '@/components/dynamic/DynamicCell';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';

// Role pill set under the Active tab. The first two get the grouped-by-
// language layout; everything else uses the flat table.
const ROLE_PILLS = [
  { value: 'all',           label: 'All' },
  { value: 'tele_sales',    label: 'Telesellers' },
  { value: 'senior',        label: 'Seniors' },
  { value: 'floor_manager', label: 'Floor managers' },
  { value: 'others',        label: 'Others' },
];

const OTHERS_ROLES = ['back_office', 'auditor', 'admin', 'super_admin', 'archive'];

const LANGUAGE_GROUPED_ROLES = ['tele_sales', 'senior'];

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

  const [createOpen, setCreateOpen] = useState(false);
  // Custom-field columns + manage button live in the page header.
  const dynUser = useDynamicColumns('user');

  const useGroupedView = LANGUAGE_GROUPED_ROLES.includes(rolePill) && viewMode === 'grouped';

  // Active-users list (flat). Honours role filter + search + pagination.
  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const params = { page, limit, search };
      if (rolePill !== 'all' && rolePill !== 'others') {
        params.role = rolePill;
      }
      for (const k of Object.keys(customFilters)) {
        if (customFilters[k] !== '' && customFilters[k] != null) params[k] = customFilters[k];
      }
      const res = await api.get('/users', { params });
      let list = unwrap(res) || [];
      if (rolePill === 'others') {
        list = list.filter((u) => OTHERS_ROLES.includes(u.role));
      }
      setUsers(list);
      setTotal(res?.data?.pagination?.total || list.length);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoadingActive(false);
    }
  }, [page, limit, search, rolePill, customFilters]);

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

  // Reset language selection whenever the role pill changes so the user
  // doesn't carry an obsolete language filter into a new role view.
  useEffect(() => {
    setSelectedLanguage('all');
    setPage(1);
  }, [rolePill]);

  const refresh = () => { loadActive(); loadByLanguage(); loadDeleted(); };

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
            <Button size="sm" onClick={() => setCreateOpen(true)}>
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
          {/* Role pill strip. Acts as a server-side filter for the flat list
              and the trigger for the grouped-by-language layout. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_PILLS.map((p) => {
              const active = rolePill === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setRolePill(p.value)}
                  className={cn(
                    'h-8 px-3 rounded-md text-xs font-medium transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Search + view-mode toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder="Search by name or email…"
                className="pl-9"
              />
            </div>

            <DynamicFilterBar
              entityType="user"
              filters={customFilters}
              onChange={(next) => { setPage(1); setCustomFilters(next); }}
            />


            {LANGUAGE_GROUPED_ROLES.includes(rolePill) && (
              <div className="ml-auto flex items-center gap-0.5 border rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  className={cn(
                    'h-7 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                    viewMode === 'grouped' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
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
                    viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                  )}
                  aria-pressed={viewMode === 'flat'}
                >
                  <List className="h-3 w-3" /> Flat
                </button>
              </div>
            )}
          </div>

          {/* Language pill row — only when grouped layout is active and the
              backend served per-language data. */}
          {LANGUAGE_GROUPED_ROLES.includes(rolePill) && byLanguage?.groups && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Languages:</span>
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
          )}

          {/* Grouped view */}
          {useGroupedView && byLanguage?.groups ? (
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
          ) : (
            <>
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Languages</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                        {/* Dynamic custom-field columns the user toggled on
                            in the Columns picker. Inserted before the 3-dot
                            menu so the row's actions stay at the right edge. */}
                        {dynUser.customDefs
                          .filter((d) => dynUser.visibleColumns[d.field_key])
                          .map((d) => (
                            <th key={d.field_key} className="text-left p-3 font-medium text-muted-foreground">
                              {d.label}
                            </th>
                          ))}
                        <th className="p-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {loadingActive && (
                        <tr><td colSpan={5 + dynUser.cfColumnDefs.length} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                      )}
                      {!loadingActive && users.length === 0 && (
                        <tr><td colSpan={5 + dynUser.cfColumnDefs.length} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                      )}
                      {users.map((u) => (
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
                          <p className="text-muted-foreground font-mono text-[10px]">{u.email}</p>
                        </td>
                        <td className="p-3 capitalize">{u.role?.replace(/_/g, ' ')}</td>
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

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />
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
  const [editOpen, setEditOpen] = useState(false);

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

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      {variant === 'grouped' && (
        <td className="p-3 w-10">
          <div className="w-7 h-7 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center text-[10px] font-medium">
            {initials}
          </div>
        </td>
      )}
      <td className="p-3">
        <p className="font-medium">{user.first_name} {user.last_name}</p>
        <p className="text-muted-foreground font-mono text-[10px]">{user.email}</p>
      </td>
      {variant !== 'grouped' && (
        <td className="p-3 capitalize">{user.role?.replace(/_/g, ' ')}</td>
      )}
      <td className="p-3">
        <LanguageList languages={user.languages} />
      </td>

      {/* Status quick-toggle */}
      <td className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-[10px] px-2 gap-1.5 inline-flex items-center',
                user.is_active
                  ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                  : 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
              )}
              disabled={!canQuickToggle}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', user.is_active ? 'bg-emerald-500' : 'bg-red-500')} />
              {user.is_active ? 'Active' : 'Inactive'}
              {canQuickToggle && <ChevronDown className="h-3 w-3" />}
            </Button>
          </DropdownMenuTrigger>
          {canQuickToggle && (
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={user.is_active ? deactivate : activate}>
                {user.is_active ? (
                  <><UserX className="h-3.5 w-3.5 mr-2 text-amber-600 dark:text-amber-400" /> Deactivate</>
                ) : (
                  <><UserCheck className="h-3.5 w-3.5 mr-2 text-emerald-600 dark:text-emerald-400" /> Activate</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </td>

      {/* Dynamic custom-field columns — only render in the flat view
          (dynColumns is undefined in the grouped variant). */}
      {dynColumns && dynColumns.customDefs
        .filter((d) => dynColumns.visibleColumns[d.field_key])
        .map((d) => (
          <td key={d.field_key} className="p-3">
            <DynamicCell definition={d} value={user.custom_fields?.[d.field_key]} />
          </td>
        ))}

      {/* 3-dot menu */}
      <td className="p-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user.first_name} {user.last_name}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {isAdminOrAbove && !isSuperAdminRow && (
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
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
        <EditUserDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          user={user}
          currentUserRole={currentUser?.role}
          onSaved={onChange}
        />
      </td>
    </tr>
  );
}
