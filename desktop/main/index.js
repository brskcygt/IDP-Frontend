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
const { app, BrowserWindow, session } = require('electron');

const { resolveBackendRoot } = require('./backendPaths');

/** Filled in when the OTP webhook listener starts; null when it is disabled. */
let webhookInfo = null;
const { loadBackendModules } = require('./ipc/backendModules');
const { registerIpcHandlers } = require('./ipc');
const { applyCsp, lockdownNavigation } = require('./security');
const { createSamlWindowProvider } = require('./saml/samlWindow');

const DEV_SERVER_URL = 'http://localhost:5173';

// Separate from backend's own NODE_ENV on purpose — same reasoning as T-90:
// this process now requires backend code in-process rather than forking it,
// but the desktop shell's own dev/prod switch must stay independent of
// whatever the backend module tree reads NODE_ENV for (e.g. secure-cookie
// flags that are irrelevant here but still read at require time).
const isDev = !app.isPackaged && process.env.IDP_DESKTOP_ENV !== 'production';

// T-94: tracked so the SAML sign-in window (registered below via
// setSamlWindowProvider) can open modal-to-parent instead of as a stray
// top-level window. Read lazily through a getter closure — the provider is
// registered before this window exists yet, and only actually opens the
// SAML window much later, on demand, during a VPN connect.
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
 * On the very first launch a random admin password is generated. Surface it in
 * a dialog (read-once — see userStore.takeBootstrapPassword) so the operator
 * can save it. Never shown again, and never written anywhere in plaintext.
 */
function showFirstRunPasswordIfAny(backendRoot) {
  let password = null;
  try {
    const userStore = require(path.join(backendRoot, 'src', 'auth', 'userStore'));
    password = userStore.takeBootstrapPassword();
  } catch (err) {
    console.warn('[first-run] could not read the bootstrap password:', err.message);
    return;
  }

  if (!password) return; // account already existed, or IDP_ADMIN_PASSWORD was used

  const { dialog, clipboard } = require('electron');
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const options = {
    type: 'info',
    title: 'IDP — ilk kurulum',
    message: 'Yönetici hesabı oluşturuldu',
    detail:
      `Kullanıcı adı:  admin\n` +
      `Parola:         ${password}\n\n` +
      'Bu parola bir daha GÖSTERİLMEYECEK ve hiçbir yerde düz metin olarak ' +
      'saklanmıyor. Şimdi kaydedin.\n\n' +
      'Unutursanız: uygulama veri klasöründeki users.json dosyasını silip ' +
      'uygulamayı yeniden başlatın; yeni bir parola üretilir.',
    buttons: ['Parolayı kopyala ve devam et', 'Devam et'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const choice = parent
    ? dialog.showMessageBoxSync(parent, options)
    : dialog.showMessageBoxSync(options);

  if (choice === 0) clipboard.writeText(password);
}

/**
 * Reads `<userData>/idp.env` into `process.env`.
 *
 * The packaged app has no configuration otherwise: `backend/.env` is not copied
 * into the bundle (it holds secrets and would be baked in at build time), and
 * an app launched from Finder inherits no shell environment. So there was
 * nowhere for an operator to set anything — MFA_WEBHOOK_API_KEY, a proxy, a
 * custom port — and features that depend on it silently stayed off.
 *
 * Lives in the data directory rather than inside the bundle so it survives
 * updates and reinstalls. Values already present in the environment win, so
 * launching from a terminal for debugging still overrides the file.
 *
 * A commented template is written on first run so the file is discoverable.
 */
function loadUserConfig() {
  const fs = require('fs');
  const configPath = path.join(app.getPath('userData'), 'idp.env');

  if (!fs.existsSync(configPath)) {
    const template = [
      '# IDP desktop settings. Restart the app after editing.',
      '#',
      '# Automatic OTP capture: set a long random key, then point your phone\'s',
      '# SMS-forwarding app at the URL the app prints on startup. Leave this',
      '# unset and no port is opened at all.',
      '# MFA_WEBHOOK_API_KEY=',
      '',
      '# Port for that listener (default 8787).',
      '# IDP_WEBHOOK_PORT=8787',
      '',
      '# Skip the generated first-run admin password and use this instead.',
      '# Only read when no account exists yet.',
      '# IDP_ADMIN_PASSWORD=',
      '',
      '# Trust an internal CA (path to a PEM bundle).',
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
    for (const rawLine of fs.readFileSync(configPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!key || value === '') continue;

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

function redirectBackendDataToUserDir() {
  const fs = require('fs');
  const dataDir = app.getPath('userData');

  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  } catch {
    // Electron creates this directory itself; a failure here is not fatal.
  }

  const defaults = {
    IDP_DB_PATH: path.join(dataDir, 'idp.db'),
    IDP_USERS_PATH: path.join(dataDir, 'users.json'),
    IDP_SESSIONS_PATH: path.join(dataDir, 'sessions.json'),
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key] || process.env[key].trim() === '') {
      process.env[key] = value;
    }
  }

  console.log(`[data] Backend data directory: ${dataDir}`);
}

async function createWindow() {
  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');

  // CSP + navigation lockdown apply to the default session, which is what
  // a BrowserWindow uses unless a custom `partition` is passed — we don't
  // pass one at this stage, so this covers the one window we open.
  applyCsp(session.defaultSession, {
    isDev,
    devServerOrigin: isDev ? DEV_SERVER_URL : null,
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: preloadPath,
    },
  });

  const allowedOrigins = isDev
    ? [DEV_SERVER_URL, 'file://']
    : ['file://'];
  lockdownNavigation(win.webContents, allowedOrigins);

  registerIpcHandlers(win);

  if (isDev) {
    await win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(resolveFrontendIndexHtml());
  }

  mainWindow = win;
  return win;
}

async function main() {
  await app.whenReady();

  // Point every backend data file at the per-user data directory BEFORE any
  // backend module is required — each of them resolves its own path at import
  // time.
  //
  // Without this the packaged app writes `idp.db`, `users.json` and
  // `sessions.json` inside `IDP.app/Contents/Resources/backend/src/`: every
  // project, credential reference and audit record would live inside the app
  // bundle, and would be destroyed by the next update or reinstall. macOS also
  // refuses those writes outright when it translocates a quarantined app.
  redirectBackendDataToUserDir();

  // Load the operator's settings from the data directory. Must run before any
  // backend module is required, since config.js reads process.env at import.
  const userConfigPath = loadUserConfig();

  let backendRoot;
  try {
    backendRoot = resolveBackendRoot(app.isPackaged, process.resourcesPath);
    const backendModules = loadBackendModules(backendRoot);
    const { bootstrapCore } = backendModules;
    const migration = await require('./runnerSecrets').migrateRunnerAdminKey({
      configPath: userConfigPath,
      secretStore: backendModules.secretStore,
    });
    if (migration.migrated) {
      console.log('[runner] Admin API key migrated from idp.env to OS keychain-backed safeStorage.');
    }
    bootstrapCore();
  } catch (err) {
    console.error('[desktop] Backend başlatılamadı, uygulama kapatılıyor:', err);
    app.quit();
    return;
  }

  // T-94: register the Electron SAML sign-in window as the desktop-path
  // provider for AzureAdMfaHandler (docs/03-ELECTRON-MIMARI.md §7). Required
  // directly off `backendRoot` (not via ipc/backendModules.js) since this is
  // registered before any IPC handler is wired up. When no provider is
  // registered — the web/server deployment — AzureAdMfaHandler falls back to
  // its existing headless-Playwright flow unchanged.
  const { setSamlWindowProvider } = require(
    path.join(backendRoot, 'src', 'services', 'vpn', 'samlWindowProvider')
  );
  setSamlWindowProvider(createSamlWindowProvider(() => mainWindow));

  // T-93: register the OS-native elevation dialog (macOS osascript "with
  // administrator privileges") as VpnManager's elevationProvider, replacing
  // the removed grant-permissions endpoint (SEC-02/SEC-08). No-op fallback
  // (plain sudo spawn) stays intact when this is never called — see
  // backend/src/services/vpn/elevationProvider.js.
  const { setElevationProvider } = require(
    path.join(backendRoot, 'src', 'services', 'vpn', 'elevationProvider')
  );
  setElevationProvider(require('./elevation/osElevation').elevate);

  // Applies to every webContents this app creates — the guardrail belongs
  // at the app level, not just on the one window we happen to open at
  // startup (docs/03-ELECTRON-MIMARI.md §9: "app.on('web-contents-created')
  // içinde bu guard'ları bağla").
  app.on('web-contents-created', (_event, contents) => {
    const allowedOrigins = isDev ? [DEV_SERVER_URL, 'file://'] : ['file://'];
    lockdownNavigation(contents, allowedOrigins);
  });

  await createWindow();

  // After the window exists, so the dialog is parented to it rather than
  // floating alone. userStore also prints this to stdout, but that is invisible
  // for an app launched from Finder — the account would exist with a password
  // nobody could read.
  showFirstRunPasswordIfAny(backendRoot);

  // Opt-in inbound channel for forwarded OTP messages. Does nothing unless
  // MFA_WEBHOOK_API_KEY is set — see main/webhook/otpWebhookServer.js.
  try {
    const { startOtpWebhookServer } = require('./webhook/otpWebhookServer');
    webhookInfo = startOtpWebhookServer({
      otpWebhookManager: require(path.join(backendRoot, 'src', 'services', 'mfa', 'OtpWebhookManager')),
      createRateLimiter: require(path.join(backendRoot, 'src', 'core', 'rateLimiter')).createRateLimiter,
    });
  } catch (err) {
    console.warn('[webhook] disabled:', err.message);
  }

  // The menu is how an operator finds any of this: an app launched from Finder
  // has no console, so the webhook URL and the settings path are invisible
  // unless the UI surfaces them.
  require('./appMenu').buildAppMenu({
    getWebhookInfo: () => webhookInfo,
    getMainWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
  });

  // Auto-update is opt-in and best-effort: with no IDP_UPDATE_FEED_URL baked
  // into the build there is no publish config, every check rejects, and this
  // stays a no-op. An unsigned build can never self-update either
  // (docs/06-DAGITIM.md) — so this must never be allowed to block startup.
  try {
    require('./updater').initAutoUpdater(mainWindow);
  } catch (err) {
    console.warn('[updater] disabled:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// No backend child process to kill anymore (T-91) — everything this app
// needs dies with the main process itself. `window-all-closed` still quits
// the app on every platform: this is a single-window utility tool, and
// there's no reason to linger backgrounded on macOS with no UI to reach it.
app.on('window-all-closed', () => {
  app.quit();
});

main();
