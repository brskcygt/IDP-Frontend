'use strict';

/**
 * A tiny HTTP listener whose only job is receiving forwarded OTP messages.
 *
 * The desktop app talks to its backend over IPC and opens no ports — that was
 * the point of the IPC migration. But automatic OTP capture needs an inbound
 * path: a phone forwards the gateway's SMS to an HTTP endpoint, and without one
 * the operator has to read the code and type it by hand.
 *
 * So this is deliberately narrow and deliberately opt-in:
 *   - starts ONLY when MFA_WEBHOOK_API_KEY is set
 *   - serves exactly one route, POST /api/mfa/webhook-otp
 *   - every request must carry the API key
 *   - rate limited
 *   - answers nothing else, on any method or path
 *
 * It binds to all interfaces because the phone reaches it across the LAN — that
 * is the whole feature. Leave MFA_WEBHOOK_API_KEY unset and no port is opened.
 */

const http = require('http');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 8 * 1024;

let server = null;

/**
 * Recent inbound attempts, newest first.
 *
 * "I pointed my phone at it and nothing happened" is unanswerable without
 * this: the reason a forwarded message was turned away only ever reached
 * stdout, which a Finder-launched app does not have. Never stores the message
 * body or the code — only what is needed to explain the outcome.
 */
const RECENT_LIMIT = 20;
const recentAttempts = [];

function recordAttempt(outcome, detail) {
  recentAttempts.unshift({ at: new Date().toISOString(), outcome, detail });
  if (recentAttempts.length > RECENT_LIMIT) recentAttempts.length = RECENT_LIMIT;
}

/** @returns {Array<{at: string, outcome: string, detail: string}>} */
function getRecentAttempts() {
  return recentAttempts.slice();
}

/** Constant-time compare of two secrets of any length. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Interfaces a phone on the same Wi-Fi can never reach: VPN tunnels, IPsec,
 * point-to-point links, Apple Wireless Direct, and bridges. Listing their
 * addresses alongside the real one is worse than useless — it invites picking
 * one that silently cannot work, which is exactly what happened.
 */
const UNREACHABLE_IFACE = /^(utun|ipsec|ppp|awdl|llw|bridge|gif|stf|anpi|ap\d)/i;

/**
 * IPv4 addresses a device on the same network could actually post to.
 * @returns {Array<{ address: string, iface: string }>}
 */
function lanAddresses() {
  const out = [];
  for (const [iface, entries] of Object.entries(os.networkInterfaces())) {
    if (UNREACHABLE_IFACE.test(iface)) continue;
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        out.push({ address: entry.address, iface });
      }
    }
  }
  return out;
}

/**
 * Best-effort body parsing across the shapes forwarder apps actually send.
 * Always returns an object; `_raw` carries the untouched text so an
 * unstructured payload can still be treated as the message.
 */
function parseBody(raw, contentType) {
  const text = raw || '';
  const base = { _raw: text.trim() };

  if (contentType.includes('application/json')) {
    try { return { ...base, ...JSON.parse(text || '{}') }; } catch { return base; }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text);
    return { ...base, ...Object.fromEntries(params.entries()) };
  }

  // No usable content-type: try JSON anyway, fall back to raw text.
  try { return { ...base, ...JSON.parse(text) }; } catch { return base; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {object} deps
 * @param {object} deps.otpWebhookManager - backend's OtpWebhookManager
 * @param {Function} deps.createRateLimiter - backend's core rate limiter factory
 * @param {Function} [deps.log]
 * @returns {{ port: number, urls: string[] } | null} null when disabled
 */
function startOtpWebhookServer({ otpWebhookManager, createRateLimiter, log = console.log }) {
  const apiKey = process.env.MFA_WEBHOOK_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    log('[webhook] MFA_WEBHOOK_API_KEY is not set — the OTP forwarding endpoint is disabled.');
    return null;
  }

  const port = parseInt(process.env.IDP_WEBHOOK_PORT || String(DEFAULT_PORT), 10);
  const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });

  server = http.createServer(async (req, res) => {
    const reply = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const isWebhookPath = url.pathname === '/api/mfa/webhook-otp';

    // A GET is a reachability probe, nothing more. "I pointed my phone at the
    // URL and nothing happened" is impossible to diagnose blind — opening this
    // in the phone's browser answers the only question that matters first: can
    // the phone reach this machine at all? It reveals no secret.
    if (req.method === 'GET' && isWebhookPath) {
      return reply(200, {
        ok: true,
        message: 'IDP OTP endpoint is reachable. Send the code as a POST.',
        expects: {
          method: 'POST',
          apiKey: 'body field "apiKey", header "X-API-Key", or "Authorization: Bearer <key>"',
          message: 'body field "message" or "text" (JSON, form-encoded, or raw text)',
        },
      });
    }

    if (req.method !== 'POST' || !isWebhookPath) {
      return reply(404, { error: 'Not found.' });
    }

    const key = req.socket.remoteAddress || 'unknown';
    const { allowed, retryAfterMs } = limiter.check(key);
    if (!allowed) {
      return reply(429, { error: `Too many requests. Retry in ${Math.ceil(retryAfterMs / 1000)}s.` });
    }

    // Forwarder apps differ wildly: some post JSON, some post a form, some post
    // the raw SMS text with no structure at all, and many cannot add a custom
    // body field but can add a header. Accept all of it rather than making the
    // operator reverse-engineer which shape this endpoint wanted.
    const raw = await readBody(req);
    const body = parseBody(raw, req.headers['content-type'] || '');

    const providedKey =
      body.apiKey ||
      req.headers['x-api-key'] ||
      (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1] ||
      url.searchParams.get('apiKey');

    if (!providedKey || !safeEqual(providedKey, apiKey)) {
      recordAttempt('rejected', providedKey ? 'API key did not match' : 'no API key supplied');
      log('[webhook] Rejected: bad or missing API key.');
      return reply(401, { error: 'Unauthorized. Supply the key in the body, X-API-Key, or Authorization: Bearer.' });
    }

    const message = body.message || body.text || body._raw;
    if (!message) {
      recordAttempt('rejected', 'request carried no message text');
      return reply(400, { error: 'Missing message.' });
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const resolved = otpWebhookManager.receiveOtp(sessionId, message);

    if (!resolved) {
      const hasCode = /\b\d{6}\b/.test(message);
      recordAttempt(
        'ignored',
        hasCode
          ? 'a 6-digit code arrived, but no deployment was waiting for one'
          : 'no 6-digit code found in the message text'
      );
      log('[webhook] Ignored: nothing is waiting for a code, or no 6-digit code in the message.');
      return reply(404, { error: 'No deployment is waiting for a one-time code.' });
    }

    recordAttempt('accepted', 'code matched the waiting deployment');
    log('[webhook] A forwarded code was matched to the waiting deployment.');
    return reply(200, { success: true });
  });

  server.on('error', (err) => {
    log(`[webhook] Could not start on port ${port}: ${err.message}`);
    // Record it so "Son OTP istekleri" can explain the silence. A stale
    // instance still holding the port is invisible otherwise: the new window
    // looks fine, but every forwarded message is answered by the old process
    // with the old key — which reads as "wrong API key" and sends you hunting
    // in entirely the wrong place.
    recordAttempt(
      'rejected',
      err.code === 'EADDRINUSE'
        ? `port ${port} is already in use — another copy of the app is probably still running`
        : `listener failed to start: ${err.message}`
    );
    server = null;
  });

  server.listen(port, '0.0.0.0', () => {
    const urls = lanAddresses().map(({ address }) => `http://${address}:${port}/api/mfa/webhook-otp`);
    log(`[webhook] Listening for forwarded OTP messages on port ${port}.`);
    for (const url of urls) log(`[webhook]   Point your SMS forwarder at: ${url}`);
  });

  return {
    port,
    urls: lanAddresses().map(({ address }) => `http://${address}:${port}/api/mfa/webhook-otp`),
    interfaces: lanAddresses(),
  };
}

function stopOtpWebhookServer() {
  if (!server) return;
  try { server.close(); } catch { /* already closing */ }
  server = null;
}

module.exports = { startOtpWebhookServer, stopOtpWebhookServer, getRecentAttempts, DEFAULT_PORT };
