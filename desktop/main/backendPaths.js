'use strict';

/**
 * Resolves the backend source root for both dev (running straight out of
 * the repo) and packaged (electron-builder copies `backend/` into
 * `process.resourcesPath/backend` via `extraResources` — see
 * `desktop/package.json`) modes.
 *
 * T-91 replaces T-90's `main/backend.js` (which forked `backend/src/server.js`
 * as a child process and talked HTTP to it) with directly `require()`-ing
 * `backend/src/core/**` — and the auth/store/service modules it depends on —
 * straight into the Electron main process. Every one of those modules
 * resolves its own data files (`idp.db`, `secrets.enc.json`, `users.json`,
 * ...) via `path.join(__dirname, ...)` relative to ITS OWN file location
 * (see `backend/src/store/db.js`), so requiring them from here — instead of
 * from `backend/src/server.js` — does not change where any of that data
 * lives. This function only needs to find the right `backend/` directory to
 * `require()` from; module resolution (and each module's own relative
 * paths) does the rest.
 */
const path = require('path');
const fs = require('fs');

/**
 * @param {boolean} isPackaged
 * @param {string} resourcesPath
 * @returns {string} absolute path to the `backend/` directory whose `src/`
 *   contains the modules this app requires.
 */
function resolveBackendRoot(isPackaged, resourcesPath) {
  const backendRoot = isPackaged
    ? path.join(resourcesPath, 'backend')
    : path.join(__dirname, '..', '..', 'backend');

  const marker = path.join(backendRoot, 'src', 'core', 'bootstrap.js');
  if (!fs.existsSync(marker)) {
    throw new Error(
      `Backend kaynak dizini bulunamadı: ${backendRoot} (aranan: ${marker}). ` +
      (isPackaged
        ? 'electron-builder extraResources yapılandırmasını kontrol edin (desktop/package.json).'
        : 'backend/ klasörünün desktop/ ile kardeş olduğundan emin olun.')
    );
  }

  return backendRoot;
}

module.exports = { resolveBackendRoot };
