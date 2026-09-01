'use strict';

// electron-builder `afterPack` hook.
//
// Why this exists: electron-builder's `extraResources` copying has a
// hardcoded rule (see `app-builder-lib/out/util/filter.js`, `createFilter()`:
// `if (relative === "node_modules") return false;`) that unconditionally
// skips a root-level `node_modules` directory, no matter what `filter`
// patterns are configured in `desktop/package.json`'s
// `build.extraResources`. That rule exists for the app's OWN dependency
// tree (which electron-builder resolves and bundles through its own
// production-dependency mechanism), but it also applies to `../backend`'s
// `node_modules` here, which is a plain third-party directory as far as
// electron-builder is concerned — so it gets silently dropped, and the
// packaged app's embedded backend (`main/backend.js`) would fail to start
// (missing `express`, etc.).
//
// Confirmed empirically: several `build.extraResources[0].filter` glob
// variants for re-including `node_modules` were tried — none of them reach
// the copy, because the walker skips the directory itself (root
// `node_modules` only, verified via `app-builder-lib`'s own FileMatcher)
// before ever evaluating per-file patterns inside it.
//
// The workaround is the one electron-builder's own docs point to for this
// exact situation: copy the excluded directory manually in `afterPack`,
// with plain `fs`, after electron-builder's own copy step has run.

const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  const backendNodeModulesSrc = path.join(__dirname, '..', '..', 'backend', 'node_modules');
  const backendNodeModulesDest = path.join(resourcesDir, 'backend', 'node_modules');

  if (!fs.existsSync(backendNodeModulesSrc)) {
    throw new Error(
      `afterPack: ${backendNodeModulesSrc} bulunamadı — backend/ içinde önce ` +
      `"npm install" çalıştırılmalı.`
    );
  }

  await fs.promises.cp(backendNodeModulesSrc, backendNodeModulesDest, {
    recursive: true,
    dereference: true, // node_modules can contain symlinks (npm workspaces/link); resolve them into real files in the package.
  });

  console.log(`[afterPack] backend/node_modules kopyalandı -> ${backendNodeModulesDest}`);
};
