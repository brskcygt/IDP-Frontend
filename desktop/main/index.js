'use strict';

/**
 * Electron main process — T-91 IPC-native stage.
 *
 * Replaces T-90's "embedded HTTP server" approach
 * (docs/03-ELECTRON-MIMARI.md §2 option A — a forked `backend/src/server.js`
 * child process the renderer talked to over `http://127.0.0.1:<port>`) with
 * option B: `backend/src/core/**` (T-58 — already Express-independent) is
 * `require()`d directly into THIS process, and the renderer talks to it
 * over `ipcMain.handle(...)` (see `main/ipc/*.js`) instead of HTTP/SSE.
 *
 * There is no backend child process anymore, no port, no localhost socket —
 * `main/backend.js` is gone. `backend/src/server.js` itself is untouched and
 * keeps working exactly as before for the browser-hosted deployment; this
 * process simply never runs it.
 *
 * Scope (docs/03-ELECTRON-MIMARI.md §2 option B / §12 stage E5):
 *   - resolve the backend source root and pull in the modules the IPC
 *     handlers need (`main/backendPaths.js` + `main/ipc/backendModules.js`);
 *   - run the SAME startup sequence the HTTP shell runs
 *     (`core/bootstrap.js`'s `bootstrapCore()` — DB migration, 'Deploying'→
 *     'Idle' recovery, DeploymentManager reconciliation, secret store
 *     resolution) — HTTP-independent by construction, see that file;
 *   - open a BrowserWindow pointed at the Vite dev server (dev) or
 *     `frontend/dist/index.html` (prod);
 *   - register every `ipcMain.handle` channel backing `window.idp`
 *     (`main/ipc/index.js`);
 *   - lock down the renderer per §9 (contextIsolation, no nodeIntegration,
 *     sandbox, CSP, navigation guards) — CSP no longer needs a backend
 *     origin in `connect-src` (T-90 needed one for `fetch`/`EventSource`
 *     against the embedded server; T-91 has no network surface at all for
 *     talking to the backend — see `main/security.js`).
 */

const path = require('path');
const { app, BrowserWindow, session, protocol, dialog } = require('electron');


const { registerRemoteIpcHandlers } = require('./ipc');
const { applyCsp, buildCsp, lockdownNavigation } = require('./security');
const {
  APP_SCHEME,
  APP_ORIGIN,
  APP_INDEX_URL,
  APP_SCHEME_PRIVILEGES,
  parseServerUrl,
  createRemoteBackend,
} = require('./remoteBackend');

const DEV_SERVER_URL = 'http://localhost:5173';

// Separate from backend's own NODE_ENV on purpose — same reasoning as T-90:
// this process now requires backend code in-process rather than forking it,
// but the desktop shell's own dev/prod switch must stay independent of
// whatever the backend module tree reads NODE_ENV for (e.g. secure-cookie
// flags that are irrelevant here but still read at require time).
const isDev = !app.isPackaged && process.env.IDP_DESKTOP_ENV !== 'production';

/** Read by preload/index.js (literal duplicate there) to expose the remote-mode bridge. */
const REMOTE_MODE_ARG = '--idp-remote-mode';

/**
 * `IDP_SERVER_URL` from the environment or `idp.env`. Read HERE, before app
 * 'ready', only so an invalid or missing value can be reported early; the
 * setup window fills it in at startup when it is unset (see mainRemote).
 * @type {{ serverOrigin: string | null, error: string | null, raw: string } | null}
 */
let remoteSetting = resolveRemoteSetting();

// Unconditional: the app always serves its UI from `app://idp`, and scheme
// privileges can only be registered before 'ready' — long before the setup
// window has had a chance to supply a server address.
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: APP_SCHEME_PRIVILEGES }]);

/** Set in remote mode once the `app://` handler is installed (see mainRemote). */
let remoteBackend = null;

let mainWindow = null;

function resolveFrontendIndexHtml() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'index.html')
    : path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
}

/**
 * Sends the backend's data files to `app.getPath('userData')`.
 *
 * Only sets what the caller hasn't already set, so an explicit
 * IDP_DB_PATH/IDP_USERS_PATH/IDP_SESSIONS_PATH (tests, support scenarios)
 * still wins.
 */
/**
 * Reads `<userData>/idp.env` into `process.env`.
 *
 * The packaged app has no configuration otherwise: an app launched from
 * Finder inherits no shell environment, so without this file there would be
 * nowhere for an operator to set the server address or a CA bundle.
 *
 * Lives in the data directory rather than inside the bundle so it survives
 * updates and reinstalls. Values already present in the environment win, so
 * launching from a terminal for debugging still overrides the file.
 *
 * A commented template is written on first run so the file is discoverable.
 */
function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'idp.env');
}

/**
 * `KEY=value` lines of an idp.env file, in file order. Blank lines, comments,
 * lines without `=` and empty values are skipped; surrounding quotes are
 * stripped. Shared by loadUserConfig() and resolveRemoteSetting() so both
 * read the file identically.
 * @param {string} text
 * @returns {Array<[string, string]>}
 */
function parseUserConfigText(text) {
  const entries = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    // Shell-style `export KEY=value` (pasted from a .env or a profile) means
    // KEY. Without this, `export IDP_SERVER_URL=...` would be stored under the
    // key "export IDP_SERVER_URL" and the app would silently stay in local mode.
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || value === '') continue;
    entries.push([key, value]);
  }
  return entries;
}

/**
 * Server address setting — same precedence as loadUserConfig() (a non-empty
 * environment value wins over the file). Read-only: runs before app 'ready'
 * and must not create the template or touch process.env.
 * @returns {{ serverOrigin: string | null, error: string | null, raw: string } | null}
 *   `null` → not configured yet; `error` set → present but invalid. Either
 *   way the setup window asks for it (see mainRemote).
 */
function resolveRemoteSetting() {
  let raw = process.env.IDP_SERVER_URL;
  if (raw === undefined || raw.trim() === '') {
    raw = undefined;
    try {
      const fs = require('fs');
      const configPath = getUserConfigPath();
      if (fs.existsSync(configPath)) {
        // FIRST occurrence wins — the same line loadUserConfig() applies to
        // process.env (it sets the first value, then skips later duplicates
        // because the variable is no longer empty), so this and process.env
        // can never disagree.
        const entry = parseUserConfigText(fs.readFileSync(configPath, 'utf8'))
          .find(([key]) => key === 'IDP_SERVER_URL');
        if (entry) raw = entry[1];
      }
    } catch (err) {
      console.warn(`[config] Could not read IDP_SERVER_URL from idp.env: ${err.message}`);
    }
  }
  if (raw === undefined || raw.trim() === '') return null;

  try {
    return { serverOrigin: parseServerUrl(raw), error: null, raw };
  } catch (err) {
    return { serverOrigin: null, error: err.message, raw };
  }
}

function loadUserConfig() {
  const fs = require('fs');
  const configPath = getUserConfigPath();

  if (!fs.existsSync(configPath)) {
    const template = [
      '# IDP desktop settings. Restart the app after editing.',
      '#',
      '# Address of the IDP server this app connects to. Scheme + host + port',
      '# only. Leave this unset and the app asks for it on startup.',
      '# IDP_SERVER_URL=http://10.0.0.5:3001',
      '',
      '# Trust an internal CA (path to a PEM bundle).',
      '# NOTE: Node reads this only when the process starts, and this file is',
      '# loaded after that — so here it has NO effect on Node/undici (e.g. an',
      '# https:// IDP_SERVER_URL signed by an internal CA). For that, launch the',
      '# app with NODE_EXTRA_CA_CERTS set in its environment instead.',
      '# NODE_EXTRA_CA_CERTS=',
      '',
      '# Cloudflare Windows Runner (Admin API key stays in Electron main only).',
      '# IDP_RUNNER_API_URL=https://idp-runner-api.bariskoc-249.workers.dev',
      '# IDP_RUNNER_ADMIN_API_KEY=',
      '',
    ].join('\n');
    try {
      fs.writeFileSync(configPath, template, { mode: 0o600 });
    } catch (err) {
      console.warn(`[config] Could not create ${configPath}: ${err.message}`);
    }
  }

  let applied = 0;
  try {
    for (const [key, value] of parseUserConfigText(fs.readFileSync(configPath, 'utf8'))) {
      // The ambient environment wins — running from a terminal to debug should
      // not be silently overridden by the file.
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
        applied += 1;
      }
    }
  } catch (err) {
    console.warn(`[config] Could not read ${configPath}: ${err.message}`);
    return configPath;
  }

  console.log(`[config] Settings file: ${configPath}${applied ? ` (${applied} value(s) applied)` : ' (nothing set yet)'}`);
  return configPath;
}


async function createWindow() {
  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');

  // CSP + navigation lockdown apply to the default session, which is what
  // a BrowserWindow uses unless a custom `partition` is passed — we don't
  // pass one at this stage, so this covers the one window we open.
  // The UI is always the BUILT bundle served from app://idp (never the Vite
  // dev server), so it always gets the production policy.
  applyCsp(session.defaultSession, { isDev: false, devServerOrigin: null });

  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    preload: preloadPath,
    additionalArguments: [REMOTE_MODE_ARG],
  };

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences,
  });

  lockdownNavigation(win.webContents, [`${APP_ORIGIN}/`]);

  // IPC channels were registered once in mainRemote().
  await win.loadURL(APP_INDEX_URL);
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  mainWindow = win;
  return win;
}

/**
 * Remote mode startup (IDP_SERVER_URL). Everything tied to the embedded
 * backend is skipped: backend module loading, bootstrapCore, redirecting its
 * data files, the first-run password dialog and every backend-backed IPC
 * channel. What stays: window + security, menu, updater, agentBuilder.
 */
async function mainRemote() {
  const fs = require('fs');
  const userConfigPath = loadUserConfig();

  // No usable address yet: ask for one instead of quitting. Covers both the
  // first run and an IDP_SERVER_URL that was hand-edited into something
  // invalid.
  if (!remoteSetting || remoteSetting.error) {
    const { promptForServerUrl } = require('./setup/serverSetup');
    const serverOrigin = await promptForServerUrl({
      configPath: userConfigPath,
      initialValue: remoteSetting ? remoteSetting.raw : '',
      error: remoteSetting ? remoteSetting.error : null,
    });
    if (!serverOrigin) {
      app.quit();
      return;
    }
    remoteSetting = { serverOrigin, error: null, raw: serverOrigin };
    // loadUserConfig() already ran, so the freshly written line would not be
    // picked up by anything that reads process.env later in this startup.
    process.env.IDP_SERVER_URL = serverOrigin;
  }

  const frontendRoot = path.dirname(resolveFrontendIndexHtml());
  if (!fs.existsSync(path.join(frontendRoot, 'index.html'))) {
    console.error(`[remote] Arayüz dosyaları bulunamadı: ${frontendRoot} (geliştirmede: cd frontend && npm run build)`);
  }

  remoteBackend = createRemoteBackend({
    serverOrigin: remoteSetting.serverOrigin,
    frontendRoot,
    contentSecurityPolicy: buildCsp({ isDev: false, devServerOrigin: null }),
  });
  protocol.handle(APP_SCHEME, (request) => remoteBackend.handleAppRequest(request));
  // Electron does not fire request.signal on a renderer cancel; webRequest does
  // (net::ERR_ABORTED) — lets a cancelled /api request abort upstream too.
  remoteBackend.trackRendererCancellation(session.defaultSession.webRequest);
  console.log(`[remote] Uzak mod — API: ${remoteBackend.serverOrigin}, arayüz: ${frontendRoot}`);

  app.on('web-contents-created', (_event, contents) => {
    lockdownNavigation(contents, [`${APP_ORIGIN}/`]);
  });

  registerRemoteIpcHandlers({
    getRemoteUser: () => remoteBackend.getCurrentUser(),
    issueAgentCredentials: (agentId) => remoteBackend.issueAgentCredentials(agentId),
  });

  await createWindow();

  require('./appMenu').buildAppMenu({
    getMainWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
    remote: {
      serverUrl: remoteBackend.serverOrigin,
      checkConnection: () => remoteBackend.checkConnection(),
    },
  });

  try {
    require('./updater').initAutoUpdater(mainWindow);
  } catch (err) {
    console.warn('[updater] disabled:', err.message);
  }

  // Log-only: an unreachable server already surfaces in the UI (login shows
  // the proxy's "IDP sunucusuna ulaşılamadı: ..." message).
  remoteBackend.checkConnection().then((result) => {
    console.log(
      `[remote] Sunucu ${result.ok ? 'erişilebilir' : 'ERİŞİLEMİYOR'} (${remoteBackend.serverOrigin}): ${result.detail}`
    );
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

async function main() {
  await app.whenReady();
  await mainRemote();
}

// No backend child process to kill anymore (T-91) — everything this app
// needs dies with the main process itself. `window-all-closed` still quits
// the app on every platform: this is a single-window utility tool, and
// there's no reason to linger backgrounded on macOS with no UI to reach it.
app.on('window-all-closed', () => {
  app.quit();
});

main();
