'use strict';

/**
 * Registers every `ipcMain.handle(...)` channel backing `window.idp` (T-91).
 *
 * Called once from `main/index.js`, after `loadBackendModules()` has run.
 * See each `ipc/*.js` file for the channels it owns; this file is only the
 * roll-up + the deploy-log-subscription cleanup hook the window needs on
 * close (mirrors the SSE route's `req.on('close', ...)` cleanup — an IPC
 * subscription has no socket to notice closing on its own, so the window's
 * own `closed` event has to do that job instead).
 *
 * Handler modules are required inside the register functions, not at load
 * time: the local set pulls in backend/src/** (via ./helpers.js), which remote
 * mode neither needs nor — in a backend-less build — has.
 */

/**
 * Local mode (embedded backend).
 * @param {import('electron').BrowserWindow} win - the window the deploy log
 *   bridge pushes `idp:deploy:log-event` events to.
 */
function registerIpcHandlers(win) {
  const { registerAuthHandlers } = require('./auth');
  const { registerProjectHandlers } = require('./projects');
  const { registerDeployHandlers, unsubscribeAllDeployLogs } = require('./deploy');
  const { registerVpnHandlers } = require('./vpn');
  const { registerHostKeyHandlers } = require('./hostKeys');
  const { registerUserHandlers } = require('./users');
  const { registerAuditHandlers } = require('./audit');
  const { registerPmpHandlers } = require('./pmp');
  const { registerUpdateHandlers } = require('./update');
  const { registerAgentBuilderHandlers } = require('./agentBuilder');
  const { registerAgentHandlers } = require('./agents');
  const { registerFileTransferHandlers } = require('./fileTransfer');

  registerAuthHandlers();
  registerProjectHandlers();
  registerDeployHandlers(win);
  registerVpnHandlers();
  registerHostKeyHandlers();
  registerUserHandlers();
  registerAuditHandlers();
  registerPmpHandlers();
  registerUpdateHandlers();
  registerAgentBuilderHandlers();
  registerAgentHandlers();
  registerFileTransferHandlers();

  win.on('closed', () => {
    unsubscribeAllDeployLogs();
  });
}

/**
 * Remote mode (IDP_SERVER_URL): business logic runs on the remote server and
 * the renderer reaches it over HTTP through `app://idp` (main/remoteBackend.js),
 * so none of the backend-backed channels above are registered. What remains
 * is desktop-only: the updater and the agent JAR builder (authorized against
 * the remote session — see ipc/agentBuilder.js).
 * @param {{
 *   getRemoteUser: () => Promise<{ username: string, role: string } | null>,
 *   issueAgentCredentials: (agentId: string) => Promise<unknown>,
 * }} deps
 */
function registerRemoteIpcHandlers({ getRemoteUser, issueAgentCredentials }) {
  const { registerUpdateHandlers } = require('./update');
  const { registerRemoteAgentBuilderHandlers } = require('./agentBuilder');

  registerUpdateHandlers();
  registerRemoteAgentBuilderHandlers({ getRemoteUser, issueAgentCredentials });
}

module.exports = { registerIpcHandlers, registerRemoteIpcHandlers };
