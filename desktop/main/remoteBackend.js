'use strict';

/**
 * Remote mode (`IDP_SERVER_URL` set): the backend runs on a separate server on
 * the internal network. This process serves the bundled frontend from LOCAL
 * files and forwards `/api/*` to that server.
 *
 * Why a custom `app://idp` origin instead of loading `file://` and letting the
 * renderer call `http://<server>` directly: that would be a cross-origin call,
 * needing CORS on the backend plus a cross-site session cookie — and a
 * cross-site cookie needs `SameSite=None; Secure`, which plain HTTP (no TLS on
 * the internal server) cannot carry. Serving the UI and the API from ONE origin
 * makes every renderer request same-origin; the main process makes the actual
 * network hop with Node's own `fetch` (undici — deliberately not Electron's
 * `net.fetch`, so no Chromium cookie store is involved).
 *
 * The session cookie never reaches the renderer: `set-cookie` from the backend
 * is kept in the in-memory jar below and replayed as a `Cookie` header on
 * later requests. Closing the app ends the session (accepted for v1).
 *
 * Only the `IDP_SERVER_URL` origin is ever contacted — the target URL is the
 * fixed origin + the request path; the renderer cannot choose a host.
 */
const fs = require('fs');
const path = require('path');

const APP_SCHEME = 'app';
const APP_HOST = 'idp';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;

/** For `protocol.registerSchemesAsPrivileged` — must be registered before app 'ready'. */
const APP_SCHEME_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
});

/**
 * How long to wait for the server to START answering (status line + headers).
 * The timer is cleared as soon as headers arrive, so a long-lived SSE body is
 * never cut by it. An unreachable host fails earlier on undici's own connect
 * timeout (10 s).
 */
const RESPONSE_HEADERS_TIMEOUT_MS = 120_000;

/**
 * Allowlist, not denylist: only content negotiation / SSE resume headers go
 * upstream. Renderer-supplied `cookie`, `host`, `origin`, `referer`, `sec-*`
 * never do — the cookie comes from the jar, the host from IDP_SERVER_URL.
 */
const FORWARDED_REQUEST_HEADERS = Object.freeze([
  'accept',
  'accept-language',
  'cache-control',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'last-event-id',
  'pragma',
]);

/**
 * `set-cookie` stays in the main process. `content-encoding`/`content-length`
 * are dropped because undici already decompressed the body (forwarding them
 * would make Chromium decode twice / truncate). The rest are hop-by-hop.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'set-cookie2',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-connection',
  'upgrade',
  'trailer',
  'te',
]);

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * Explicit MIME map rather than the OS lookup: on Windows the registry can map
 * `.js` to `text/plain`, which makes Chromium refuse module scripts.
 */
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
});

class RemoteUnreachableError extends Error {
  constructor(reason) {
    super(`IDP sunucusuna ulaşılamadı: ${reason}`);
    this.name = 'RemoteUnreachableError';
  }
}

/**
 * Validates `IDP_SERVER_URL` and returns its origin (`http://10.0.0.5:3001`).
 * Only scheme + host + port are accepted — a path (e.g. a stray `/api`) would
 * silently double up with the forwarded `/api/...` path, so it is rejected.
 * @param {string} raw
 * @returns {string}
 */
function parseServerUrl(raw) {
  const value = String(raw ?? '').trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`IDP_SERVER_URL geçerli bir adres değil: "${value}" (örnek: http://10.0.0.5:3001).`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`IDP_SERVER_URL http:// veya https:// ile başlamalı (verilen: ${url.protocol}).`);
  }
  if (!url.hostname) {
    throw new Error('IDP_SERVER_URL bir sunucu adı veya IP adresi içermeli.');
  }
  if (url.username || url.password) {
    throw new Error('IDP_SERVER_URL kullanıcı adı veya parola içeremez.');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error(
      `IDP_SERVER_URL yalnızca şema, sunucu ve port içermeli (örnek: http://10.0.0.5:3001); ` +
      `"${url.pathname}${url.search}${url.hash}" kısmını kaldırın.`
    );
  }
  return url.origin;
}

// --- Cookie jar (RFC 6265 subset: one origin, so no domain matching) -------

/** RFC 6265 §5.1.4 default-path. */
function defaultCookiePath(requestPath) {
  if (!requestPath.startsWith('/')) return '/';
  const lastSlash = requestPath.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : requestPath.slice(0, lastSlash);
}

/** RFC 6265 §5.1.4 path-match. */
function pathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

/**
 * @returns {{ name: string, value: string, path: string, expiresAt: number | null } | null}
 *   `expiresAt === null` is a session cookie (lives until the app exits).
 */
function parseSetCookie(header, requestPath, now) {
  const [pair, ...attributes] = String(header).split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  let cookiePath = null;
  let maxAge = null;
  let expires = null;
  for (const attribute of attributes) {
    const sep = attribute.indexOf('=');
    const key = (sep === -1 ? attribute : attribute.slice(0, sep)).trim().toLowerCase();
    const attrValue = sep === -1 ? '' : attribute.slice(sep + 1).trim();
    if (key === 'max-age' && /^-?\d+$/.test(attrValue)) {
      maxAge = Number(attrValue);
    } else if (key === 'expires') {
      const time = Date.parse(attrValue);
      if (!Number.isNaN(time)) expires = time;
    } else if (key === 'path' && attrValue.startsWith('/')) {
      cookiePath = attrValue;
    }
    // Secure / HttpOnly / SameSite / Domain: irrelevant here — there is exactly
    // one upstream origin, and the renderer never sees these cookies at all.
  }

  // Max-Age wins over Expires regardless of order (RFC 6265 §5.3 step 3).
  let expiresAt = null;
  if (maxAge !== null) expiresAt = maxAge <= 0 ? 0 : now + maxAge * 1000;
  else if (expires !== null) expiresAt = expires;

  return { name, value, path: cookiePath ?? defaultCookiePath(requestPath), expiresAt };
}

function createCookieJar() {
  /** @type {Map<string, { name: string, value: string, path: string, expiresAt: number | null }>} */
  const cookies = new Map();
  const keyOf = (cookie) => `${cookie.name}\u0000${cookie.path}`;

  // Bumped by clear() (logout). A request remembers the generation it was sent
  // under; if a logout happened meanwhile, its response's set-cookie is dropped.
  // Without this, rolling sessions (connect.sid re-sent on every response) plus
  // a poll that was in flight during logout would refill the just-cleared jar.
  let generation = 0;

  return {
    /**
     * Applies a response's `set-cookie` list. Expired / `Max-Age=0` deletes.
     * @param {number} [sentGeneration] - `generation` when the request was sent.
     * @returns {boolean} false when ignored because a clear() happened since.
     */
    store(setCookieHeaders, requestPath, now = Date.now(), sentGeneration = generation) {
      if (sentGeneration !== generation) return false;
      for (const header of setCookieHeaders) {
        const cookie = parseSetCookie(header, requestPath, now);
        if (!cookie) continue;
        if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
          cookies.delete(keyOf(cookie));
        } else {
          cookies.set(keyOf(cookie), cookie);
        }
      }
      return true;
    },
    /** @returns {string} value for a `Cookie` request header ('' when none). */
    headerFor(requestPath, now = Date.now()) {
      const matching = [];
      for (const [key, cookie] of cookies) {
        if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
          cookies.delete(key);
          continue;
        }
        if (pathMatches(requestPath, cookie.path)) matching.push(cookie);
      }
      matching.sort((a, b) => b.path.length - a.path.length);
      return matching.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    },
    clear() {
      cookies.clear();
      generation += 1;
    },
    /** Capture when sending a request; pass back to store() with its response. */
    get generation() {
      return generation;
    },
    get size() {
      return cookies.size;
    },
  };
}

// --- Responses ---------------------------------------------------------------

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 502 in the shape the task contract fixes; `error` mirrors `message` so httpTransport's `readErrorMessage()` shows it. */
function gatewayError(message) {
  return jsonResponse(502, { type: false, message, error: message });
}

function textResponse(status, text) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function describeFetchFailure(err, timedOut, timeoutMs) {
  if (timedOut) return `${Math.round(timeoutMs / 1000)} sn içinde yanıt gelmedi (zaman aşımı)`;
  const cause = err && err.cause;
  const code =
    (cause && cause.code) ||
    (cause && Array.isArray(cause.errors) && cause.errors[0] && cause.errors[0].code) ||
    null;
  const message = (cause && cause.message) || (err && err.message) || String(err);
  return code && !message.includes(code) ? `${code} (${message})` : message;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative));
}

async function statOrNull(filePath) {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.serverOrigin - from `parseServerUrl()`.
 * @param {string} options.frontendRoot - directory holding the built `index.html`.
 * @param {string} options.contentSecurityPolicy - sent with every HTML document.
 */
function createRemoteBackend({ serverOrigin, frontendRoot, contentSecurityPolicy }) {
  const jar = createCookieJar();
  const root = path.resolve(frontendRoot);

  /**
   * The one place that talks to the server. `pathAndQuery` is appended to the
   * fixed origin by string concatenation (never `new URL(path, base)`, which
   * would let `//other-host/...` switch hosts) and the result is re-checked.
   */
  async function forward(pathAndQuery, options = {}) {
    const {
      method = 'GET',
      headers = new Headers(),
      body = null,
      timeoutMs = RESPONSE_HEADERS_TIMEOUT_MS,
      withCookies = true,
      signal = null,
    } = options;

    const target = new URL(`${serverOrigin}${pathAndQuery}`);
    if (target.origin !== serverOrigin || !target.pathname.startsWith('/api')) {
      throw new Error(`Refusing to forward outside ${serverOrigin}/api: ${target.href}`);
    }

    // Captured BEFORE sending: if a logout clears the jar while this request is
    // in flight, its (rolling) set-cookie must not bring the session back.
    const sentGeneration = jar.generation;
    if (withCookies) {
      const cookie = jar.headerFor(target.pathname);
      if (cookie) headers.set('cookie', cookie);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // A renderer-side cancel (fetch aborted, EventSource closed, page unloaded)
    // aborts the upstream request as well — before the headers arrive AND
    // afterwards, because the response body shares this signal. Only the timer
    // is cleared once headers are in; this link stays for the body's lifetime.
    let cancelledByRenderer = false;
    const onRendererAbort = () => {
      cancelledByRenderer = true;
      controller.abort();
    };
    if (signal) {
      if (signal.aborted) onRendererAbort();
      else signal.addEventListener('abort', onRendererAbort, { once: true });
    }

    try {
      const init = { method, headers, redirect: 'manual', signal: controller.signal };
      if (body) {
        init.body = body;
        init.duplex = 'half';
      }
      const response = await fetch(target, init);
      if (withCookies) {
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) jar.store(setCookies, target.pathname, Date.now(), sentGeneration);
      }
      return response;
    } catch (err) {
      const reason = cancelledByRenderer
        ? 'istek arayüz tarafından iptal edildi'
        : describeFetchFailure(err, controller.signal.aborted, timeoutMs);
      throw new RemoteUnreachableError(reason);
    } finally {
      // Headers are in (or the request failed): the TIMER must not abort the
      // body from here on, or a live SSE stream would be cut at the timeout.
      clearTimeout(timer);
    }
  }

  // --- Renderer cancellation -------------------------------------------------
  // Electron 43 hands protocol.handle a Request whose `signal` never fires
  // when the renderer cancels (verified: renderer fetch aborted at 800 ms, the
  // signal stayed silent, the upstream request kept waiting). The session's
  // webRequest events do see it: onBeforeRequest runs just before the handler
  // (same request id) and onErrorOccurred reports net::ERR_ABORTED at the
  // moment of the cancel. The handler receives no id, so API requests are
  // paired FIFO per "METHOD URL". Worst case of a mis-pairing (two identical
  // requests in flight, handled out of order): the other of the two identical
  // requests is cancelled upstream.
  const API_URL_PREFIX = `${APP_ORIGIN}/api/`;
  const pendingIdsByKey = new Map(); // "METHOD URL" -> [webRequest id, ...]
  const abortById = new Map(); // webRequest id -> abort the upstream request
  const requestKey = (method, url) => `${String(method).toUpperCase()} ${url}`;

  /** Call once with `session.defaultSession.webRequest` (one listener per event). */
  function trackRendererCancellation(webRequest) {
    webRequest.onBeforeRequest((details, callback) => {
      if (details.url.startsWith(API_URL_PREFIX)) {
        const key = requestKey(details.method, details.url);
        const queue = pendingIdsByKey.get(key) || [];
        queue.push(details.id);
        pendingIdsByKey.set(key, queue);
      }
      callback({});
    });

    const settle = (details, cancelled) => {
      if (!details.url.startsWith(API_URL_PREFIX)) return;
      const abort = abortById.get(details.id);
      if (abort) {
        abortById.delete(details.id);
        if (cancelled) abort();
        return;
      }
      // Ended before the handler claimed it: drop it so the FIFO cannot drift.
      const key = requestKey(details.method, details.url);
      const queue = pendingIdsByKey.get(key);
      if (!queue) return;
      const index = queue.indexOf(details.id);
      if (index !== -1) queue.splice(index, 1);
      if (!queue.length) pendingIdsByKey.delete(key);
    };
    webRequest.onErrorOccurred((details) => settle(details, true));
    webRequest.onCompleted((details) => settle(details, false));
  }

  /** @returns {AbortSignal} aborts when the renderer cancels this request (before or after headers). */
  function rendererCancelSignal(request) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    // Honoured too, should a future Electron start firing it.
    if (request.signal) request.signal.addEventListener('abort', cancel, { once: true });
    const key = requestKey(request.method, request.url);
    const queue = pendingIdsByKey.get(key);
    if (queue && queue.length) {
      abortById.set(queue.shift(), cancel);
      if (!queue.length) pendingIdsByKey.delete(key);
    }
    return controller.signal;
  }

  async function handleApiRequest(request, url) {
    const method = request.method.toUpperCase();
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const body = method === 'GET' || method === 'HEAD' ? null : request.body;
    const isLogout = method === 'POST' && url.pathname === '/api/auth/logout';

    let upstream;
    try {
      upstream = await forward(`${url.pathname}${url.search}`, {
        method,
        headers,
        body,
        signal: rendererCancelSignal(request),
      });
    } catch (err) {
      if (err instanceof RemoteUnreachableError) return gatewayError(err.message);
      throw err;
    } finally {
      // The server already expired `connect.sid` via set-cookie on success; this
      // also covers a failed/unreachable logout — the renderer treats logout as
      // done either way, so the jar must not quietly keep the session alive.
      if (isLogout) jar.clear();
    }

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, name) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(name)) responseHeaders.append(name, value);
    });
    // API responses are data, never documents: no MIME sniffing, and should one
    // ever be navigated to, it renders sandboxed (no script, opaque origin).
    // Neither header changes anything for fetch()/EventSource consumers.
    responseHeaders.set('x-content-type-options', 'nosniff');
    responseHeaders.set('content-security-policy', 'sandbox');

    // redirect: 'manual' — keep a same-server redirect inside app://idp, and
    // never hand the renderer a Location pointing anywhere else.
    const location = responseHeaders.get('location');
    if (location !== null) {
      let resolved = null;
      try {
        resolved = new URL(location, `${serverOrigin}${url.pathname}`);
      } catch {
        resolved = null;
      }
      if (resolved && resolved.origin === serverOrigin) {
        responseHeaders.set('location', `${APP_ORIGIN}${resolved.pathname}${resolved.search}${resolved.hash}`);
      } else {
        responseHeaders.delete('location');
      }
    }

    const bodyless = method === 'HEAD' || NULL_BODY_STATUSES.has(upstream.status);
    if (bodyless && upstream.body) upstream.body.cancel().catch(() => {});

    // The upstream body stream is handed over as-is: chunks (SSE frames) reach
    // the renderer as they arrive, and a renderer-side cancel (EventSource
    // closed, page unloaded) cancels this stream, which aborts the upstream
    // connection so the server runs its own disconnect cleanup.
    return new Response(bodyless ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  async function serveFrontend(request, url) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return textResponse(405, 'Method Not Allowed');

    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname);
    } catch {
      return textResponse(400, 'Bad Request');
    }
    if (relativePath.includes('\0')) return textResponse(400, 'Bad Request');

    let filePath = path.resolve(root, `.${relativePath}`);
    if (!isInside(root, filePath)) return textResponse(404, 'Not Found');

    let stat = await statOrNull(filePath);
    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await statOrNull(filePath);
    }
    if (!stat || !stat.isFile()) {
      // SPA fallback for route-like paths; a missing asset (has an extension)
      // stays a real 404 instead of being answered with HTML.
      if (path.extname(relativePath)) return textResponse(404, 'Not Found');
      filePath = path.join(root, 'index.html');
      stat = await statOrNull(filePath);
      if (!stat || !stat.isFile()) {
        return textResponse(500, `Arayüz dosyaları bulunamadı: ${root} (geliştirmede: cd frontend && npm run build).`);
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    if (ext === '.html') headers['content-security-policy'] = contentSecurityPolicy;

    const data = method === 'HEAD' ? null : await fs.promises.readFile(filePath);
    return new Response(data, { status: 200, headers });
  }

  /** `protocol.handle('app', ...)` handler. */
  async function handleAppRequest(request) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return textResponse(400, 'Bad Request');
    }
    if (url.host !== APP_HOST) return textResponse(404, 'Not Found');

    try {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await handleApiRequest(request, url);
      }
      return await serveFrontend(request, url);
    } catch (err) {
      console.error(`[remote] ${request.method} ${url.pathname} failed:`, err);
      return jsonResponse(500, { type: false, message: 'İstek işlenemedi.', error: 'İstek işlenemedi.' });
    }
  }

  /**
   * The user behind the jar's session, as the SERVER sees it — used for
   * main-process authorization (agentBuilder).
   * @returns {Promise<{ username: string, role: string } | null>} null when not logged in.
   */
  async function getCurrentUser() {
    const response = await forward('/api/auth/me', {
      headers: new Headers({ accept: 'application/json' }),
      timeoutMs: 15_000,
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`IDP sunucusu oturum bilgisini döndüremedi (HTTP ${response.status}).`);
    }
    const data = await response.json();
    return data && data.user ? data.user : null;
  }

  /**
   * Reachability probe (no cookies). Prefers `GET /api/health`; a server
   * without it still counts as up when `GET /api/auth/me` answers 200/401.
   * @returns {Promise<{ ok: boolean, detail: string }>}
   */
  async function checkConnection() {
    const probe = { withCookies: false, timeoutMs: 10_000, headers: new Headers({ accept: 'application/json' }) };
    try {
      const health = await forward('/api/health', probe);
      let payload = null;
      try {
        payload = await health.json();
      } catch {
        payload = null;
      }
      if (health.ok && payload && payload.ok === true) {
        return { ok: true, detail: `GET /api/health → ${health.status}` };
      }
      const me = await forward('/api/auth/me', { ...probe, headers: new Headers({ accept: 'application/json' }) });
      await me.body?.cancel().catch(() => {});
      if (me.status === 200 || me.status === 401) {
        return { ok: true, detail: `GET /api/health → ${health.status}, GET /api/auth/me → ${me.status}` };
      }
      return {
        ok: false,
        detail: `Sunucu yanıt verdi ama IDP backend'i gibi görünmüyor (GET /api/auth/me → HTTP ${me.status}).`,
      };
    } catch (err) {
      return { ok: false, detail: err && err.message ? err.message : String(err) };
    }
  }

  return {
    handleAppRequest,
    trackRendererCancellation,
    getCurrentUser,
    checkConnection,
    serverOrigin,
    frontendRoot: root,
    cookieJar: jar,
  };
}

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  APP_INDEX_URL,
  APP_SCHEME_PRIVILEGES,
  parseServerUrl,
  createCookieJar,
  createRemoteBackend,
};
