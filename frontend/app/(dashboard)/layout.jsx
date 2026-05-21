'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import api from '@/lib/api';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const { hydrated, isAuthenticated } = useAuth();
  const fetchConfig = useStore((s) => s.fetchConfig);
  const fetchPermissions = useStore((s) => s.fetchPermissions);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login');
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
      fetchPermissions();
    }
  }, [isAuthenticated, fetchConfig, fetchPermissions]);

  // Re-fetch permissions whenever the tab becomes visible — keeps a long-lived
  // session in sync with edits made in another tab.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onVisibility = () => {
      if (!document.hidden) fetchPermissions();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isAuthenticated, fetchPermissions]);

  // Heartbeat: every 30s ping /auth/me. If the account has been deactivated
  // or deleted server-side, the api interceptor handles the toast + redirect
  // — we only need the call to fire.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const id = setInterval(() => {
      api.get('/auth/me').catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
