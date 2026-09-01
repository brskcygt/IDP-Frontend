'use strict';

/**
 * `idp:audit:list` — direct IPC equivalent of `GET /api/audit-logs`
 * (backend/src/server.js), same `audit:read` permission.
 *
 * Note: the HTTP route hardcodes a limit of 100 and ignores any query
 * param; this preserves that (the `limit` argument the Transport interface
 * accepts is honored here instead, since there is no equivalent
 * HTTP-route-only limitation to preserve for IPC).
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');

function registerAuditHandlers() {
  ipcMain.handle(
    'idp:audit:list',
    ipcHandler('audit:read', async (_event, limit) => {
      const { auditLogger } = getBackendModules();
      return auditLogger.getLogs(limit !== undefined ? limit : 100);
    })
  );
}

module.exports = { registerAuditHandlers };
