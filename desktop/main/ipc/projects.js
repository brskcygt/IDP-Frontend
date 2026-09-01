'use strict';

/**
 * `idp:projects:*` — direct IPC equivalents of the project CRUD/diagnostic
 * routes in `backend/src/server.js`. Every handler here does exactly what
 * its HTTP counterpart's route body does — same core/projects/projectService.js
 * calls, same validation schemas (`backend/src/validation/projectSchemas.js`),
 * same permission actions — just invoked directly instead of through Express
 * routing + middleware.
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');
const session = require('./session');

function registerProjectHandlers() {
  ipcMain.handle(
    'idp:projects:list',
    ipcHandler('project:read', async () => {
      const { core } = getBackendModules();
      return core.projectService.listProjects();
    })
  );

  ipcMain.handle(
    'idp:projects:get',
    ipcHandler('project:read', async (_event, id) => {
      const { core, projectSerialization } = getBackendModules();
      const project = core.projectService.getProject(id); // throws NotFoundError
      return projectSerialization.redactProject(project);
    })
  );

  ipcMain.handle(
    'idp:projects:create',
    ipcHandler('project:write', async (_event, input) => {
      const { core, validationSchema, projectSchemas } = getBackendModules();
      const result = validationSchema.validate(input, projectSchemas.createProjectSchema);
      if (!result.valid) {
        throw new core.ValidationError('Invalid project data.', result.errors);
      }
      return core.projectService.createProject(result.value, session.getCurrentActor());
    })
  );

  ipcMain.handle(
    'idp:projects:updateConfig',
    ipcHandler('project:write', async (_event, id, config) => {
      const { core, projectSchemas } = getBackendModules();
      const configValidation = projectSchemas.validateProjectConfig(config);
      if (!configValidation.valid) {
        throw new core.ValidationError('Invalid project settings.', configValidation.errors);
      }
      // Same contract as POST /api/projects/:id/settings: the ORIGINAL
      // (unvalidated-clone) config patch is what gets merged — validation
      // here is purely a reject gate, never a transform of accepted input
      // (see server.js's identical comment on this route).
      return core.projectService.updateProjectConfig(id, config, session.getCurrentActor());
    })
  );

  ipcMain.handle(
    'idp:projects:remove',
    ipcHandler('project:delete', async (_event, id) => {
      const { core } = getBackendModules();
      await core.projectService.deleteProject(id, session.getCurrentActor());
    })
  );

  ipcMain.handle(
    'idp:projects:environments',
    ipcHandler('project:read', async (_event, id) => {
      const { core } = getBackendModules();
      return core.projectService.getProjectEnvironments(id);
    })
  );

  ipcMain.handle(
    'idp:projects:telemetry',
    ipcHandler('project:read', async (_event, id) => {
      const { core } = getBackendModules();
      return core.projectService.getProjectTelemetry(id);
    })
  );

  ipcMain.handle(
    'idp:projects:testConnection',
    ipcHandler('project:read', async (_event, id, environment) => {
      const { core, appConfig } = getBackendModules();
      const project = core.projectService.getProject(id); // throws NotFoundError
      return core.testProjectConnection({ project, appConfig, environment });
    })
  );
}

module.exports = { registerProjectHandlers };
