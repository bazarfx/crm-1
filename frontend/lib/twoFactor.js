import api, { unwrap } from '@/lib/api';

/**
 * Two-factor (TOTP) auth API helpers. Every backend response is wrapped in
 * { success, message, data } — we always return the unwrapped `data`.
 *
 * The verify step is PUBLIC (no auth token yet — the user is mid-login), the
 * rest run against the logged-in user's own account.
 */

/** GET /auth/2fa/status → { enabled: boolean } */
export async function get2FAStatus() {
  const res = await api.get('/auth/2fa/status');
  return unwrap(res) || { enabled: false };
}

/** POST /auth/2fa/setup → { secret, otpauth_url } */
export async function setup2FA() {
  const res = await api.post('/auth/2fa/setup');
  return unwrap(res) || {};
}

/** POST /auth/2fa/enable { token } → { backup_codes: string[] } (shown ONCE) */
export async function enable2FA(token) {
  const res = await api.post('/auth/2fa/enable', { token });
  return unwrap(res) || {};
}

/** POST /auth/2fa/disable { token } → { enabled: false } */
export async function disable2FA(token) {
  const res = await api.post('/auth/2fa/disable', { token });
  return unwrap(res) || { enabled: false };
}

/**
 * POST /auth/2fa/verify { challenge, token } → { user, accessToken, refreshToken }
 * PUBLIC — completes a login that was gated by 2FA.
 */
export async function verify2FA(challenge, token) {
  const res = await api.post('/auth/2fa/verify', { challenge, token });
  return unwrap(res) || {};
}
