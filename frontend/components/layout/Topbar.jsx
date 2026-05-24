'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, LogOut, ChevronDown, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import CommandPalette from '@/components/layout/CommandPalette';

// Page-title map. Each entry is [path-prefix, title, optional subtitle]. Order
// matters — the longest-matching prefix wins so `/leads/[id]` is "Lead detail"
// rather than the generic "Leads".
const PAGE_TITLES = [
  ['/leads/',         'Lead detail',       'Edit, log calls, and update status'],
  ['/leads',          'Leads',             'Manage your pipeline'],
  ['/dashboard',      'Dashboard',         null],
  ['/deals',          'Deals',             'FTD-closed leads'],
  ['/deal-requests',  'Undo requests',     'Review reversal requests'],
  ['/users',          'Users',             'Staff and role management'],
  ['/groups',         'Groups',            'Round-robin assignment teams'],
  ['/campaigns',      'Campaigns',         null],
  ['/routing',        'Routing',           'Inbound lead distribution rules'],
  ['/reports',        'Reports',           null],
  ['/sales-activity', 'Sales activity',    'Every save by telesellers and seniors'],
  ['/admin-actions',  'Admin actions',     'Audit trail for admin role'],
  ['/ark-logs',       'ARK webhook logs',  null],
  ['/trial-leads',    'Trial leads',       null],
  ['/permissions',    'Permissions',       'Role-based access matrix'],
  ['/settings',       'Settings',          null],
];

function pageMeta(pathname) {
  if (!pathname) return { title: 'CRM 1', subtitle: null };
  const match = PAGE_TITLES.find(([p]) => pathname === p || pathname.startsWith(p));
  if (!match) return { title: 'CRM 1', subtitle: null };
  return { title: match[1], subtitle: match[2] };
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Cmd/Ctrl+K → open palette. Bound globally so the shortcut works from any
  // page; the palette itself owns ESC to close so we don't double-handle.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  const { title, subtitle } = pageMeta(pathname);

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

      {/* Page title block: stronger hierarchy than the previous single-line
          h1, and the subtitle (when set) gives the user the "you are here"
          context without making them read the breadcrumb. */}
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold tracking-tight leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {subtitle}
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Command palette trigger — clickable hint that mirrors the ⌘K shortcut.
            Sized like a search input on lg+ so it reads as a global search, but
            collapses to an icon button on small screens. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            'hidden md:inline-flex items-center gap-2 h-8 px-2.5 rounded-md border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs',
            'min-w-[200px]'
          )}
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search pages, leads…</span>
          <kbd className="font-mono text-[10px] border rounded px-1 py-0.5 leading-none bg-background/60">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>

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
              <p className="text-xs font-medium leading-tight max-w-[140px] truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[140px]">
                {user?.email}
              </p>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-popover border rounded-lg shadow-md animate-modalIn overflow-hidden z-50">
              <div className="px-3 py-2.5 border-b">
                <p className="text-xs font-medium truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email || ''}</p>
              </div>
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
