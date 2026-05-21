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
      isLoading: false,
      hydrated: false,
      configLoaded: false,

      setUser: (user) => set({ user }),
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
        set({ user: null, config: {}, configLoaded: false });
        if (typeof window !== 'undefined') window.location.href = '/login';
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
