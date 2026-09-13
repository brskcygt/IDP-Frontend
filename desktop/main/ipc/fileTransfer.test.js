'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isBenignDisconnectError } = require('./fileTransfer');
const { createWindowsInstaller } = require('../agentBuilder');

test('successful SFTP cleanup reset errors are benign', () => {
  assert.equal(isBenignDisconnectError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), true);
  assert.equal(isBenignDisconnectError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })), true);
  assert.equal(isBenignDisconnectError(new Error('Authentication failed')), false);
});

test('installer preserves launcher runtime variables', () => {
  const installer = createWindowsInstaller('WIN-PROD-01', 'agent.jar', 'wss://agent-gw.example.com', {
    deployBasePath: 'C:\\inetpub\\wwwroot\\jetsrm',
  });
  assert.doesNotMatch(installer, /@'\n\$ErrorActionPreference/);
  assert.match(installer, /exit \$LASTEXITCODE\n'@/);
});
