'use strict';

/**
 * Electron implementation of the SAML sign-in window provider contract
 * defined in `backend/src/services/vpn/samlWindowProvider.js` (T-94).
 *
 * Opens a real, sandboxed `BrowserWindow` pointed at the Azure AD / SP login
 * URL and lets the user sign in with their own credentials there — no form
 * filling, no fixed selectors, no password ever touches this process. Once
 * the site sets one of the known VPN session cookies, that cookie is
 * returned and the window is closed.
 *
 * Registered once at startup in `desktop/main/index.js`:
 *
 *   const { setSamlWindowProvider } = require(<backend path>/services/vpn/samlWindowProvider);
 *   const { createSamlWindowProvider } = require('./saml/samlWindow');
 *   setSamlWindowProvider(createSamlWindowProvider(() => mainWindow));
 *
 * Security posture matches docs/03-ELECTRON-MIMARI.md §9: sandboxed,
 * context-isolated, no node integration, own session partition (so this
 * never shares cookies/storage with the app's own renderer session).
 */

const { BrowserWindow, session } = require('electron');

/** Falls back to this if the caller doesn't pass `timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/** How often we poll the session's cookie jar while the window is open. */
const POLL_INTERVAL_MS = 500;

/**
 * Dedicated, persistent partition for the SAML sign-in window. Kept separate
 * from the app's default session so this window's cookies never mix with —
 * or leak into — the renderer's own session, and vice versa.
 */
const SAML_AUTH_PARTITION = 'persist:idp-vpn-auth';

/**
 * Look through `cookieNames` (in order) for a cookie in `authSession`,
 * preferring one whose domain matches `host` if more than one candidate
 * exists.
 *
 * @param {import('electron').Session} authSession
 * @param {string} host
 * @param {string[]} cookieNames
 * @returns {Promise<{ name: string, value: string } | null>}
 */
async function findSessionCookie(authSession, host, cookieNames) {
  for (const name of cookieNames) {
    const cookies = await authSession.cookies.get({ name });
    if (cookies.length === 0) continue;

    const hostMatch = cookies.find(
      (c) => host && c.domain && (c.domain.includes(host) || host.includes(c.domain))
    );
    const chosen = hostMatch || cookies[0];
    return { name: chosen.name, value: chosen.value };
  }
  return null;
}

/**
 * Open the SAML sign-in window and resolve once a known session cookie
 * appears, the user closes the window (or presses ESC), the deployment is
 * aborted via `signal`, or the timeout elapses.
 *
 * Matches the provider contract documented in
 * `backend/src/services/vpn/samlWindowProvider.js`.
 *
 * @param {{ samlUrl: string, host: string, cookieNames: string[], timeoutMs?: number, onLog?: (line: string) => void, signal?: AbortSignal | null }} params
 * @param {import('electron').BrowserWindow | null} [parentWindow] - modal parent, if any.
 * @returns {Promise<{ name: string, value: string } | null>}
 */
async function openSamlWindow({ samlUrl, host, cookieNames, timeoutMs, onLog, signal = null }, parentWindow = null) {
  if (!samlUrl) throw new Error('openSamlWindow: samlUrl is required');
  if (!Array.isArray(cookieNames) || cookieNames.length === 0) {
    throw new Error('openSamlWindow: cookieNames must be a non-empty array');
  }

  const log = typeof onLog === 'function' ? onLog : () => {};
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  const authSession = session.fromPartition(SAML_AUTH_PARTITION);

  const win = new BrowserWindow({
    width: 520,
    height: 720,
    parent: parentWindow || undefined,
    modal: Boolean(parentWindow),
    show: true,
    title: host ? `Sign in — ${host}` : 'Sign in',
    webPreferences: {
      partition: SAML_AUTH_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ESC cancels the sign-in. As a modal child window on macOS this is a
  // sheet WITHOUT its own title-bar close button, so a keyboard escape
  // hatch is the only discoverable way out. `before-input-event` fires in
  // the main process for every key press in this webContents — sandbox and
  // page focus don't matter. Closing the window routes through the
  // 'closed' handler below, which turns it into an explicit failure that
  // cancels the deployment's VPN phase.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !win.isDestroyed()) {
      win.close();
    }
  });

  let pollTimer = null;
  let timeoutTimer = null;
  let settled = false;
  let onAbort = null;

  const stopTimers = () => {
    if (pollTimer) clearInterval(pollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    pollTimer = null;
    timeoutTimer = null;
    if (onAbort && signal) {
      signal.removeEventListener('abort', onAbort);
      onAbort = null;
    }
  };

  try {
    log(`[VPN] Opening interactive sign-in window${host ? ` for ${host}` : ''}... (press ESC to cancel)`);
    await win.loadURL(samlUrl);

    return await new Promise((resolve, reject) => {
      const finish = (result) => {
        if (settled) return;
        settled = true;
        stopTimers();
        resolve(result);
      };

      const fail = (err) => {
        if (settled) return;
        settled = true;
        stopTimers();
        reject(err);
      };

      // User closed the window before completing sign-in — this must be a
      // loud, explicit failure, never a silent `null`.
      win.on('closed', () => {
        fail(new Error('Authentication window was closed before sign-in completed.'));
      });

      // Deployment abort must close the window too — otherwise it would sit
      // open until the timeout even though its deployment is already dead.
      // (The backend also races the provider promise against this signal, so
      // the deployment unblocks even if this close round-trip is slow.)
      if (signal) {
        onAbort = () => {
          log('[VPN] Deployment aborted — closing the sign-in window.');
          if (!win.isDestroyed()) win.close();
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      pollTimer = setInterval(() => {
        findSessionCookie(authSession, host, cookieNames)
          .then((found) => {
            if (found) {
              log(`[VPN] Sign-in window detected session cookie: ${found.name}`);
              finish(found);
            }
          })
          .catch(() => {
            // Transient cookie-store read errors shouldn't abort the wait —
            // just try again on the next tick, up to the timeout.
          });
      }, POLL_INTERVAL_MS);

      timeoutTimer = setTimeout(() => {
        fail(
          new Error(
            `Timed out waiting for SAML sign-in to complete (${Math.round(effectiveTimeoutMs / 1000)}s).`
          )
        );
      }, effectiveTimeoutMs);
    });
  } finally {
    // The window is closed in EVERY case — success, failure, or an
    // exception thrown while loading the URL — never left dangling.
    stopTimers();
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

/**
 * Build a provider function bound to a parent-window getter, ready to pass
 * to `setSamlWindowProvider()`.
 *
 * @param {() => import('electron').BrowserWindow | null} getParentWindow
 */
function createSamlWindowProvider(getParentWindow) {
  return (params) =>
    openSamlWindow(params, typeof getParentWindow === 'function' ? getParentWindow() : null);
}

module.exports = { openSamlWindow, createSamlWindowProvider, DEFAULT_TIMEOUT_MS, SAML_AUTH_PARTITION };
