'use strict';

/**
 * First-run server address prompt — the file-writing and probing halves,
 * with `electron` stubbed via require.cache so this runs in plain Node:
 *   node --test desktop/main/setup/serverSetup.test.js
 *
 * The window itself is not exercised here; what matters is that the address
 * survives a round trip through `idp.env` exactly as `main/index.js` reads it
 * back, since a mismatch there strands the app on the setup screen forever.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function stubModule(request, exports) {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stubModule('electron', {
  BrowserWindow: class {},
  ipcMain: { handle() {}, removeHandler() {} },
});

const { writeServerUrl, probeServer } = require('./serverSetup');

/** The exact parser `main/index.js` uses on idp.env — kept in sync by hand. */
function parseUserConfigText(text) {
  const entries = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || value === '') continue;
    entries.push([key, value]);
  }
  return entries;
}

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idp-setup-'));
  return { dir, configPath: path.join(dir, 'idp.env') };
}

test('writes the address to a file that does not exist yet, owner-only', () => {
  const { dir, configPath } = tempConfig();
  try {
    writeServerUrl(configPath, 'http://10.0.0.5:3001');
    assert.match(fs.readFileSync(configPath, 'utf8'), /^IDP_SERVER_URL=http:\/\/10\.0\.0\.5:3001$/m);
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('changing the address replaces the definition instead of appending a second one', () => {
  const { dir, configPath } = tempConfig();
  try {
    writeServerUrl(configPath, 'http://10.0.0.5:3001');
    writeServerUrl(configPath, 'http://10.0.0.9:3001');

    const text = fs.readFileSync(configPath, 'utf8');
    // First occurrence wins in main/index.js, so a leftover line would win
    // over the one just saved.
    assert.equal(text.match(/^IDP_SERVER_URL=/gm).length, 1);
    assert.match(text, /IDP_SERVER_URL=http:\/\/10\.0\.0\.9:3001/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unrelated settings survive; commented-out and export-prefixed duplicates do not', () => {
  const { dir, configPath } = tempConfig();
  try {
    fs.writeFileSync(configPath, [
      '# header',
      'NODE_EXTRA_CA_CERTS=/tmp/ca.pem',
      '# IDP_SERVER_URL=http://old:1',
      'export IDP_SERVER_URL=http://old:2',
      '',
    ].join('\n'));

    writeServerUrl(configPath, 'https://idp.example.com');

    const text = fs.readFileSync(configPath, 'utf8');
    assert.match(text, /NODE_EXTRA_CA_CERTS=\/tmp\/ca\.pem/);
    assert.ok(!text.includes('http://old:'));
    assert.deepEqual(
      parseUserConfigText(text).find(([key]) => key === 'IDP_SERVER_URL'),
      ['IDP_SERVER_URL', 'https://idp.example.com']
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreachable address is reported, not thrown', async () => {
  const result = await probeServer('http://127.0.0.1:59999');
  assert.equal(result.ok, false);
  assert.match(result.message, /ulaşılamadı/);
});
