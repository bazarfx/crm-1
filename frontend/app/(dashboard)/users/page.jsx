'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Key, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';
import Modal from '@/components/shared/Modal';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState(null);
  
  const user = useStore((state) => state.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const canManageUsers = isSuperAdmin || isAdmin;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users', { params: { page, limit, search } });
      const data = unwrap(res);
      setUsers(data || []);
      setTotal(res?.data?.pagination?.total || 0);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());
    
    try {
      const res = await api.post('/users', body);
      toast.success(res?.data?.message || 'User created');
      setCreateOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const password = formData.get('password');
    
    try {
      const res = await api.patch(`/users/${selectedUser.id}`, { password });
      toast.success(res?.data?.message || 'Password updated');
      setPasswordOpen(false);
      setSelectedUser(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update password');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await api.delete(`/users/${selectedUser.id}`);
      toast.success(res?.data?.message || 'User deleted');
      setDeleteOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user');
    }
  };

  const columns = [
    { 
      accessorKey: 'name', 
      header: 'Name',
      cell: (c) => {
        const row = c.row.original;
        return <span>{row.first_name} {row.last_name}</span>;
      }
    },
    { accessorKey: 'email', header: 'Email', cell: (c) => <span className="mono text-xs">{c.getValue() || '—'}</span> },
    { accessorKey: 'role', header: 'Role' },
    { accessorKey: 'native_language', header: 'Language', cell: (c) => c.getValue() || '—' },
    { 
      accessorKey: 'is_active', 
      header: 'Active',
      cell: (c) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.getValue() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {c.getValue() ? 'Active' : 'Inactive'}
        </span>
      )
    },
  ];

  if (canManageUsers) {
    columns.push({
      id: 'actions',
      header: 'Actions',
      cell: (c) => {
        const row = c.row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUser(row);
                setPasswordOpen(true);
              }}
              className="p-1.5 text-ink-muted hover:text-accent hover:bg-surface-alt rounded-md transition-colors"
              title="Change Password"
            >
              <Key size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUser(row);
                setDeleteOpen(true);
              }}
              className="p-1.5 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="Delete User"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      }
    });
  }

  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'auditor', 'back_office']}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Users</h2>
            <p className="text-sm text-ink-secondary mt-0.5">All CRM users across roles and groups.</p>
          </div>
          {canManageUsers && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={14} /> New User
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          total={total}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onSearch={setSearch}
          searchPlaceholder="Search by name, email..."
          emptyState={<EmptyState title="No users found" message="Try adjusting your search criteria." />}
        />
      </div>

      {/* Create User Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New User" size="md">
        <form id="create-user-form" onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">First Name</label>
              <input name="first_name" required className="input w-full" placeholder="John" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">Last Name</label>
              <input name="last_name" required className="input w-full" placeholder="Doe" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">Email</label>
            <input name="email" type="email" required className="input w-full" placeholder="john@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">Role</label>
            <select name="role" required className="input w-full">
              <option value="">Select a role</option>
              <option value="tele_sales">Tele Sales</option>
              <option value="senior">Senior</option>
              <option value="floor_manager">Floor Manager</option>
              <option value="admin">Admin</option>
              <option value="auditor">Auditor</option>
              <option value="back_office">Back Office</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">Password</label>
            <input name="password" type="password" required className="input w-full" placeholder="Enter temporary password" />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-ghost text-sm">Cancel</button>
            <button type="submit" className="btn-primary text-sm">Create User</button>
          </div>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={passwordOpen} onClose={() => { setPasswordOpen(false); setSelectedUser(null); }} title="Change Password" size="sm">
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <p className="text-sm text-ink-secondary mb-4">
            Setting new password for <span className="font-medium text-ink-primary">{selectedUser?.email}</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">New Password</label>
            <input name="password" type="password" required minLength={6} className="input w-full" placeholder="Enter new password" />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setPasswordOpen(false); setSelectedUser(null); }} className="btn-ghost text-sm">Cancel</button>
            <button type="submit" className="btn-primary text-sm bg-accent hover:bg-accent-hover">Update</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteOpen} onClose={() => { setDeleteOpen(false); setSelectedUser(null); }} title="Delete User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-secondary">
            Are you sure you want to delete <span className="font-medium text-ink-primary">{selectedUser?.first_name} {selectedUser?.last_name}</span>? This action cannot be undone.
          </p>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setDeleteOpen(false); setSelectedUser(null); }} className="btn-ghost text-sm">Cancel</button>
            <button type="button" onClick={handleDelete} className="btn-primary text-sm bg-red-600 hover:bg-red-700 border-transparent">Delete</button>
          </div>
        </div>
      </Modal>

    </RoleGuard>
  );
}
