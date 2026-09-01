'use strict';

/**
 * `idp:pmp:testConnection` — direct IPC equivalent of
 * `POST /api/pmp/test-connection` (backend/src/server.js). The HTTP route
 * only gates on `requireAuth` (any logged-in user, no specific role/action)
 * — `AUTHENTICATED_ONLY` mirrors that exactly.
 */
const { ipcMain } = require('electron');
const { ipcHandler, AUTHENTICATED_ONLY } = require('./helpers');
const { getBackendModules } = require('./backendModules');

function registerPmpHandlers() {
  ipcMain.handle(
    'idp:pmp:testConnection',
    ipcHandler(AUTHENTICATED_ONLY, async (_event, pmpConfig) => {
      const { core, PmpService } = getBackendModules();
      if (!pmpConfig || !pmpConfig.baseUrl || !pmpConfig.authToken) {
        throw new core.ValidationError('Missing PMP configuration.');
      }
      return PmpService.testConnection(pmpConfig);
    })
  );
}

module.exports = { registerPmpHandlers };
