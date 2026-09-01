'use strict';

/**
 * `idp:deploy:*` — direct IPC equivalents of `backend/src/routes/deploy.js`
 * and the `/api/deploy/trigger` route in `backend/src/server.js`.
 *
 * Log streaming (`subscribeLogs`/`unsubscribeLogs`) is the one channel pair
 * with no HTTP route to mirror 1:1 — it replaces the SSE endpoint
 * (`GET /api/deploy/logs/:deploymentId`) with `deployLogBridge.js` (see that
 * file for the late-join replay contract) pushing events to the renderer
 * over `webContents.send('idp:deploy:log-event', ...)`.
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');
const session = require('./session');
const { createDeployLogBridge } = require('./deployLogBridge');

/** @type {ReturnType<typeof createDeployLogBridge> | null} */
let logBridge = null;

/**
 * @param {import('electron').BrowserWindow} win - the log bridge sends
 *   every event to this window's webContents. Single-window app (see
 *   docs/03-ELECTRON-MIMARI.md), so one bridge instance is enough.
 */
function registerDeployHandlers(win) {
  const { deploymentManager } = getBackendModules();

  logBridge = createDeployLogBridge({
    deploymentManager,
    sendEvent: (payload) => {
      if (!win.isDestroyed()) {
        win.webContents.send('idp:deploy:log-event', payload);
      }
    },
  });

  ipcMain.handle(
    'idp:deploy:trigger',
    // Mirrors backend/src/server.js's deployTriggerRateLimit (T-19): 1 min / 10.
    ipcHandler('deploy:trigger', async (_event, projectId, parameters) => {
      const { core, validationSchema, projectSchemas, prodConfirmation, appConfig } = getBackendModules();

      const bodyValidation = validationSchema.validate(
        { projectId, parameters },
        projectSchemas.deployTriggerSchema
      );
      if (!bodyValidation.valid) {
        throw new core.ValidationError('Invalid deploy trigger request.', bodyValidation.errors);
      }
      const validatedParameters = bodyValidation.value.parameters || {};

      const project = core.projectService.getProject(bodyValidation.value.projectId); // throws NotFoundError

      const confirmationError = prodConfirmation.checkProdConfirmation(project, validatedParameters);
      if (confirmationError) {
        throw new core.ValidationError(confirmationError.error, confirmationError);
      }

      if (project.status === 'Deploying' || core.deploymentService.isProjectDeploying(project.id)) {
        throw new core.ConflictError('Deployment already in progress for this project.');
      }

      const deploymentId = await core.deploymentService.executeDeploy({
        project,
        parameters: validatedParameters,
        triggeredBy: session.getCurrentActor(),
        appConfig,
      });

      return { deploymentId };
    }, { rateLimit: { windowMs: 60 * 1000, max: 10 } })
  );

  ipcMain.handle(
    'idp:deploy:abort',
    ipcHandler('deploy:abort', async (_event, deploymentId) => {
      const { core, auditLogger } = getBackendModules();
      const targetSession = deploymentManager.getSession(deploymentId);

      if (!targetSession) {
        throw new core.NotFoundError('Deployment not found.');
      }
      if (['succeeded', 'failed', 'aborted'].includes(targetSession.status)) {
        throw new core.ConflictError(`Deployment already ${targetSession.status}.`);
      }
      if (targetSession.readOnly || !targetSession.adapter) {
        throw new core.ConflictError(
          'This deployment is no longer running in this process (it predates a restart), so it cannot be aborted.'
        );
      }

      await deploymentManager.abort(deploymentId);
      deploymentManager.pushLog(deploymentId, '[System] Deployment aborted by user via IPC.');
      auditLogger.log(session.getCurrentActor(), 'DEPLOY_ABORTED', 'Deployment aborted', { deploymentId });
    })
  );

  ipcMain.handle(
    'idp:deploy:submitMfa',
    ipcHandler('deploy:trigger', async (_event, deploymentId, code) => {
      const { core, auditLogger } = getBackendModules();
      const resolved = deploymentManager.resolveMfa(deploymentId, code);
      if (!resolved) {
        throw new core.NotFoundError('No active MFA request found for this deployment.');
      }
      auditLogger.log(session.getCurrentActor(), 'MFA_SUBMITTED', 'MFA response submitted', { deploymentId });
    })
  );

  ipcMain.handle(
    'idp:deploy:sessions',
    ipcHandler('project:read', async () => {
      const { deploymentRepository } = getBackendModules();
      const live = deploymentManager.listSessions();
      const liveIds = new Set(live.map((s) => s.id));
      const persisted = deploymentRepository
        .listRecent(50)
        .filter((d) => !liveIds.has(d.id))
        .map((d) => ({ id: d.id, projectId: d.projectId, status: d.status, startedAt: d.startedAt, logCount: null }));
      return [...live, ...persisted];
    })
  );

  ipcMain.handle(
    'idp:deploy:history',
    ipcHandler('project:read', async (_event, projectId, limit) => {
      const { deploymentRepository } = getBackendModules();
      const clampedLimit = parseLimit(limit);
      return projectId
        ? deploymentRepository.listByProject(String(projectId), clampedLimit)
        : deploymentRepository.listRecent(clampedLimit);
    })
  );

  ipcMain.handle(
    'idp:deploy:logsArchive',
    ipcHandler('project:read', async (_event, deploymentId) => {
      const { core, deploymentRepository } = getBackendModules();
      const deployment = deploymentRepository.findById(deploymentId);
      if (!deployment) {
        throw new core.NotFoundError(`Deployment ${deploymentId} not found.`);
      }
      return deployment.logText || '';
    })
  );

  ipcMain.handle(
    'idp:deploy:subscribeLogs',
    ipcHandler('project:read', async (_event, deploymentId, subscriptionId, fromIndex) => {
      const { core } = getBackendModules();
      const result = logBridge.subscribe(deploymentId, subscriptionId, fromIndex || 0);
      if (!result.ok) {
        throw new core.NotFoundError(result.error);
      }
    })
  );

  ipcMain.handle(
    'idp:deploy:unsubscribeLogs',
    ipcHandler(null, async (_event, subscriptionId) => {
      logBridge.unsubscribe(subscriptionId);
    })
  );
}

/** Tears down every live log subscription — called when the window closes. */
function unsubscribeAllDeployLogs() {
  if (logBridge) logBridge.unsubscribeAll();
}

/** Clamp a `limit` argument to a sane, always-defined page size (mirrors routes/deploy.js's parseLimit). */
function parseLimit(rawLimit, { fallback = 50, max = 500 } = {}) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

module.exports = { registerDeployHandlers, unsubscribeAllDeployLogs };
