const ACCESS_KEY = 'crm1_access_token';
const REFRESH_KEY = 'crm1_refresh_token';

const isBrowser = () => typeof window !== 'undefined';

export const getAccessToken = () =>
  isBrowser() ? window.localStorage.getItem(ACCESS_KEY) : null;

export const getRefreshToken = () =>
  isBrowser() ? window.localStorage.getItem(REFRESH_KEY) : null;

export const setTokens = ({ accessToken, refreshToken } = {}) => {
  if (!isBrowser()) return;
  if (accessToken) window.localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
};

export const clearTokens = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
};

export const TOKEN_KEYS = { ACCESS_KEY, REFRESH_KEY };
