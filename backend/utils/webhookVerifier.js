const crypto = require('crypto');

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

function parseIpList(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function verifyIngestToken(req) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return { ok: false, reason: 'INGEST_TOKEN not configured' };
  const got = req.headers['x-ingest-token'];
  if (!got) return { ok: false, reason: 'Missing X-Ingest-Token' };
  if (!timingSafeEqualStr(String(got), expected)) {
    return { ok: false, reason: 'Invalid ingest token' };
  }
  return { ok: true };
}

function verifyArkWebhook(req) {
  const expected = process.env.ARK_WEBHOOK_SECRET;
  const allowList = parseIpList(process.env.ARK_WEBHOOK_IPS);
  const headerSecret = req.headers['x-ark-secret'];
  const ip = clientIp(req);

  // If secret is configured AND header is present, secret takes priority.
  if (expected && headerSecret) {
    return timingSafeEqualStr(String(headerSecret), expected)
      ? { ok: true, via: 'secret', ip }
      : { ok: false, reason: 'Invalid ARK secret', ip };
  }

  // Fallback: IP allowlist
  if (allowList.length > 0) {
    return allowList.includes(ip)
      ? { ok: true, via: 'ip', ip }
      : { ok: false, reason: `IP ${ip} not in allowlist`, ip };
  }

  // If a secret is configured but no header was sent and no IP list exists, reject.
  if (expected) return { ok: false, reason: 'Missing X-ARK-Secret', ip };

  return { ok: false, reason: 'No ARK auth configured (set ARK_WEBHOOK_SECRET or ARK_WEBHOOK_IPS)', ip };
}

module.exports = { verifyIngestToken, verifyArkWebhook, clientIp };
