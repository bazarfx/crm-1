// Dependency-free TOTP (RFC 6238) + HOTP (RFC 4226) using Node's built-in
// `crypto` only. No external packages (no speakeasy / otplib).
//
// Provides:
//   base32Encode(buf)                          → RFC 4648 base32, NO padding
//   base32Decode(str)                          → Buffer
//   generateSecret(len = 20)                   → base32 secret string
//   hotp(secretBase32, counter, opts)          → zero-padded OTP string
//   totp(secretBase32, opts)                   → current OTP string
//   verifyTotp(secretBase32, token, opts)      → boolean (current step ± window)
//   otpauthUrl({ secret, label, issuer })      → otpauth://totp/... URI
//
// Design notes:
//   - Constant-time comparison for the final token check.
//   - Default step 30s, 6 digits, SHA1 — the de-facto standard that Google
//     Authenticator / Authy / 1Password all speak.

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ── Base32 (RFC 4648, no padding) ────────────────────────────────────────────
function base32Encode(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i += 1) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out; // no '=' padding
}

function base32Decode(str) {
  if (typeof str !== 'string') throw new TypeError('base32Decode expects a string');
  // Strip padding + whitespace, uppercase.
  const clean = str.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) throw new Error(`Invalid base32 character: ${clean[i]}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── Secret generation ────────────────────────────────────────────────────────
function generateSecret(len = 20) {
  return base32Encode(crypto.randomBytes(len));
}

// ── HOTP (RFC 4226) ──────────────────────────────────────────────────────────
function hotp(secretBase32, counter, { digits = 6, algorithm = 'sha1' } = {}) {
  const key = base32Decode(secretBase32);

  // 8-byte big-endian counter.
  const buf = Buffer.alloc(8);
  // Use BigInt to be safe past 2^32; counters here are small, but correctness first.
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i -= 1) {
    buf[i] = Number(c & 0xffn);
    c >>= 8n;
  }

  const hmac = crypto.createHmac(algorithm, key).update(buf).digest();

  // Dynamic truncation (RFC 4226 §5.3).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binCode % 10 ** digits;
  return String(otp).padStart(digits, '0');
}

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────
function counterForTime(t, step) {
  return Math.floor(t / 1000 / step);
}

function totp(secretBase32, { step = 30, digits = 6, algorithm = 'sha1', t = Date.now() } = {}) {
  return hotp(secretBase32, counterForTime(t, step), { digits, algorithm });
}

// Constant-time string compare (guards against timing side-channels on the
// final code check). Falls back to false on any length/format mismatch.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Accept the current step and ±window neighbouring steps to tolerate clock
// drift and the user typing right at a boundary. window=1 → checks 3 codes.
function verifyTotp(secretBase32, token, { step = 30, digits = 6, algorithm = 'sha1', window = 1, t = Date.now() } = {}) {
  if (!secretBase32 || token == null) return false;
  const normalized = String(token).replace(/\s+/g, '');
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) return false;

  const base = counterForTime(t, step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    const candidate = hotp(secretBase32, base + errorWindow, { digits, algorithm });
    if (safeEqual(candidate, normalized)) return true;
  }
  return false;
}

// ── otpauth:// URI for QR codes ──────────────────────────────────────────────
function otpauthUrl({ secret, label, issuer = 'CRM 1', digits = 6, period = 30, algorithm = 'SHA1' }) {
  if (!secret || !label) throw new Error('otpauthUrl requires secret and label');
  const issuerEnc = encodeURIComponent(issuer);
  const labelEnc = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${labelEnc}?${params.toString()}`;
}

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  totp,
  verifyTotp,
  otpauthUrl,
  // exported for tests
  _counterForTime: counterForTime,
};
