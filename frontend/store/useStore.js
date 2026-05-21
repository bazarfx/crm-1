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
      isLoading: false,
      hydrated: false,
      configLoaded: false,
      permissionsLoaded: false,

      setUser: (user) => set({ user }),
      updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
      markHydrated: () => set({ hydrated: true }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/auth/login', { email, password });
          const data = unwrap(res);
          setTokens({
            accessToken: data?.accessToken || data?.access_token,
            refreshToken: data?.refreshToken || data?.refresh_token,
          });
          set({ user: data?.user || null, isLoading: false });
          return data?.user || null;
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
            permissionsLoaded: true,
          });
          return data.permissions || {};
        } catch {
          return get().permissions || {};
        }
      },

      /** Synchronous permission check against the cached map. */
      hasPermission: (key) => {
        const { isSuperAdmin, permissions } = get();
        if (isSuperAdmin) return true;
        const level = permissions?.[key];
        return Boolean(level) && level !== 'none';
      },

      /** Returns the level string for a permission key, defaulting to 'none'. */
      permissionLevel: (key) => {
        const { isSuperAdmin, permissions } = get();
        if (isSuperAdmin) return 'all';
        return permissions?.[key] || 'none';
      },

      fetchConfig: async () => {
        if (get().configLoaded || get().isLoading) return get().config;
        set({ isLoading: true });
        try {
          const res = await api.get('/config');
          const data = unwrap(res) || {};
          set({ config: data, configLoaded: true, isLoading: false });
          return data;
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
      onRehydrateStorage: () => (state) => state?.markHydrated?.(),
    }
  )
);
