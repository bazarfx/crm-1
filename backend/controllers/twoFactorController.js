// Opt-in TOTP two-factor auth (RFC 6238).
//
// Endpoints (mounted under /api/v1/auth):
//   POST /2fa/setup    (auth)   → create pending secret, return { secret, otpauth_url }
//   POST /2fa/enable   (auth)   → confirm pending secret, return { backup_codes } once
//   POST /2fa/disable  (auth)   → verify TOTP/backup code, turn 2FA off
//   GET  /2fa/status   (auth)   → { enabled }
//   POST /2fa/verify   (public) → exchange login challenge + TOTP/backup for a session
//
// Secrets and backup codes are stored via the `withTwoFactor` scope and never
// serialized back to the client (see User.defaultScope + toSafeJSON).

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { generateSecret, otpauthUrl, verifyTotp } = require('../utils/totp');
const { verifyTwoFactorChallenge } = require('../utils/jwtUtils');
const { success, error } = require('../utils/responseHelper');
const { issueSession } = require('./authController');

const BACKUP_CODE_COUNT = 8;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

// Load the current user WITH 2FA material. Every authed 2FA endpoint needs it.
function loadUserWith2FA(id) {
  return User.scope('withTwoFactor').findByPk(id);
}

// Human-friendly backup code: XXXX-XXXX from an unambiguous alphabet.
function generateBackupCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  const block = () => Array.from({ length: 4 }, pick).join('');
  return `${block()}-${block()}`;
}

async function hashBackupCodes(plainCodes) {
  return Promise.all(plainCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));
}

// Normalize a candidate backup code the same way we generated it, so casing /
// spacing / a missing hyphen still match.
function normalizeBackupCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Try to consume a backup code against a user's stored bcrypt hashes.
// On match: removes that hash, persists, returns true. Never reusable.
async function tryConsumeBackupCode(user, candidate) {
  const codes = Array.isArray(user.two_factor_backup_codes)
    ? user.two_factor_backup_codes
    : [];
  if (codes.length === 0) return false;

  const normalized = normalizeBackupCode(candidate);
  // Backup codes are 8 alnum chars once normalized; cheap guard before bcrypt.
  if (normalized.length !== 8) return false;
  const withHyphen = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;

  for (let i = 0; i < codes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const match = await bcrypt.compare(withHyphen, codes[i]);
    if (match) {
      const remaining = codes.slice(0, i).concat(codes.slice(i + 1));
      user.two_factor_backup_codes = remaining;
      user.changed('two_factor_backup_codes', true);
      await user.save();
      return true;
    }
  }
  return false;
}

async function audit(action, userId, req, extra = {}) {
  try {
    await AuditLog.create({
      user_id: userId,
      action,
      resource: 'User',
      resource_id: userId,
      new_data: extra,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    });
  } catch (e) {
    // Auditing must never break the auth flow.
    // eslint-disable-next-line no-console
    console.error('AuditLog failed for', action, e);
  }
}

// ── POST /2fa/setup ───────────────────────────────────────────────────────────
async function setup(req, res) {
  const user = await loadUserWith2FA(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  if (user.two_factor_enabled) {
    return error(res, 'Two-factor authentication is already enabled', 409, {
      code: '2FA_ALREADY_ENABLED',
    });
  }

  const secret = generateSecret(20);
  user.two_factor_pending_secret = secret;
  await user.save();

  const otpauth_url = otpauthUrl({
    secret,
    label: user.email,
    issuer: 'CRM 1',
  });

  return success(res, { secret, otpauth_url }, 'Scan the QR code, then confirm with a code');
}

// ── POST /2fa/enable { token } ────────────────────────────────────────────────
async function enable(req, res) {
  const { token } = req.body || {};
  if (!token) return error(res, 'token is required', 400);

  const user = await loadUserWith2FA(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  if (user.two_factor_enabled) {
    return error(res, 'Two-factor authentication is already enabled', 409, {
      code: '2FA_ALREADY_ENABLED',
    });
  }
  if (!user.two_factor_pending_secret) {
    return error(res, 'Call /2fa/setup first', 400, { code: '2FA_NO_PENDING_SECRET' });
  }

  if (!verifyTotp(user.two_factor_pending_secret, token, { window: 1 })) {
    return error(res, 'Invalid authentication code', 401, { code: '2FA_INVALID_CODE' });
  }

  // Generate + hash backup codes; plaintext is returned exactly once.
  const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashed = await hashBackupCodes(plainCodes);

  user.two_factor_secret = user.two_factor_pending_secret;
  user.two_factor_pending_secret = null;
  user.two_factor_enabled = true;
  user.two_factor_backup_codes = hashed;
  await user.save();

  await audit('2FA_ENABLE', user.id, req);

  return success(
    res,
    { backup_codes: plainCodes },
    'Two-factor authentication enabled. Save these backup codes now — they will not be shown again.',
  );
}

// ── POST /2fa/disable { token } ───────────────────────────────────────────────
// Accepts either a current TOTP or a valid backup code.
async function disable(req, res) {
  const { token } = req.body || {};
  if (!token) return error(res, 'token is required', 400);

  const user = await loadUserWith2FA(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  if (!user.two_factor_enabled) {
    return error(res, 'Two-factor authentication is not enabled', 400, {
      code: '2FA_NOT_ENABLED',
    });
  }

  const totpOk = verifyTotp(user.two_factor_secret, token, { window: 1 });
  const backupOk = totpOk ? false : await tryConsumeBackupCode(user, token);
  if (!totpOk && !backupOk) {
    return error(res, 'Invalid authentication code', 401, { code: '2FA_INVALID_CODE' });
  }

  user.two_factor_enabled = false;
  user.two_factor_secret = null;
  user.two_factor_pending_secret = null;
  user.two_factor_backup_codes = null;
  await user.save();

  await audit('2FA_DISABLE', user.id, req);

  return success(res, { enabled: false }, 'Two-factor authentication disabled');
}

// ── GET /2fa/status ───────────────────────────────────────────────────────────
async function status(req, res) {
  // req.user is set by verifyToken; enabled flag is safe to read from the
  // default-scoped instance (two_factor_enabled is not a secret).
  const user = await User.findByPk(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  return success(res, { enabled: !!user.two_factor_enabled }, 'OK');
}

// ── POST /2fa/verify { challenge, token } (PUBLIC) ────────────────────────────
// Second step of login: validate the short-lived challenge, verify TOTP or a
// backup code, then issue the real session exactly like a normal login.
async function verify(req, res) {
  const { challenge, token } = req.body || {};
  if (!challenge || !token) {
    return error(res, 'challenge and token are required', 400);
  }

  let payload;
  try {
    payload = verifyTwoFactorChallenge(challenge);
  } catch {
    return error(res, 'Invalid or expired challenge. Please log in again.', 401, {
      code: '2FA_CHALLENGE_INVALID',
    });
  }

  // Re-fetch with secrets; also re-run the same active-account checks login does.
  const user = await User.scope('withTwoFactor').findByPk(payload.uid, { paranoid: false });
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
  // Guard against a challenge issued before 2FA was turned off.
  if (!user.two_factor_enabled || !user.two_factor_secret) {
    return error(res, 'Two-factor authentication is not enabled', 400, {
      code: '2FA_NOT_ENABLED',
    });
  }

  const totpOk = verifyTotp(user.two_factor_secret, token, { window: 1 });
  const backupOk = totpOk ? false : await tryConsumeBackupCode(user, token);
  if (!totpOk && !backupOk) {
    return error(res, 'Invalid authentication code', 401, { code: '2FA_INVALID_CODE' });
  }

  await audit('2FA_LOGIN', user.id, req, { method: totpOk ? 'totp' : 'backup_code' });

  // Issue the real { user, accessToken, refreshToken } — identical to normal login.
  return issueSession(req, res, user);
}

module.exports = { setup, enable, disable, status, verify };
