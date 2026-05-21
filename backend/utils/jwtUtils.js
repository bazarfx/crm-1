const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signRefreshToken(payload) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  });
  return { token, jti };
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function parseExpiryToDate(expr) {
  // supports "15m" / "7d" / "1h" / numeric seconds
  if (typeof expr === 'number') return new Date(Date.now() + expr * 1000);
  const m = String(expr).match(/^(\d+)([smhdwy])$/);
  if (!m) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 }[unit];
  return new Date(Date.now() + n * mult * 1000);
}

function refreshTokenExpiry() {
  return parseExpiryToDate(REFRESH_EXPIRES);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  refreshTokenExpiry,
  parseExpiryToDate,
  ACCESS_EXPIRES,
  REFRESH_EXPIRES,
};
