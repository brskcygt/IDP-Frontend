'use strict';

/**
 * Registers every `ipcMain.handle(...)` channel backing `window.idp`.
 *
 * Called once from `main/index.js`. The app always talks to a remote IDP
 * server, so business logic runs there and the renderer reaches it over HTTP
 * through `app://idp` (main/remoteBackend.js). What is left here is
 * desktop-only: the updater and the agent JAR builder, which has to run on
 * the operator's machine because it shells out to Maven and writes the ZIP
 * to a path they pick.
 *
 * Handler modules are required inside the register function, not at load
 * time, to keep startup cost off the module graph.
 *
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

module.exports = { registerRemoteIpcHandlers };
