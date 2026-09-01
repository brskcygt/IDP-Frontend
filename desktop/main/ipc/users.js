'use strict';

/**
 * `idp:users:*` — direct IPC equivalents of `backend/src/routes/users.js`
 * (T-52 / SEC-09, admin-only via `user:manage`). `userStore.js` throws
 * plain `Error`s with a stable `.code` (USERNAME_TAKEN, LAST_ADMIN,
 * NOT_FOUND, INVALID_*) — `helpers.js`'s `normalizeUserStoreError()` maps
 * those onto `core/errors.js` kinds so they serialize the same way every
 * other typed error does; no separate error-mapping logic needed here
 * (unlike `routes/users.js`'s own `userStoreErrorResponse()`).
 */
const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');
const session = require('./session');

function registerUserHandlers() {
  ipcMain.handle(
    'idp:users:list',
    ipcHandler('user:manage', async () => {
      const { userStore } = getBackendModules();
      return userStore.getUsers();
    })
  );

  ipcMain.handle(
    'idp:users:create',
    ipcHandler('user:manage', async (_event, input) => {
      const { core, userStore, validationSchema, projectSchemas, auditLogger } = getBackendModules();
      const result = validationSchema.validate(input || {}, projectSchemas.userSchema);
      if (!result.valid) {
        throw new core.ValidationError('Invalid user data.', result.errors);
      }
      const { username, password, role } = result.value;
      const created = userStore.addUser({ username, password, role });
      auditLogger.log(
        session.getCurrentActor(),
        'USER_CREATED',
        `Created user: ${created.username} (${created.role})`,
        { userId: created.id }
      );
      return created;
    })
  );

  ipcMain.handle(
    'idp:users:update',
    ipcHandler('user:manage', async (_event, id, patch) => {
      const { core, userStore, validationSchema, projectSchemas, auditLogger } = getBackendModules();
      const body = patch || {};

      if (body.role === undefined && body.password === undefined) {
        throw new core.ValidationError('Provide at least one of: role, password.');
      }

      const result = validationSchema.validate(body, projectSchemas.userUpdateSchema);
      if (!result.valid) {
        throw new core.ValidationError('Invalid user data.', result.errors);
      }
      const { role, password } = result.value;

      let updated = null;
      if (role !== undefined) {
        updated = userStore.updateUserRole(id, role);
        auditLogger.log(
          session.getCurrentActor(),
          'USER_ROLE_CHANGED',
          `Changed role for user ${updated.username} to ${updated.role}`,
          { userId: id }
        );
      }
      if (password !== undefined) {
        updated = userStore.updateUserPassword(id, password);
        auditLogger.log(session.getCurrentActor(), 'USER_PASSWORD_RESET', `Reset password for user ${updated.username}`, {
          userId: id,
        });
      }
      return updated;
    })
  );

  ipcMain.handle(
    'idp:users:remove',
    ipcHandler('user:manage', async (_event, id) => {
      const { userStore, auditLogger } = getBackendModules();
      const target = userStore.getUserById(id);
      userStore.removeUser(id);
      auditLogger.log(session.getCurrentActor(), 'USER_DELETED', `Deleted user: ${target ? target.username : id}`, {
        userId: id,
      });
    })
  );
}

module.exports = { registerUserHandlers };
