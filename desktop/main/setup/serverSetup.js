'use strict';

/**
 * First-run server address prompt.
 *
 * The desktop app has no embedded backend: without an `IDP_SERVER_URL` there
 * is nothing to show. Rather than quitting with an error box and telling the
 * operator to hand-edit `idp.env`, this opens a small window that asks for the
 * address, probes it, and writes it to `idp.env` before normal startup
 * continues.
 *
 * Deliberately self-contained: its own preload, its own IPC channels, its own
 * HTML file loaded from disk. None of the app's real IPC handlers exist yet
 * when this runs.
 */
const fs = require('fs');
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

const { parseServerUrl } = require('../remoteBackend');

const PROBE_TIMEOUT_MS = 8000;

/**
 * Rewrites `IDP_SERVER_URL` in the settings file, preserving everything else.
 * Existing definitions (including `export `-prefixed and commented-out ones)
 * are dropped so the first-occurrence-wins rule in main/index.js cannot pick
 * up a stale value.
 *
 * @param {string} configPath
 * @param {string} serverOrigin
 */
function writeServerUrl(configPath, serverOrigin) {
  let existing = '';
  try {
    existing = fs.readFileSync(configPath, 'utf8');
  } catch {
    existing = '';
  }

  const kept = existing
    .split('\n')
    .filter((line) => !/^\s*#?\s*(?:export\s+)?IDP_SERVER_URL\s*=/.test(line));

  // Drop trailing blanks so the appended block does not drift further down the
  // file every time the address is changed.
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();

  const body = kept.join('\n');
  const next = `${body ? `${body}\n` : ''}\n# IDP server address (set from the setup window).\nIDP_SERVER_URL=${serverOrigin}\n`;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next, { mode: 0o600 });
}

/**
 * Reachability probe against a candidate origin. Mirrors remoteBackend's
 * checkConnection(): `/api/health` is preferred, but a server that only
 * answers `/api/auth/me` with 200/401 still counts as an IDP backend.
 *
 * @param {string} serverOrigin
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function probeServer(serverOrigin) {
  const get = (pathname) => fetch(`${serverOrigin}${pathname}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  try {
    const health = await get('/api/health');
    let payload = null;
    try {
      payload = await health.json();
    } catch {
      payload = null;
    }
    if (health.ok && payload && payload.ok === true) {
      return { ok: true, message: `Sunucuya ulaşıldı (${payload.service || 'idp-backend'}).` };
    }

    const me = await get('/api/auth/me');
    await me.body?.cancel().catch(() => {});
    if (me.status === 200 || me.status === 401) {
      return { ok: true, message: 'Sunucuya ulaşıldı.' };
    }
    return {
      ok: false,
      message: `Adres yanıt verdi ama IDP backend'i gibi görünmüyor (GET /api/auth/me → HTTP ${me.status}).`,
    };
  } catch (err) {
    return { ok: false, message: `Sunucuya ulaşılamadı: ${err && err.message ? err.message : String(err)}` };
  }
}

/**
 * Opens the setup window and resolves once the operator has saved a usable
 * address, or `null` if they closed the window instead.
 *
 * The address is saved even when the probe fails — a server that is merely
 * down right now is still the correct address, and refusing to store it would
 * strand the operator on this screen.
 *
 * @param {object} options
 * @param {string} options.configPath - path of `idp.env`.
 * @param {string} [options.initialValue] - prefill, e.g. a rejected value.
 * @param {string} [options.error] - message to show on open.
 * @returns {Promise<string | null>} the saved origin, or null if cancelled.
 */
function promptForServerUrl({ configPath, initialValue = '', error = null }) {
  return new Promise((resolve) => {
    let settled = null;

    const win = new BrowserWindow({
      width: 560,
      height: 420,
      resizable: false,
      title: 'IDP — Sunucu adresi',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    win.setMenuBarVisibility(false);

    const handlers = {
      'idp:setup:context': () => ({ configPath, initialValue, error }),

      'idp:setup:test': async (_event, raw) => {
        let origin;
        try {
          origin = parseServerUrl(raw);
        } catch (err) {
          return { ok: false, message: err.message };
        }
        return probeServer(origin);
      },

      'idp:setup:save': async (_event, raw) => {
        let origin;
        try {
          origin = parseServerUrl(raw);
        } catch (err) {
          return { ok: false, message: err.message };
        }

        try {
          writeServerUrl(configPath, origin);
        } catch (err) {
          return { ok: false, message: `Ayar dosyası yazılamadı: ${err.message}` };
        }

        settled = origin;
        win.close();
        return { ok: true, message: 'Kaydedildi.' };
      },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
      ipcMain.handle(channel, handler);
    }

    win.on('closed', () => {
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
      resolve(settled);
    });

    win.loadFile(path.join(__dirname, 'setup.html'));
  });
}

module.exports = { promptForServerUrl, writeServerUrl, probeServer };
