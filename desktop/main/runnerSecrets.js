'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const RUNNER_ADMIN_KEY_REF = 'system.cloudflareRunner.adminApiKey';
const ENV_KEY = 'IDP_RUNNER_ADMIN_API_KEY';

/**
 * One-time migration from the desktop settings file to Electron safeStorage.
 * The plaintext line is removed only after an encrypted-store round trip succeeds.
 */
async function migrateRunnerAdminKey({ configPath, secretStore }) {
  const plaintext = process.env[ENV_KEY];
  if (!plaintext || !plaintext.trim()) return { migrated: false, reason: 'not-configured' };
  if (!secretStore) throw new Error('Encrypted secret storage is unavailable; runner admin key was left in idp.env.');

  await secretStore.set(RUNNER_ADMIN_KEY_REF, plaintext);
  const verified = await secretStore.get(RUNNER_ADMIN_KEY_REF);
  if (verified !== plaintext) throw new Error('Runner admin key safeStorage verification failed; idp.env was not changed.');

  const original = await fs.readFile(configPath, 'utf8');
  const lines = original.split(/\r?\n/);
  let removed = false;
  const scrubbed = lines.map((line) => {
    if (new RegExp(`^\\s*${ENV_KEY}\\s*=`).test(line)) {
      removed = true;
      return '# IDP_RUNNER_ADMIN_API_KEY migrated to OS keychain (safeStorage).';
    }
    return line;
  }).join('\n');

  if (removed) {
    const tempPath = path.join(path.dirname(configPath), `.${path.basename(configPath)}.${process.pid}.tmp`);
    try {
      await fs.writeFile(tempPath, scrubbed, { mode: 0o600 });
      await fs.rename(tempPath, configPath);
      await fs.chmod(configPath, 0o600).catch(() => {});
    } catch (error) {
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  delete process.env[ENV_KEY];
  return { migrated: true, removedFromConfig: removed };
}

module.exports = { migrateRunnerAdminKey, RUNNER_ADMIN_KEY_REF };
