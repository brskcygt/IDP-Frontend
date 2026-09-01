'use strict';

/**
 * `idp:vpn:*` — direct IPC equivalents of the VPN session routes in
 * `backend/src/server.js` (`/api/projects/:id/vpn/clear-session`,
 * `/api/vpn/force-disconnect`, `/api/vpn/sessions`), all gated behind the
 * same `vpn:manage` permission.
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');
const session = require('./session');

function registerVpnHandlers() {
  ipcMain.handle(
    'idp:vpn:sessions',
    ipcHandler('vpn:manage', async () => {
      const { core } = getBackendModules();
      return core.vpnService.listActiveVpnSessions();
    })
  );

  ipcMain.handle(
    'idp:vpn:clearProjectSession',
    ipcHandler('vpn:manage', async (_event, projectId) => {
      const { core } = getBackendModules();
      return core.vpnService.clearProjectVpnSession(projectId, session.getCurrentActor());
    })
  );

  ipcMain.handle(
    'idp:vpn:forceDisconnect',
    ipcHandler('vpn:manage', async () => {
      const { core } = getBackendModules();
      return core.vpnService.forceDisconnectAll(session.getCurrentActor());
    })
  );
}

module.exports = { registerVpnHandlers };
