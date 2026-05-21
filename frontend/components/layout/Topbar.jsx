'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, LogOut, ChevronDown, Bell, Search, Command } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/users': 'Users',
  '/groups': 'Groups',
  '/campaigns': 'Campaigns',
  '/reports': 'Reports',
  '/ark-logs': 'ARK Webhook Logs',
  '/settings': 'Settings',
};

function pageTitle(pathname) {
  if (!pathname) return 'CRM 1';
  if (pathname.startsWith('/leads/')) return 'Lead Detail';
  const match = Object.keys(TITLES).find((k) => pathname === k || pathname.startsWith(k + '/'));
  return match ? TITLES[match] : 'CRM 1';
}

const ROLE_PILL = {
  super_admin:   'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  admin:         'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  floor_manager: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  senior:        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  tele_sales:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  back_office:   'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  auditor:       'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  archive:       'bg-slate-600/10 text-slate-500 border-slate-600/20',
};

export default function Topbar({ onMenu }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, roleLabel, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onLogout = async () => {
    await logout();
    toast.success('Signed out');
    router.replace('/login');
  };

  const pill = ROLE_PILL[role] || ROLE_PILL.tele_sales;
  const initials = (user?.first_name?.[0] || user?.name?.[0] || user?.email?.[0] || '?').toUpperCase();
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : (user?.name || user?.email || 'Guest');

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 lg:hidden"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <h1 className="text-sm font-semibold tracking-tight">
        {pageTitle(pathname)}
      </h1>

      {/* Search hint — Cmd+K */}
      <Button
        variant="outline"
        className="ml-auto hidden md:flex h-8 gap-2 w-56 justify-start text-xs text-muted-foreground font-normal"
      >
        <Search className="h-3 w-3" />
        Search leads, users…
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </Button>

      <div className="ml-auto md:ml-0 flex items-center gap-1.5">
        {role && (
          <span
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border',
              pill
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {roleLabel}
          </span>
        )}

        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
        </Button>

        <div ref={menuRef} className="relative">
          <Button
            variant="ghost"
            onClick={() => setMenuOpen((v) => !v)}
            className="h-8 gap-2 px-2"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] font-semibold">
              {initials}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-medium leading-tight max-w-[120px] truncate">{displayName}</p>
              <p className="font-mono text-[9px] text-muted-foreground leading-tight truncate max-w-[120px]">
                {user?.email}
              </p>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-popover border rounded-lg shadow-md animate-modalIn overflow-hidden z-50">
              <button
                onClick={onLogout}
                className="w-full text-left text-sm px-3 py-2.5 flex items-center gap-2 hover:bg-muted text-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
