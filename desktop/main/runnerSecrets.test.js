'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { migrateRunnerAdminKey, RUNNER_ADMIN_KEY_REF } = require('./runnerSecrets');

test('migrates runner key and scrubs only its plaintext env line', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'idp-runner-secret-'));
  const configPath = path.join(dir, 'idp.env');
  const previous = process.env.IDP_RUNNER_ADMIN_API_KEY;
  const values = new Map();
  const store = {
    async set(key, value) { values.set(key, value); },
    async get(key) { return values.get(key) ?? null; },
  };
  try {
    process.env.IDP_RUNNER_ADMIN_API_KEY = 'test-secret-value';
    await fs.writeFile(configPath, 'OTHER=value\nIDP_RUNNER_ADMIN_API_KEY=test-secret-value\n');
    const result = await migrateRunnerAdminKey({ configPath, secretStore: store });
    const saved = await fs.readFile(configPath, 'utf8');
    assert.equal(result.migrated, true);
    assert.equal(values.get(RUNNER_ADMIN_KEY_REF), 'test-secret-value');
    assert.match(saved, /OTHER=value/);
    assert.doesNotMatch(saved, /IDP_RUNNER_ADMIN_API_KEY=test-secret-value/);
    assert.equal(process.env.IDP_RUNNER_ADMIN_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.IDP_RUNNER_ADMIN_API_KEY;
    else process.env.IDP_RUNNER_ADMIN_API_KEY = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('does not scrub idp.env when encrypted storage verification fails', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'idp-runner-secret-'));
  const configPath = path.join(dir, 'idp.env');
  const previous = process.env.IDP_RUNNER_ADMIN_API_KEY;
  try {
    process.env.IDP_RUNNER_ADMIN_API_KEY = 'must-remain';
    await fs.writeFile(configPath, 'IDP_RUNNER_ADMIN_API_KEY=must-remain\n');
    await assert.rejects(
      migrateRunnerAdminKey({
        configPath,
        secretStore: { async set() {}, async get() { return 'wrong'; } },
      }),
      /verification failed/
    );
    assert.match(await fs.readFile(configPath, 'utf8'), /IDP_RUNNER_ADMIN_API_KEY=must-remain/);
  } finally {
    if (previous === undefined) delete process.env.IDP_RUNNER_ADMIN_API_KEY;
    else process.env.IDP_RUNNER_ADMIN_API_KEY = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
