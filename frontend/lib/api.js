import axios from 'axios';
import toast from 'react-hot-toast';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth';

const baseURL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api/v1';

export const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight = null;

const performRefresh = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
  const next = data?.data || data;
  setTokens({
    accessToken: next?.accessToken,
    refreshToken: next?.refreshToken,
  });
  return next?.accessToken;
};

/**
 * Hard logout — used when the user's account has been deactivated, deleted,
 * or their token is irrecoverably invalid. Shows a reason toast (if one is
 * provided), clears local auth state, and redirects to /login. Avoids the
 * redirect loop if we're already on /login.
 */
const hardLogout = (reason) => {
  if (typeof window === 'undefined') return;
  if (reason) toast.error(reason, { duration: 4500 });
  clearTokens();
  // Clear Zustand-persisted user blob too so the next page load can't rehydrate
  try { window.localStorage.removeItem('crm1-store'); } catch {}
  if (window.location.pathname !== '/login') {
    setTimeout(() => { window.location.href = '/login'; }, 600);
  }
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {};
    const status = err.response?.status;
    const code = err.response?.data?.code;

    // ── Account-state codes — no point retrying with a refreshed token ──
    if (status === 401 && (code === 'USER_DEACTIVATED' || code === 'USER_DELETED')) {
      hardLogout(
        code === 'USER_DEACTIVATED'
          ? 'Your account has been deactivated. Contact your administrator.'
          : 'Your account has been deleted.'
      );
      return Promise.reject(err);
    }

    // ── Generic 401 → try a refresh ONCE, then hard-logout ──
    if (status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        if (!refreshInFlight) {
          refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
        }
        const newToken = await refreshInFlight;
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api.request(original);
        }
      } catch {
        hardLogout(code === 'TOKEN_EXPIRED' ? 'Session expired. Please log in again.' : null);
      }
    }

    return Promise.reject(err);
  }
);

export const unwrap = (res) => res?.data?.data ?? res?.data;

export default api;
