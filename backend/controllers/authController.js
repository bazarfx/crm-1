const { User, RefreshToken } = require('../models');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signTwoFactorChallenge,
  refreshTokenExpiry,
} = require('../utils/jwtUtils');
const { success, error } = require('../utils/responseHelper');
const { clientIp } = require('../utils/webhookVerifier');

// Mint the real session (access + refresh + safe user) and persist the refresh
// token. Shared by normal login AND the 2FA /verify step so both paths produce
// a byte-for-byte identical session response. Returns the payload object; the
// caller wraps it with success().
async function issueSession(req, res, user) {
  const payload = { sub: user.id, role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const { token: refreshToken } = signRefreshToken({ sub: user.id });

  await RefreshToken.create({
    user_id: user.id,
    token: refreshToken,
    expires_at: refreshTokenExpiry(),
    ip_address: clientIp(req),
    user_agent: req.headers['user-agent'] || null,
  });

  user.last_login_at = new Date();
  await user.save();

  return success(
    res,
    {
      accessToken,
      refreshToken,
      user: user.toSafeJSON(),
    },
    'Logged in',
  );
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return error(res, 'email and password are required', 400);
  }

  // paranoid:false so we can tell a deleted account why login failed.
  const user = await User.scope('withPassword').findOne({
    where: { email },
    paranoid: false,
  });
  if (!user) return error(res, 'Invalid credentials', 401);

  if (user.deletedAt) {
    return error(res, 'This account has been deleted. Contact your administrator.', 403, {
      code: 'USER_DELETED',
    });
  }
  if (!user.is_active) {
    return error(res, 'This account is deactivated. Contact your administrator.', 403, {
      code: 'USER_DEACTIVATED',
    });
  }

  const ok = await user.comparePassword(password);
  if (!ok) return error(res, 'Invalid credentials', 401);

  // ── 2FA gate ────────────────────────────────────────────────────────────────
  // Only when the user has explicitly enabled 2FA. This branch is wrapped so a
  // failure inside it can NEVER fall through to issuing tokens for a user who
  // should have been challenged — it returns 500 instead. Users without 2FA
  // skip this block entirely and get the exact same session as before.
  if (user.two_factor_enabled === true) {
    try {
      const challenge = signTwoFactorChallenge(user.id);
      return success(
        res,
        { two_factor_required: true, challenge },
        'Two-factor authentication required',
      );
    } catch (e) {
      // Signing failed for a 2FA user: fail closed, do NOT issue real tokens.
      // eslint-disable-next-line no-console
      console.error('2FA challenge issuance failed for user', user.id, e);
      return error(res, 'Unable to start two-factor authentication', 500);
    }
  }

  // ── Non-2FA users: original behavior, unchanged ──────────────────────────────
  return issueSession(req, res, user);
}

async function refresh(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return error(res, 'refreshToken is required', 400);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return error(res, 'Invalid or expired refresh token', 401);
  }

  const record = await RefreshToken.findOne({
    where: { token: refreshToken, user_id: payload.sub, is_revoked: false },
  });
  if (!record) return error(res, 'Refresh token revoked or unknown', 401);
  if (record.expires_at < new Date()) {
    return error(res, 'Refresh token expired', 401);
  }

  const user = await User.findByPk(payload.sub);
  if (!user || !user.is_active) return error(res, 'User not found or inactive', 401);

  // Rotate
  record.is_revoked = true;
  await record.save();

  const newAccess = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const { token: newRefresh } = signRefreshToken({ sub: user.id });

  await RefreshToken.create({
    user_id: user.id,
    token: newRefresh,
    expires_at: refreshTokenExpiry(),
    ip_address: clientIp(req),
    user_agent: req.headers['user-agent'] || null,
  });

  return success(res, { accessToken: newAccess, refreshToken: newRefresh }, 'Refreshed');
}

async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await RefreshToken.update(
      { is_revoked: true },
      { where: { token: refreshToken } },
    );
  }
  return success(res, null, 'Logged out');
}

async function me(req, res) {
  const user = await User.findByPk(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  return success(res, user.toSafeJSON(), 'OK');
}

// POST /auth/change-password
// Used by the "first-login forced password change" flow. When the user has
// must_change_password=true they don't need to supply current_password.
// Otherwise current_password is required.
async function changeOwnPassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return error(res, 'New password must be at least 6 characters', 400);
  }

  const user = await User.scope('withPassword').findByPk(req.user.id);
  if (!user) return error(res, 'User not found', 404);

  if (user.must_change_password) {
    // No current_password required on a forced reset.
  } else {
    if (!current_password) return error(res, 'Current password required', 400);
    const ok = await user.comparePassword(current_password);
    if (!ok) return error(res, 'Current password is incorrect', 401);
  }

  user.password = new_password;
  user.must_change_password = false;
  await user.save();

  return success(res, null, 'Password changed successfully');
}

module.exports = { login, refresh, logout, me, changeOwnPassword, issueSession };
