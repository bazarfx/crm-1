'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, UserCog, Building2, Megaphone,
  BarChart3, Webhook, Settings, Settings2, X, TrendingUp, LogOut, FlaskConical, Shield, Eye, Award, Undo2, Activity, Route, Network, Boxes,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useModules, iconForModule } from '@/lib/modules';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const ADMIN = ['super_admin', 'admin'];
const FM_UP = ['super_admin', 'admin', 'floor_manager'];
const ALL = ['super_admin','admin','floor_manager','senior','tele_sales','back_office','auditor','archive'];

// Sidebar nav is grouped into semantic sections so a super_admin with 15
// links isn't staring at a wall of icons. Each group renders a small label
// header; groups with zero visible items collapse so the role-filtered view
// stays clean.
const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard',     label: 'Dashboard',  icon: LayoutDashboard, roles: ALL },
      { href: '/leads',         label: 'My Leads',   icon: Users,           roles: ['tele_sales'] },
      { href: '/leads',         label: 'Leads',      icon: Users,           roles: ['super_admin','admin','floor_manager','senior','back_office','auditor','archive'] },
      { href: '/deals',         label: 'Deals',      icon: Award,           roles: ['super_admin','admin','floor_manager','senior','tele_sales','back_office','auditor'] },
      { href: '/deal-requests', label: 'Undo Requests', icon: Undo2,        roles: ['super_admin','admin','floor_manager','senior','tele_sales'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/users',     label: 'Users',     icon: UserCog,   roles: ADMIN },
      { href: '/groups',    label: 'Groups',    icon: Building2, roles: FM_UP },
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, roles: FM_UP },
      { href: '/routing',   label: 'Routing',   icon: Route,     roles: ADMIN },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/reports',        label: 'Reports',       icon: BarChart3, roles: ['super_admin','admin','floor_manager','senior'] },
      { href: '/activity-logs',  label: 'Activity Log',  icon: Activity,  roles: ADMIN },
      { href: '/ark-logs',       label: 'ARK Logs',      icon: Webhook,   roles: ADMIN },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings/roles',  label: 'Roles',         icon: Network,       roles: ADMIN },
      { href: '/permissions',     label: 'Permissions',   icon: Shield,        roles: ['super_admin'] },
      { href: '/trial-leads',      label: 'Trial Leads',   icon: FlaskConical,  roles: ['super_admin'] },
      { href: '/settings/modules', label: 'Modules',       icon: Boxes,         roles: ['super_admin', 'admin', 'schema_editor'] },
      { href: '/settings/fields',  label: 'Custom fields', icon: Settings2,     roles: ['super_admin', 'schema_editor'] },
      { href: '/settings',         label: 'Settings',      icon: Settings,      roles: ADMIN },
    ],
  },
];

const ROLE_COLORS = {
  super_admin:   'bg-red-500/20 text-red-400',
  admin:         'bg-purple-500/20 text-purple-400',
  floor_manager: 'bg-amber-500/20 text-amber-400',
  senior:        'bg-blue-500/20 text-blue-400',
  tele_sales:    'bg-emerald-500/20 text-emerald-400',
  back_office:   'bg-slate-500/20 text-slate-400',
  auditor:       'bg-teal-500/20 text-teal-400',
  archive:       'bg-slate-600/20 text-slate-500',
};

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, roleLabel, user, logout } = useAuth();

  // Apply role filter to every group, then drop empty groups so a teleseller
  // doesn't see a "Manage" header with nothing under it.
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !role || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  // Inject a dynamic "Modules" group of active custom modules (admin-ish roles
  // only — record routes are gated server-side to the same set).
  const { modules } = useModules();
  const canSeeModules = ['super_admin', 'admin', 'floor_manager', 'schema_editor'].includes(role);
  const customModules = canSeeModules
    ? (modules || [])
      .filter((m) => !m.is_system && m.is_active)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    : [];
  const renderGroups = [];
  for (const g of groups) {
    renderGroups.push(g);
    if (g.label === 'Workspace' && customModules.length) {
      renderGroups.push({
        label: 'Modules',
        items: customModules.map((m) => ({ href: `/m/${m.key}`, label: m.label_plural, icon: iconForModule(m) })),
      });
    }
  }

  const onLogout = async () => {
    await logout();
    toast.success('Signed out');
    router.replace('/login');
  };

  const initials =
    (((user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')).toUpperCase() ||
      (user?.email?.[0] || '?').toUpperCase());
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : (user?.name || user?.email || 'Signed out');

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel — translate via class on mobile, always visible on lg+ */}
      <aside
        className={cn(
          'sidebar-scope fixed inset-y-0 left-0 z-40 flex w-64 flex-col',
          'border-r border-white/[0.06]',
          'transition-transform duration-200 ease-out',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: '#0B1120' }}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/[0.06]">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500 shadow-[0_4px_12px_rgba(79,142,247,0.4)]">
              <TrendingUp size={15} className="text-white" strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none tracking-tight">
                CRM <span className="text-blue-400">1</span>
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">Trading Platform</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 lg:hidden text-white/40 hover:text-white hover:bg-white/[0.05]"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-3">
          {renderGroups.map((group, gi) => (
            <div key={group.label}>
              <p
                className={cn(
                  'px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30',
                  gi === 0 ? 'pt-2' : 'pt-3',
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                  return (
                    <li key={`${item.href}-${item.label}`}>
                      <Link href={item.href} onClick={onClose}>
                        <motion.div
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 relative',
                            active
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                              : 'text-white/50 hover:text-white/90 hover:bg-white/[0.05] border border-transparent'
                          )}
                        >
                          <Icon size={16} strokeWidth={2} className={cn('flex-shrink-0', active && 'text-blue-400')} />
                          <span>{item.label}</span>
                          {active && (
                            <motion.span
                              layoutId="sidebar-active-dot"
                              className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                        </motion.div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <Separator className="bg-white/[0.06]" />

        {/* User card */}
        <div className="p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-blue-500/20 text-blue-400 text-[11px] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/90 truncate leading-none">{displayName}</p>
              <span
                className={cn(
                  'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium mt-1.5',
                  ROLE_COLORS[role] || 'bg-slate-500/20 text-slate-400'
                )}
              >
                {roleLabel || (role || '').replace(/_/g, ' ') || '—'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="h-7 w-7 flex-shrink-0 text-white/30 hover:text-red-400 hover:bg-white/[0.05]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={13} />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
