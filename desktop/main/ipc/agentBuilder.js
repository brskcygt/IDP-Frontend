'use strict';

const { ipcMain } = require('electron');
const { buildAgentJar } = require('../agentBuilder');

/**
 * Agent packages carry a per-agent secret issued by the IDP backend
 * (`POST /api/agents/:id/credentials`). The local (embedded backend) mode is
 * IPC-native — no Express server, so no local HTTP route to call — and its
 * backend modules expose no credential-issuing service. Talking to the gateway's
 * control API directly from here would bypass the backend's authorization,
 * audit and ID bookkeeping, so the local mode refuses with a clear message.
 */
const LOCAL_MODE_UNSUPPORTED =
  'Agent kurulum paketi yerel (gömülü backend) modda üretilemiyor: agent kimliği IDP sunucusunda üretilir. ' +
  'Uygulamayı uzak modda (IDP_SERVER_URL) açıp tekrar deneyin.';

/** Local mode: authorization comes from the in-process session (see ./helpers.js). */
function registerAgentBuilderHandlers() {
  // Required here rather than at module load: helpers.js pulls in
  // backend/src/core/*, which only the local (embedded backend) mode has.
  const { ipcHandler } = require('./helpers');
  // Permission first (same gate as before), then the refusal — before any
  // save dialog or Maven run.
  ipcMain.handle('idp:agentBuilder:build', ipcHandler('project:write', async () => {
    throw new Error(LOCAL_MODE_UNSUPPORTED);
  }));
}

/**
 * Mirror of backend/src/auth/permissions.js for the one action needed here:
 * ROLE_RANK (viewer < deployer < admin) and ACTION_MIN_ROLE['project:write'] =
 * 'admin'. Copied instead of required because remote mode must not depend on
 * the backend source tree being on this machine. Fail-closed like `can()`:
 * an unknown role is denied.
 */
const ROLE_RANK = Object.freeze({ viewer: 1, deployer: 2, admin: 3 });
const PROJECT_WRITE_MIN_ROLE = 'admin';

function canWriteProjects(role) {
  const rank = ROLE_RANK[role];
  return Boolean(rank) && rank >= ROLE_RANK[PROJECT_WRITE_MIN_ROLE];
}

/** Same wire shape as helpers.js `serializeError()` — parsed by ipcTransport's `parseIpcError()`. */
function ipcError(kind, message) {
  return new Error(JSON.stringify({ __idpError: true, kind, message }));
}

/**
 * Remote mode (IDP_SERVER_URL): there is no local session — the user is
 * whoever the remote server says owns the main-process cookie jar
 * (`GET /api/auth/me`). The JAR itself is still built and saved on THIS
 * machine; its secret comes from the server with the same session. The
 * backend re-checks authorization on the credentials call.
 * @param {{
 *   getRemoteUser: () => Promise<{ username: string, role: string } | null>,
 *   issueAgentCredentials: (agentId: string) => Promise<unknown>,
 *   builderDeps?: object,
 * }} deps - `builderDeps`: test seam passed through to buildAgentJar.
 */
function registerRemoteAgentBuilderHandlers({ getRemoteUser, issueAgentCredentials, builderDeps = {} }) {
  // Required lazily, like helpers.js above: the local mode never needs it.
  const { APP_ORIGIN } = require('../remoteBackend');

  ipcMain.handle('idp:agentBuilder:build', async (event, input) => {
    // The remote session in the main process belongs to the app://idp UI only.
    // Any other frame that somehow got the preload (data:, file:, a stray
    // window) must not borrow it to build an agent package.
    const origin = event && event.senderFrame ? event.senderFrame.origin : null;
    if (origin !== APP_ORIGIN) {
      throw ipcError('PermissionError', `Bu işlem yalnızca ${APP_ORIGIN} arayüzünden çağrılabilir (gelen: ${origin || 'bilinmiyor'}).`);
    }

    let user;
    try {
      user = await getRemoteUser();
    } catch (err) {
      throw ipcError('Error', err && err.message ? err.message : String(err));
    }
    if (!user) throw ipcError('Error', 'Unauthorized: not logged in.');
    if (!canWriteProjects(user.role)) {
      throw ipcError(
        'PermissionError',
        `Bu işlem için yetkiniz yok ('project:write' izni gerekir). Mevcut rolünüz: ${user.role}.`
      );
    }
    try {
      // The result is secret-free by contract (see buildAgentJar).
      return await buildAgentJar(input, { ...builderDeps, issueCredentials: issueAgentCredentials });
    } catch (err) {
      throw ipcError('Error', err && err.message ? err.message : String(err));
    }
  });
}

module.exports = {
  registerAgentBuilderHandlers,
  registerRemoteAgentBuilderHandlers,
  canWriteProjects,
  LOCAL_MODE_UNSUPPORTED,
};
