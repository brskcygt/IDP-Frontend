'use strict';

/**
 * Tests for deployLogBridge.js (T-91) — run under plain Node, no Electron.
 *
 * Proves the "late-join replay" contract end to end using the REAL
 * DeploymentManager from backend/src/services/DeploymentManager.js (not a
 * fake) against a throwaway SQLite file, exactly the way
 * backend/test/deployment-manager.test.js already isolates it.
 *
 * Run with:
 *   node --test desktop/main/ipc/deployLogBridge.test.js
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Give this process its own throwaway DB file BEFORE requiring anything that
// opens one (DeploymentManager's singleton binds to it at require time) —
// same isolation strategy as backend/test/helpers/isolateDb.js.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idp-deploy-log-bridge-'));
process.env.IDP_DB_PATH = path.join(tmpDir, 'test.db');

const deploymentManager = require('../../../backend/src/services/DeploymentManager');
const { createDeployLogBridge } = require('./deployLogBridge');

/** A fake adapter with just enough surface for DeploymentManager.createSession(). */
function fakeAdapter() {
  return { onLog() {}, abort: async () => {} };
}

function makeBridge() {
  const events = [];
  const bridge = createDeployLogBridge({
    deploymentManager,
    sendEvent: (payload) => events.push(payload),
  });
  return { bridge, events };
}

test('subscribe() with fromIndex 0 replays every buffered line, then delivers live lines', async () => {
  const { bridge, events } = makeBridge();
  const deploymentId = deploymentManager.createSession('proj-1', fakeAdapter());
  deploymentManager.setStatus(deploymentId, 'running');
  deploymentManager.pushLog(deploymentId, 'line 0');
  deploymentManager.pushLog(deploymentId, 'line 1');

  const result = bridge.subscribe(deploymentId, 'sub-1', 0);
  assert.deepEqual(result, { ok: true });

  const replayed = events.filter((e) => e.type === 'log');
  assert.deepEqual(
    replayed.map((e) => [e.line, e.index]),
    [
      ['line 0', 0],
      ['line 1', 1],
    ]
  );
  assert.ok(events.some((e) => e.type === 'status' && e.status === 'running'));

  deploymentManager.pushLog(deploymentId, 'line 2 (live)');
  const liveLines = events.filter((e) => e.type === 'log');
  assert.deepEqual(liveLines[liveLines.length - 1], {
    subscriptionId: 'sub-1',
    deploymentId,
    type: 'log',
    line: 'line 2 (live)',
    index: 2,
  });

  bridge.unsubscribe('sub-1');
  assert.equal(bridge.activeCount(), 0);
});

test('subscribe() with a non-zero fromIndex only replays the lines the caller has not seen', async () => {
  const { bridge, events } = makeBridge();
  const deploymentId = deploymentManager.createSession('proj-2', fakeAdapter());
  deploymentManager.setStatus(deploymentId, 'running');
  deploymentManager.pushLog(deploymentId, 'a');
  deploymentManager.pushLog(deploymentId, 'b');
  deploymentManager.pushLog(deploymentId, 'c');

  // Caller already has indices 0 and 1 (e.g. resuming after a brief drop) —
  // this is the exact Last-Event-ID-equivalent resume path.
  bridge.subscribe(deploymentId, 'sub-2', 2);

  const replayed = events.filter((e) => e.type === 'log');
  assert.deepEqual(replayed.map((e) => e.line), ['c']);

  bridge.unsubscribe('sub-2');
});

test('subscribe() on an unknown deploymentId returns ok:false and emits nothing', () => {
  const { bridge, events } = makeBridge();
  const result = bridge.subscribe('does-not-exist', 'sub-3', 0);
  assert.equal(result.ok, false);
  assert.equal(events.length, 0);
});

test('an end/status event on a terminal status tears down the subscription', async () => {
  const { bridge, events } = makeBridge();
  const deploymentId = deploymentManager.createSession('proj-3', fakeAdapter());
  deploymentManager.setStatus(deploymentId, 'running');
  deploymentManager.pushLog(deploymentId, 'only line');

  bridge.subscribe(deploymentId, 'sub-4', 0);
  assert.equal(bridge.activeCount(), 1);

  deploymentManager.setStatus(deploymentId, 'succeeded');

  // The status poll runs on a 1s interval — wait past it.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  assert.ok(events.some((e) => e.type === 'status' && e.status === 'succeeded'));
  assert.ok(events.some((e) => e.type === 'end'));
  assert.equal(bridge.activeCount(), 0, 'subscription must be torn down after a terminal status');
});

test('re-subscribing with the same subscriptionId tears down the previous listener first', () => {
  const { bridge, events } = makeBridge();
  const deploymentId = deploymentManager.createSession('proj-4', fakeAdapter());
  deploymentManager.setStatus(deploymentId, 'running');
  deploymentManager.pushLog(deploymentId, 'x');

  bridge.subscribe(deploymentId, 'sub-5', 0);
  assert.equal(bridge.activeCount(), 1);

  bridge.subscribe(deploymentId, 'sub-5', 0);
  assert.equal(bridge.activeCount(), 1, 'must not accumulate duplicate listeners for the same subscriptionId');

  bridge.unsubscribe('sub-5');
});

test('unsubscribeAll() tears down every active subscription', () => {
  const { bridge } = makeBridge();
  const d1 = deploymentManager.createSession('proj-5', fakeAdapter());
  const d2 = deploymentManager.createSession('proj-6', fakeAdapter());
  deploymentManager.setStatus(d1, 'running');
  deploymentManager.setStatus(d2, 'running');

  bridge.subscribe(d1, 'sub-6', 0);
  bridge.subscribe(d2, 'sub-7', 0);
  assert.equal(bridge.activeCount(), 2);

  bridge.unsubscribeAll();
  assert.equal(bridge.activeCount(), 0);
});
