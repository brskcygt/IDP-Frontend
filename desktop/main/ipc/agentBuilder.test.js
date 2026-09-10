'use strict';

/**
 * IPC surface of the agent builder — plain Node with `electron`, the local
 * session and the backend module registry stubbed via require.cache:
 *   node --test desktop/main/ipc/agentBuilder.test.js
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const handlers = new Map();
let currentRole = null;

function stubModule(request, exports) {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stubModule('electron', {
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  app: { isPackaged: false },
  dialog: { showSaveDialog: async () => { throw new Error('tests inject showSaveDialog'); } },
});
stubModule('./session', { getCurrentRole: () => currentRole });
stubModule('./backendModules', { getBackendModules: () => ({ permissions: { can: (role) => role === 'admin' } }) });

const {
  registerAgentBuilderHandlers,
  registerRemoteAgentBuilderHandlers,
  LOCAL_MODE_UNSUPPORTED,
} = require('./agentBuilder');
const { APP_ORIGIN } = require('../remoteBackend');

const SECRET = 'agt_remote_secret_value_123';
const CF_SECRET = 'cf-remote-secret-456';
const input = { agentId: 'WIN-PROD-01', workingDirectory: 'C:\\Apps\\PaymentApi', logLevel: 'INFO' };
const appEvent = { senderFrame: { origin: APP_ORIGIN } };

const parseIpcError = (err) => JSON.parse(err.message);

async function fakeJar(buildRoot) {
  const jar = new AdmZip();
  jar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
  await fs.mkdir(path.join(buildRoot, 'target'), { recursive: true });
  const jarPath = path.join(buildRoot, 'target', 'idp-agent-1.0.0.jar');
  jar.writeZip(jarPath);
  return jarPath;
}

async function registerRemote({ role = 'admin', issue } = {}) {
  handlers.clear();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'idp-agent-ipc-test-'));
  const calls = [];
  registerRemoteAgentBuilderHandlers({
    getRemoteUser: async () => ({ username: 'baris', role }),
    issueAgentCredentials: async (agentId) => {
      calls.push(agentId);
      if (issue) return issue(agentId);
      return { agentId, secret: SECRET, gatewayUrl: 'wss://agent-gw.example.com', cfAccess: { clientId: 'cf-id', clientSecret: CF_SECRET } };
    },
    builderDeps: {
      showSaveDialog: async () => ({ canceled: false, filePath: path.join(dir, 'agent.zip') }),
      buildJar: fakeJar,
      tmpDir: dir,
    },
  });
  return { handler: handlers.get('idp:agentBuilder:build'), calls, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('remote: the renderer gets path/hash/gateway only — never the secret', async () => {
  const { handler, calls, cleanup } = await registerRemote();
  try {
    const result = await handler(appEvent, input);
    assert.deepEqual(calls, ['WIN-PROD-01']);
    assert.deepEqual(Object.keys(result).sort(), ['canceled', 'cfAccess', 'filePath', 'gatewayUrl', 'sha256']);
    assert.equal(result.gatewayUrl, 'wss://agent-gw.example.com');
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET) && !serialized.includes(CF_SECRET) && !serialized.includes('cf-id'));
    // ...while the ZIP does carry it.
    const jar = new AdmZip(new AdmZip(result.filePath).readFile('idp-agent-WIN-PROD-01.jar'));
    assert.match(jar.readAsText('application.yml'), new RegExp(`agent-secret: "${SECRET}"`));
  } finally {
    await cleanup();
  }
});

test('remote: foreign origin or non-admin role never reaches the credentials endpoint', async () => {
  const foreign = await registerRemote();
  try {
    await assert.rejects(foreign.handler({ senderFrame: { origin: 'file://' } }, input), (err) => parseIpcError(err).kind === 'PermissionError');
    assert.deepEqual(foreign.calls, []);
  } finally {
    await foreign.cleanup();
  }
  const viewer = await registerRemote({ role: 'deployer' });
  try {
    await assert.rejects(viewer.handler(appEvent, input), (err) => parseIpcError(err).kind === 'PermissionError');
    assert.deepEqual(viewer.calls, []);
  } finally {
    await viewer.cleanup();
  }
});

test('remote: a backend error (503) reaches the renderer as a typed IPC error', async () => {
  const { handler, cleanup } = await registerRemote({
    issue: async () => { throw new Error('IDP sunucusu agent kimliği üretemiyor: IDP_AGENT_PUBLIC_URL is not configured'); },
  });
  try {
    await assert.rejects(handler(appEvent, input), (err) => {
      const payload = parseIpcError(err);
      return payload.__idpError === true && payload.kind === 'Error' && /IDP_AGENT_PUBLIC_URL/.test(payload.message);
    });
  } finally {
    await cleanup();
  }
});

test('local mode: permission gate first, then an explicit "remote mode required" error', async () => {
  handlers.clear();
  registerAgentBuilderHandlers();
  const handler = handlers.get('idp:agentBuilder:build');

  currentRole = null;
  await assert.rejects(handler({}, input), (err) => /not logged in/.test(parseIpcError(err).message));
  currentRole = 'deployer';
  await assert.rejects(handler({}, input), (err) => parseIpcError(err).kind === 'PermissionError');
  currentRole = 'admin';
  await assert.rejects(handler({}, input), (err) => parseIpcError(err).message === LOCAL_MODE_UNSUPPORTED);
  assert.match(LOCAL_MODE_UNSUPPORTED, /uzak mod/);
});
