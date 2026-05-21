'use client';

import { useStore } from '@/store/useStore';
import { getAccessToken } from '@/lib/auth';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  floor_manager: 'Floor Manager',
  senior: 'Senior',
  tele_sales: 'Telesales',
  back_office: 'Back Office',
  auditor: 'Auditor',
  archive: 'Archive',
};

export function useAuth() {
  const user = useStore((s) => s.user);
  const hydrated = useStore((s) => s.hydrated);
  const logout = useStore((s) => s.logout);

  const role = user?.role || null;
  const isAuthenticated = hydrated && Boolean(user) && Boolean(getAccessToken());

  const can = (...allowedRoles) => Boolean(role && allowedRoles.includes(role));
  const isReadOnly = role === 'back_office' || role === 'auditor' || role === 'archive';

  return {
    user,
    role,
    roleLabel: role ? ROLE_LABELS[role] || role : null,
    hydrated,
    isAuthenticated,
    can,
    isReadOnly,
    logout,
  };
}
