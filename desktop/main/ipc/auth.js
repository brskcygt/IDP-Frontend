'use strict';

/**
 * `idp:auth:*` — direct IPC equivalents of `POST /api/auth/login`,
 * `POST /api/auth/logout`, `GET /api/auth/me` (backend/src/server.js). No
 * permission gate on any of these three (same as the HTTP routes — you
 * don't need to already be logged in to attempt a login or check whether
 * you are).
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const session = require('./session');

function registerAuthHandlers() {
  ipcMain.handle(
    'idp:auth:login',
    // Mirrors backend/src/server.js's loginRateLimit (T-19): 15 min / 10.
    ipcHandler(
      null,
      async (_event, username, password) => session.login(username, password),
      { rateLimit: { windowMs: 15 * 60 * 1000, max: 10 } }
    )
  );

  ipcMain.handle(
    'idp:auth:logout',
    ipcHandler(null, async () => {
      session.logout();
    })
  );

  ipcMain.handle(
    'idp:auth:me',
    ipcHandler(null, async () => session.getCurrentUser())
  );
}

module.exports = { registerAuthHandlers };
