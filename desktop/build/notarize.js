'use strict';

/**
 * electron-builder `afterSign` hook (T-95) — submits the signed .app to
 * Apple's notary service.
 *
 * electron-builder (v24+) no longer notarizes automatically; this hook
 * calls `@electron/notarize` directly, exactly the way electron-builder's
 * own docs recommend.
 *
 * Silently NO-OPS (returns without calling Apple at all) unless BOTH:
 *   1. a real signing identity was used for this build (`CSC_LINK` +
 *      `CSC_KEY_PASSWORD` set — same check `electron-builder.config.js`
 *      uses to decide `mac.identity`), AND
 *   2. all three Apple notarization credentials are present
 *      (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
 *
 * This must never throw for an unsigned/local build — Apple's notary
 * service rejects unsigned bundles outright, and `npm run build` has to
 * keep working with zero configuration exactly like it did before T-95
 * (see `desktop/docs` → `docs/06-DAGITIM.md`).
 */
const path = require('path');

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return; // Notarization is a macOS/Gatekeeper-only concept.
  }

  const hasMacSigningCert = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
  const hasAppleNotarizationCreds = Boolean(
    process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
  );

  if (!hasMacSigningCert || !hasAppleNotarizationCreds) {
    console.log(
      '[notarize] Sertifika ve/veya Apple notarization kimlik bilgileri eksik — ' +
        'notarization ATLANIYOR (unsigned/local build). Bkz. docs/06-DAGITIM.md.'
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] ${appPath} Apple notary servisine gönderiliyor — bu birkaç dakika sürebilir...`);

  // Required only on this path — an unsigned build never reaches this line,
  // so @electron/notarize (a devDependency, not shipped in the packaged
  // app) never needs to be present for a normal unsigned `npm run build`.
  const { notarize } = require('@electron/notarize');

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log(`[notarize] ${appPath} notarize edildi.`);
};
