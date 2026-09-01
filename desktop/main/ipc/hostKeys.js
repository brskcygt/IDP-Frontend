'use strict';

/**
 * `idp:hostKeys:*` — direct IPC equivalents of `backend/src/routes/hostKeys.js`.
 * Same `vpn:manage` permission as the HTTP routes (T-17b's "operate the
 * deployment infrastructure" admin bucket).
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');
const session = require('./session');

function registerHostKeyHandlers() {
  ipcMain.handle(
    'idp:hostKeys:list',
    ipcHandler('vpn:manage', async () => {
      const { hostKeyRepository } = getBackendModules();
      return hostKeyRepository.listAll();
    })
  );

  ipcMain.handle(
    'idp:hostKeys:forget',
    ipcHandler('vpn:manage', async (_event, host, port) => {
      const { core, hostKeyRepository, auditLogger } = getBackendModules();
      const parsedPort = Number.parseInt(port, 10);
      if (!Number.isInteger(parsedPort)) {
        throw new core.ValidationError('port must be an integer.');
      }

      const forgotten = hostKeyRepository.forget(host, parsedPort);
      if (!forgotten) {
        throw new core.NotFoundError(`No host key pinned for ${host}:${parsedPort}.`);
      }

      auditLogger.log(
        session.getCurrentActor(),
        'HOST_KEY_FORGOTTEN',
        `Forgot pinned SSH host key for ${host}:${parsedPort}`,
        { host, port: parsedPort }
      );
    })
  );
}

module.exports = { registerHostKeyHandlers };
