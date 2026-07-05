'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api, { unwrap } from '@/lib/api';
import { clearTokens, getAccessToken, setTokens } from '@/lib/auth';

export const useStore = create()(
  persist(
    (set, get) => ({
      user: null,
      config: {},
      permissions: null, // { [permission_key]: 'all'|'own'|'group'|'read'|'none' }
      isSuperAdmin: false,
      isAdmin: false, // true for both super_admin AND admin — short-circuits permission checks
      isLoading: false,
      hydrated: false,
      configLoaded: false,
      permissionsLoaded: false,

      setUser: (user) => set({
        user,
        isSuperAdmin: user?.role === 'super_admin',
        isAdmin: user?.role === 'super_admin' || user?.role === 'admin',
      }),
      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
      markHydrated: () => set({ hydrated: true }),

      /**
       * Persist a successful login: store tokens + user and derive the
       * admin/super_admin flags. This is the single source of truth for what
       * "logged in" means — used by the normal login path AND the 2FA-verify
       * path (which returns the same { user, accessToken, refreshToken } shape).
       * Returns the user, mirroring `login`'s original return contract.
       */
      finishLogin: (data) => {
        setTokens({
          accessToken: data?.accessToken || data?.access_token,
          refreshToken: data?.refreshToken || data?.refresh_token,
        });
        const user = data?.user || null;
        set({
          user,
          isSuperAdmin: user?.role === 'super_admin',
          isAdmin: user?.role === 'super_admin' || user?.role === 'admin',
          isLoading: false,
        });
        return user;
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/auth/login', { email, password });
          const data = unwrap(res);
          // 2FA-gated accounts return { two_factor_required, challenge } and
          // NO tokens/user — don't persist anything; hand the challenge back to
          // the caller (login page) so it can show the code step.
          if (data?.two_factor_required) {
            set({ isLoading: false });
            return { two_factor_required: true, challenge: data.challenge };
          }
          return get().finishLogin(data);
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try { await api.post('/auth/logout'); } catch { /* silent */ }
        clearTokens();
        set({
          user: null,
          config: {},
          configLoaded: false,
          permissions: null,
          permissionsLoaded: false,
          isSuperAdmin: false,
          isAdmin: false,
        });
        if (typeof window !== 'undefined') window.location.href = '/login';
      },

      /**
       * Fetch the calling user's full permission map. Re-runnable; callers
       * (e.g. the visibilitychange hook in dashboard layout) invoke this on
       * tab focus so changes pushed from the permissions UI propagate quickly.
       */
      fetchPermissions: async () => {
        try {
          const res = await api.get('/permissions/me');
          const data = unwrap(res) || {};
          set({
            permissions: data.permissions || {},
            isSuperAdmin: !!data.is_super_admin,
            isAdmin: data.role === 'super_admin' || data.role === 'admin',
            permissionsLoaded: true,
          });
          return data.permissions || {};
        } catch {
          return get().permissions || {};
        }
      },

      /** Synchronous permission check against the cached map. */
      hasPermission: (key) => {
        const { isSuperAdmin, isAdmin, user, permissions } = get();
        // BRUTE-FORCE OVERRIDE: super_admin / admin always pass — never gated
        // by the async permission matrix. Read user.role directly so this
        // works immediately after rehydration, before fetchPermissions resolves.
        if (isSuperAdmin || isAdmin) return true;
        if (user?.role === 'super_admin' || user?.role === 'admin') return true;
        const level = permissions?.[key];
        return Boolean(level) && level !== 'none' && level !== false;
      },

      /**
       * Looser "can edit?" check. Admin + super_admin always pass without
       * consulting the permission matrix — they have unrestricted edit access
       * by design. For other roles, returns true if the level is editing-shaped
       * ('all' / 'own' / 'group').
       */
      canEdit: (key) => {
        const { isSuperAdmin, isAdmin, permissions } = get();
        if (isSuperAdmin || isAdmin) return true;
        const level = permissions?.[key];
        return level === 'all' || level === 'own' || level === 'group';
      },

      /** Returns the level string for a permission key, defaulting to 'none'. */
      permissionLevel: (key) => {
        const { isSuperAdmin, isAdmin, user, permissions } = get();
        if (isSuperAdmin || isAdmin) return 'all';
        if (user?.role === 'super_admin' || user?.role === 'admin') return 'all';
        return permissions?.[key] || 'none';
      },

      /** True when the calling user is the assignee on this lead. */
      isAssignedToMe: (lead) => {
        const { user } = get();
        return Boolean(user && lead && String(lead.assigned_to_id) === String(user.id));
      },

      /**
       * Lead-scoped edit check (distinct from the permission-key `canEdit`).
       * Admin / super_admin / floor_manager can always edit; telesellers and
       * seniors can edit only leads currently assigned to them.
       */
      canEditLead: (lead) => {
        const { isSuperAdmin, isAdmin, user } = get();
        if (!lead) return false;
        if (isSuperAdmin || isAdmin) return true;
        const role = user?.role;
        // BRUTE-FORCE OVERRIDE: never gate admin / super_admin behind flags
        if (role === 'super_admin' || role === 'admin') return true;
        if (role === 'floor_manager') return true;
        if ((role === 'tele_sales' || role === 'senior')
            && String(lead.assigned_to_id) === String(user?.id)) return true;
        return false;
      },

      /** Only roles that may reassign a lead to a different user. */
      canReassignLead: () => {
        const { isSuperAdmin, isAdmin, user, permissions } = get();
        if (isSuperAdmin || isAdmin) return true;
        // BRUTE-FORCE OVERRIDE: super_admin / admin always reassign
        if (user?.role === 'super_admin' || user?.role === 'admin') return true;
        if (user?.role === 'floor_manager') return true;
        const level = permissions?.['leads.reassign'];
        return Boolean(level) && level !== 'none';
      },

      fetchConfig: async () => {
        if (get().configLoaded || get().isLoading) return get().config;
        set({ isLoading: true });
        try {
          const res = await api.get('/config');
          const data = unwrap(res);
          // /config returns a flat array of rows. Group them by category so
          // callers can read e.g. config.lead_status / config.lead_source as
          // arrays without each page rebuilding the grouping itself.
          let grouped = {};
          if (Array.isArray(data)) {
            for (const row of data) {
              if (!row?.category) continue;
              (grouped[row.category] ||= []).push(row);
            }
          } else if (data && typeof data === 'object') {
            grouped = data;
          }
          set({ config: grouped, configLoaded: true, isLoading: false });
          return grouped;
        } catch {
          set({ isLoading: false });
          return get().config;
        }
      },

      isAuthenticated: () => {
        const { user, hydrated } = get();
        return hydrated && Boolean(user) && Boolean(getAccessToken());
      },

      hasRole: (...roles) => {
        const role = get().user?.role;
        return Boolean(role) && roles.includes(role);
      },
    }),
    {
      name: 'crm1-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : undefined
      ),
      partialize: (s) => ({ user: s.user }),
      // Rederive admin/super_admin flags from the persisted user.role the
      // instant the store rehydrates, so detail pages don't render with
      // canEdit=false on a hard reload while waiting for fetchPermissions.
      onRehydrateStorage: () => (state) => {
        if (state) {
          // If the persisted user blob outlived the access token (hardLogout,
          // wipe in another tab, etc.), drop the user too — otherwise the
          // login page thinks we're signed in while the dashboard layout
          // thinks we're not, and the two ping-pong redirect each other.
          if (typeof window !== 'undefined' && state.user && !getAccessToken()) {
            state.user = null;
          }
          const role = state.user?.role;
          state.isSuperAdmin = role === 'super_admin';
          state.isAdmin = role === 'super_admin' || role === 'admin';
          state.markHydrated?.();
        }
      },
    }
  )
);

// Allow both `import { useStore } from '@/store/useStore'` (existing callers)
// and `import useStore from '@/store/useStore'` (newer spec).
export default useStore;
