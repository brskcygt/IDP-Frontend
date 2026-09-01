'use strict';

/**
 * electron-builder configuration (T-95).
 *
 * Moved out of `package.json`'s static `build` field into this JS module.
 * MUST be named exactly `electron-builder.js` — electron-builder's config
 * loader (`app-builder-lib/out/util/config/load.js`) only auto-discovers
 * `electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}`; a name like
 * `electron-builder.config.js` is silently ignored (confirmed empirically:
 * with that name, `npm run build` fell back to electron-builder's own
 * built-in defaults with NO warning that this file was never read — the
 * "loaded configuration" log line it prints on success never appeared).
 * package.json must NOT also have a `build` field — electron-builder
 * refuses to start if both are present. Moving to a JS module specifically
 * lets mac code-signing/notarization and Windows Authenticode signing be
 * driven by environment variables at build time, without ever REQUIRING
 * them — `process.env.X ? A : B` conditionals aren't possible in static
 * JSON.
 *
 * When none of the signing/notarization env vars below are set, this
 * produces byte-for-byte the same unsigned `"dir"` output that
 * `desktop/package.json`'s old static `build` field did (T-90/T-91):
 * `mac.identity: null`, no Windows cert, no `afterSign` notarization work,
 * no `publish` config. See `docs/06-DAGITIM.md` for what each env var is,
 * where to get it, and how long Apple's certificate/notarization
 * provisioning can take.
 */

const hasMacSigningCert = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
const hasAppleNotarizationCreds = Boolean(
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
);
const hasWindowsSigningCert = Boolean(process.env.WIN_CSC_LINK && process.env.WIN_CSC_KEY_PASSWORD);

if (!hasMacSigningCert) {
  console.warn(
    '\n⚠️  [electron-builder] macOS kod imzalama sertifikası yok ' +
      '(CSC_LINK/CSC_KEY_PASSWORD tanımlı değil) — UNSIGNED BUILD üretilecek. ' +
      "Gatekeeper bu build'i BAŞKA makinelerde çalıştırmayı engelleyecek " +
      '(yalnızca yerel makinede "sağ tık > Aç" ile atlanabilir; kurumsal ' +
      'dağıtımda bu kabul edilemez). Bkz. docs/06-DAGITIM.md.\n'
  );
} else if (!hasAppleNotarizationCreds) {
  console.warn(
    '\n⚠️  [electron-builder] mac imzalama sertifikası var ama Apple ' +
      'notarization kimlik bilgileri (APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/' +
      'APPLE_TEAM_ID) eksik — build İMZALANACAK ama NOTARIZE EDİLMEYECEK. ' +
      'İmzalı-ama-notarize-edilmemiş bir build de macOS 10.15+ üzerinde ' +
      'Gatekeeper tarafından engellenir. Bkz. docs/06-DAGITIM.md.\n'
  );
}

if (!hasWindowsSigningCert) {
  console.warn(
    '\n⚠️  [electron-builder] Windows Authenticode sertifikası yok ' +
      '(WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD tanımlı değil) — imzasız .exe ' +
      'üretilecek. SmartScreen bu build\'i "Unknown Publisher" olarak ' +
      'işaretleyip uyaracak. Bkz. docs/06-DAGITIM.md.\n'
  );
}

/**
 * Reads the in-house auto-update feed URL from `IDP_UPDATE_FEED_URL`
 * (T-95). Returns `null` — NOT `undefined` — when unset.
 *
 * This distinction matters: electron-builder treats an *absent* `publish`
 * key as "auto-detect from package.json's `repository` field", which (a)
 * isn't what we want at all, a private internal tool has no public GitHub
 * releases to publish to, and (b) — confirmed empirically while building
 * this config — silently expands the `mac.target: 'dir'` build into
 * `zip` + `dmg` artifacts too (electron-builder auto-adds a `zip` target
 * whenever it thinks a publish flow is active, since generic/GitHub
 * publish needs a zip for update diffing). Explicit `publish: null` is
 * electron-builder's documented way to fully disable publish AND suppress
 * that extra artifact generation, restoring the exact unsigned single-`dir`
 * output this app had before T-95.
 *
 * With a real `IDP_UPDATE_FEED_URL`, electron-builder writes the resulting
 * feed URL into the packaged app's `app-update.yml`, which
 * `desktop/main/updater.js`'s `autoUpdater.checkForUpdates()` reads at
 * runtime — see that file's doc comment for the full contract.
 *
 * @returns {import('electron-builder').Configuration['publish']}
 */
function resolvePublishConfig() {
  const feedUrl = process.env.IDP_UPDATE_FEED_URL;
  if (!feedUrl || feedUrl.trim() === '') {
    return null;
  }
  return [
    {
      provider: 'generic',
      url: feedUrl.trim(),
      // Kurum içi feed HTTPS olmayabilir (ör. dahili ağda self-signed sertifika) —
      // bu bayrak yalnızca ortam değişkeni açıkça istendiğinde devre dışı
      // bırakılır, varsayılan sertifika doğrulaması açık kalır.
      channel: 'latest',
    },
  ];
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.idp.desktop',
  productName: 'IDP',
  directories: {
    output: 'dist',
    buildResources: 'build',
  },
  files: ['main/**/*', 'preload/**/*', 'build/update-public-key.pem', '!**/*.map'],
  extraResources: [
    {
      from: '../backend',
      to: 'backend',
      filter: [
        '**/*',
        '!src/*.example.json',
        '!src/*.bak',
        '!src/*.enc.json',
        '!src/*.db*',
        '!src/projects.json',
        '!src/audit_logs.json',
        '!src/users.json',
        '!src/sessions.json',
        '!.env',
        '!test/**',
        '!node_modules{,/**/*}',
      ],
    },
    {
      from: '../frontend/dist',
      to: 'frontend',
    },
    {
      from: '../idp-agent',
      to: 'idp-agent',
      filter: ['pom.xml', 'src/main/**/*'],
    },
  ],
  asar: true,
  // Backend node_modules workaround (T-91) — unrelated to T-95, do not touch.
  afterPack: 'build/afterPack.js',
  // Notarization (T-95) — no-ops when signing/notarization env vars are
  // absent; see build/notarize.js's doc comment.
  afterSign: 'build/notarize.js',
  mac: {
    target: ['dir', 'zip'],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    // No cert configured -> explicit `null` disables signing outright,
    // exactly like the pre-T-95 static config. Cert configured -> `undefined`
    // lets electron-builder auto-discover it from the CSC_LINK/CSC_KEY_PASSWORD
    // env vars it already reads natively (electron-builder's own documented
    // mechanism — no extra plumbing needed here beyond NOT setting `null`).
    identity: hasMacSigningCert ? undefined : null,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Silences electron-builder's own `spctl` Gatekeeper assessment step for
    // unsigned/local builds, where it would always fail noisily; adds
    // nothing when a real cert+notarization ticket is present.
    gatekeeperAssess: false,
  },
  win: {
    target: 'dir',
    // Only set when a real cert is configured — omitting these keys
    // entirely (rather than setting them to undefined/null) keeps an
    // unsigned Windows build's config identical to before T-95. Property
    // names (`cscLink`/`cscKeyPassword`, and `signingHashAlgorithms` nested
    // under `signtoolOptions`, not top-level) verified against
    // `app-builder-lib/scheme.json`'s `WindowsConfiguration` — electron-builder
    // rejects the whole `win` block on the first schema mismatch, confirmed
    // empirically while building this config.
    ...(hasWindowsSigningCert
      ? {
          cscLink: process.env.WIN_CSC_LINK,
          cscKeyPassword: process.env.WIN_CSC_KEY_PASSWORD,
          signtoolOptions: { signingHashAlgorithms: ['sha256'] },
        }
      : {}),
  },
  linux: {
    target: 'dir',
    category: 'Development',
  },
  publish: resolvePublishConfig(),
};
