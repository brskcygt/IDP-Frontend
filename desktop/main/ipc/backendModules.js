'use strict';

/**
 * Single point where the Electron main process pulls in every backend
 * module the IPC handlers need (T-91). Resolved once, against the
 * `backendRoot` computed by `desktop/main/backendPaths.js` (dev vs
 * packaged) — every `ipc/*.js` handler module reads from
 * `getBackendModules()` instead of hand-rolling its own relative
 * `require('../../../backend/...')` path, which would silently break in a
 * packaged build (see backendPaths.js's doc comment).
 *
 * `loadBackendModules()` must be called once, early, from `main/index.js`
 * before any `ipcMain.handle` registration happens.
 */
const path = require('path');

/** @type {ReturnType<typeof buildModules> | null} */
let cached = null;

function buildModules(backendRoot) {
  const src = (relativePath) => require(path.join(backendRoot, 'src', relativePath));

  return {
    backendRoot,
    bootstrapCore: src('core/bootstrap').bootstrapCore,
    core: src('core'),
    userStore: src('auth/userStore'),
    permissions: src('auth/permissions'),
    auditLogger: src('services/AuditLogger'),
    deploymentManager: src('services/DeploymentManager'),
    deploymentRepository: src('store/deploymentRepository'),
    hostKeyRepository: src('store/hostKeyRepository'),
    PmpService: src('services/vault/PmpService'),
    projectSerialization: src('api/projectSerialization'),
    validationSchema: src('validation/schema'),
    projectSchemas: src('validation/projectSchemas'),
    prodConfirmation: src('validation/prodConfirmation'),
    appConfig: src('config').loadConfig(),
    secretStore: src('core/secrets/secretStoreInstance'),
    AgentGatewayClient: src('services/agent/AgentGatewayClient'),
  };
}

/**
 * @param {string} backendRoot - from `backendPaths.resolveBackendRoot()`.
 * @returns {ReturnType<typeof buildModules>}
 */
function loadBackendModules(backendRoot) {
  if (cached) return cached;
  cached = buildModules(backendRoot);
  return cached;
}

/** @returns {ReturnType<typeof buildModules>} */
function getBackendModules() {
  if (!cached) {
    throw new Error('Backend modules not loaded yet — call loadBackendModules(backendRoot) first.');
  }
  return cached;
}

module.exports = { loadBackendModules, getBackendModules };
