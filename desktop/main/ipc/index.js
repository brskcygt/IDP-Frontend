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
 */
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

/**
 * @param {import('electron').BrowserWindow} win - the window the deploy log
 *   bridge pushes `idp:deploy:log-event` events to.
 */
function registerIpcHandlers(win) {
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

module.exports = { registerIpcHandlers };
