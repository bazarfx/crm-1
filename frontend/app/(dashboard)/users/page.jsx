'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, MoreHorizontal, KeyRound, UserX, UserCheck, Trash2, LogIn, FileText,
  ChevronDown, RotateCcw, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import ResetPasswordModal from '@/components/users/ResetPasswordModal';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { setTokens } from '@/lib/auth';

const ROLE_OPTIONS = [
  { value: 'tele_sales',    label: 'Tele Sales' },
  { value: 'senior',        label: 'Senior' },
  { value: 'floor_manager', label: 'Floor Manager' },
  { value: 'admin',         label: 'Admin' },
  { value: 'auditor',       label: 'Auditor' },
  { value: 'back_office',   label: 'Back Office' },
];

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
  const [users, setUsers] = useState([]);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingDeleted, setLoadingDeleted] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [total, setTotal] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);

  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const res = await api.get('/users', { params: { page, limit, search } });
      setUsers(unwrap(res) || []);
      setTotal(res?.data?.pagination?.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoadingActive(false);
    }
  }, [page, limit, search]);

  const loadDeleted = useCallback(async () => {
    if (!isAdminOrAbove) return;
    setLoadingDeleted(true);
    try {
      const res = await api.get('/users/deleted');
      setDeletedUsers(unwrap(res) || []);
    } catch {
      // Likely a permissions denial; silent.
    } finally {
      setLoadingDeleted(false);
    }
  }, [isAdminOrAbove]);

  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => { loadDeleted(); }, [loadDeleted]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage user accounts, roles, and access
          </p>
        </div>
        {isAdminOrAbove && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New user
          </Button>
        )}
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search by name or email…"
              className="pl-9 max-w-sm"
            />
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Language</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="p-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {loadingActive && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!loadingActive && users.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                  )}
                  {users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      currentUser={currentUser}
                      isAdminOrAbove={isAdminOrAbove}
                      onChange={() => { loadActive(); loadDeleted(); }}
                      onImpersonate={(data) => {
                        // Stash original token so we can return later if needed
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
                      }}
                      router={router}
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
                                loadActive();
                                loadDeleted();
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

      {/* ── Create user dialog ───────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription>
              The user will receive an account they can sign in to.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const body = Object.fromEntries(fd.entries());
              try {
                await api.post('/users', body);
                toast.success('User created');
                setCreateOpen(false);
                loadActive();
              } catch (err) {
                toast.error(err?.response?.data?.message || 'Failed to create user');
              }
            }}
            className="space-y-4 py-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" required placeholder="John" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" name="last_name" required placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue=""
              >
                <option value="" disabled>Select a role</option>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
              <p className="text-[10px] text-muted-foreground">
                User will be prompted to change it on first login.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create user</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Single user row — status quick-toggle + 3-dot actions menu
 * ────────────────────────────────────────────────────────────────── */
function UserRow({ user, currentUser, isAdminOrAbove, onChange, onImpersonate, router }) {
  const [resetOpen, setResetOpen] = useState(false);

  const isSelf = user.id === currentUser?.id;
  const isSuperAdminRow = user.role === 'super_admin';
  const isCurrentSuperAdmin = currentUser?.role === 'super_admin';
  const canQuickToggle = isAdminOrAbove && !isSuperAdminRow && !isSelf;

  const deactivate = async () => {
    if (!confirm(
      `Deactivate ${user.first_name} ${user.last_name}? They'll be logged out within 30 seconds.`
    )) return;
    try {
      await api.patch(`/users/${user.id}/deactivate`);
      toast.success('User deactivated');
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  const activate = async () => {
    try {
      await api.patch(`/users/${user.id}/activate`);
      toast.success('User activated');
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  const softDelete = async () => {
    if (!confirm(`Move ${user.first_name} ${user.last_name} to recycle bin?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('User moved to recycle bin');
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  const impersonate = async () => {
    if (!confirm(
      `Log in as ${user.first_name} ${user.last_name}? Your current session will be replaced.`
    )) return;
    try {
      const res = await api.post(`/users/${user.id}/impersonate`);
      const payload = unwrap(res) || {};
      toast.success(`Logged in as ${payload.user?.first_name || user.first_name}`);
      onImpersonate(payload);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to impersonate');
    }
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="p-3">
        <p className="font-medium">{user.first_name} {user.last_name}</p>
        <p className="text-muted-foreground font-mono text-[10px]">{user.email}</p>
      </td>
      <td className="p-3 capitalize">{user.role?.replace(/_/g, ' ')}</td>
      <td className="p-3 capitalize text-muted-foreground">{user.native_language || '—'}</td>

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
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  user.is_active ? 'bg-emerald-500' : 'bg-red-500'
                )}
              />
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

            {isAdminOrAbove && !isSuperAdminRow && !isSelf && user.is_active && (
              <DropdownMenuItem
                onClick={deactivate}
                className="text-amber-600 dark:text-amber-400"
              >
                <UserX className="h-3.5 w-3.5 mr-2" /> Deactivate
              </DropdownMenuItem>
            )}
            {isAdminOrAbove && !isSuperAdminRow && !isSelf && !user.is_active && (
              <DropdownMenuItem
                onClick={activate}
                className="text-emerald-600 dark:text-emerald-400"
              >
                <UserCheck className="h-3.5 w-3.5 mr-2" /> Activate
              </DropdownMenuItem>
            )}
            {isAdminOrAbove && !isSuperAdminRow && (
              <DropdownMenuItem onClick={() => setResetOpen(true)}>
                <KeyRound className="h-3.5 w-3.5 mr-2" /> Reset password
              </DropdownMenuItem>
            )}
            {isCurrentSuperAdmin && !isSuperAdminRow && !isSelf && (
              <DropdownMenuItem onClick={impersonate}>
                <LogIn className="h-3.5 w-3.5 mr-2" /> Impersonate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(`/admin-actions?user=${user.id}`)}>
              <FileText className="h-3.5 w-3.5 mr-2" /> View activity
            </DropdownMenuItem>
            {isAdminOrAbove && !isSuperAdminRow && !isSelf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={softDelete}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete user
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ResetPasswordModal open={resetOpen} onOpenChange={setResetOpen} user={user} />
      </td>
    </tr>
  );
}
