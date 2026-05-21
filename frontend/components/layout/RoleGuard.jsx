'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function RoleGuard({ allow, allowedRoles, children, fallback = '/dashboard' }) {
  const router = useRouter();
  const { hydrated, isAuthenticated, role } = useAuth();
  const roles = allow || allowedRoles;

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (roles && !roles.includes(role)) {
      router.replace(fallback);
    }
  }, [hydrated, isAuthenticated, role, roles, fallback, router]);

  if (!hydrated || !isAuthenticated || (roles && !roles.includes(role))) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }
  return children;
}
