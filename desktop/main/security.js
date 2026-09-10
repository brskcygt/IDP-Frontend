'use strict';

/**
 * Security wiring for the renderer — CSP + navigation lockdown
 * (docs/03-ELECTRON-MIMARI.md §9). None of this is optional/negotiable per
 * the task spec; see desktop/README.md for the "why" behind each piece.
 *
 * T-91: `connect-src` no longer needs a backend origin. T-90's embedded
 * HTTP server (a forked `backend/src/server.js` on `127.0.0.1:<port>`) is
 * gone — the renderer talks to the backend exclusively over
 * `ipcMain.handle`/`ipcRenderer.invoke` (see `main/ipc/**` and
 * `preload/index.js`), which isn't a `fetch`/`EventSource` call CSP's
 * `connect-src` governs at all. The only network surface `connect-src`
 * still needs to allow is the Vite dev server in dev mode.
 *
 * Remote mode (`IDP_SERVER_URL`): the renderer is served from `app://idp`
 * (a standard + secure privileged scheme, see `main/remoteBackend.js`), and
 * its `/api/*` fetch/EventSource calls go to that SAME origin — so the
 * production policy's `connect-src 'self'` already covers them. The remote
 * server's own address is never contacted from the renderer and therefore
 * never appears in the CSP. Navigation is locked to `app://idp/`.
 */

const { shell } = require('electron');

/**
 * Builds the Content-Security-Policy header value.
 *
 * - In dev mode, the renderer is actually the Vite dev server
 *   (`http://localhost:5173`), so script/style/connect need to allow it —
 *   including its HMR websocket.
 * - In production, the renderer is loaded from `frontend/dist/index.html`
 *   via `file://`, so `default-src 'self'` covers the whole bundle — no
 *   other origin needs to be allowed anywhere.
 */
function buildCsp({ isDev, devServerOrigin }) {
  const connectSrc = ["'self'"];

  if (isDev && devServerOrigin) {
    const wsOrigin = devServerOrigin.replace(/^http/, 'ws');
    connectSrc.push(devServerOrigin, wsOrigin);
  }

  const scriptSrc = ["'self'"];
  // Tailwind/Radix inject inline styles at runtime ('unsafe-inline');
  // frontend/index.html links a Google Fonts stylesheet directly (pre-dates
  // T-91) — without allowing its origin here the renderer prints a CSP
  // violation and silently falls back to system fonts.
  const styleSrc = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'];

  if (isDev && devServerOrigin) {
    // @vitejs/plugin-react injects an inline `<script type="module">`
    // preamble (the React Fast Refresh bootstrap) directly into
    // index.html — without 'unsafe-inline' here it's silently blocked by
    // CSP and the renderer fails with "can't detect preamble. Something is
    // wrong." 'unsafe-eval' is needed for the same dev-only Fast Refresh
    // instrumentation. Both are dev-server-origin-gated and never reached
    // in production, where the renderer loads the built, non-inline
    // frontend/dist bundle instead.
    scriptSrc.push("'unsafe-inline'", "'unsafe-eval'", devServerOrigin);
    styleSrc.push(devServerOrigin);
  }

  const directives = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': styleSrc,
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': connectSrc,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Applies the CSP to every response in `sess` (the session the
 * BrowserWindow's webContents uses).
 */
function applyCsp(sess, cspOptions) {
  const csp = buildCsp(cspOptions);
  sess.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

/**
 * Locks down navigation and window-open on `contents` (a webContents
 * instance) per docs/03-ELECTRON-MIMARI.md §9:
 *   - in-app navigation may only go to allowed origins (the app's own
 *     dev-server/file origin);
 *   - anything else — `will-navigate` or a `window.open()` — is blocked
 *     from happening inside Electron and instead opened in the user's real
 *     browser via `shell.openExternal`, and only for `https:` URLs.
 */
function lockdownNavigation(contents, allowedOrigins) {
  contents.on('will-navigate', (event, url) => {
    const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin));
    if (isAllowed) return;

    event.preventDefault();
    const target = safeParseUrl(url);
    if (target && target.protocol === 'https:') {
      shell.openExternal(url);
    }
    // Non-https external navigation (http:, file:, custom schemes, malformed
    // URLs, etc.) is silently blocked — never handed to shell.openExternal.
  });

  contents.setWindowOpenHandler(({ url }) => {
    const target = safeParseUrl(url);
    if (target && target.protocol === 'https:') {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function safeParseUrl(url) {
  try {
    return new URL(url);
  } catch (_err) {
    return null;
  }
}

module.exports = { buildCsp, applyCsp, lockdownNavigation };
