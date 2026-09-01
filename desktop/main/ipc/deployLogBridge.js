'use strict';

/**
 * Live deployment log fan-out for the IPC transport (T-91).
 *
 * This is the IPC-native replacement for `backend/src/routes/deploy.js`'s
 * SSE handler (`GET /api/deploy/logs/:deploymentId`) — same two-phase
 * contract, same "late-join replay" guarantee, just delivered over
 * `webContents.send(...)` instead of `text/event-stream`:
 *
 *   Phase 1 (replay): every buffered log line from `fromIndex` onward is
 *   sent immediately, synchronously, before anything live is wired up —
 *   this is the exact equivalent of SSE's `Last-Event-ID` resume logic
 *   (`backend/src/routes/deploy.js` lines ~66-86). A fresh subscribe passes
 *   `fromIndex: 0`, which replays the WHOLE buffer, matching what a brand
 *   new `EventSource` with no `Last-Event-ID` header does today.
 *
 *   Phase 2 (live): `deploymentManager.subscribe()` is used to push every
 *   new line as it arrives, keeping the same monotonic `index` sequence the
 *   replay phase left off at (DeploymentManager owns that counter — see its
 *   `pushLog()` — so there's no local counter here to drift out of sync).
 *
 * Deliberately has ZERO `require('electron')` anywhere in this file — it
 * only depends on plain functions passed in (`sendEvent`, and
 * `deploymentManager`, itself Express-independent). That is what makes this
 * module runnable, and testable, under plain Node without Electron even
 * installed — see `desktop/main/ipc/deployLogBridge.test.js`. The
 * `ipcMain.handle` wiring — the only place `electron` is required — lives
 * in `desktop/main/ipc/deploy.js`.
 */

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted']);
/** Mirrors the SSE route's 1s status-poll interval — see routes/deploy.js. */
const STATUS_POLL_MS = 1000;

/**
 * @param {object} deps
 * @param {import('../../../backend/src/services/DeploymentManager')} deps.deploymentManager
 * @param {(payload: object) => void} deps.sendEvent - delivers one event to
 *   the renderer, e.g. `webContents.send('idp:deploy:log-event', payload)`.
 *   Payload shapes:
 *     { subscriptionId, deploymentId, type: 'log', line, index }
 *     { subscriptionId, deploymentId, type: 'status', status }
 *     { subscriptionId, deploymentId, type: 'end', message }
 *     { subscriptionId, deploymentId, type: 'error' }
 */
function createDeployLogBridge({ deploymentManager, sendEvent }) {
  /** Map<subscriptionId, { unsubscribe: () => void, statusTimer: NodeJS.Timeout }> */
  const active = new Map();

  function teardown(subscriptionId) {
    const entry = active.get(subscriptionId);
    if (!entry) return;
    active.delete(subscriptionId);
    try {
      entry.unsubscribe();
    } catch {
      // Subscriber already gone — nothing to do.
    }
    clearInterval(entry.statusTimer);
  }

  /**
   * Starts (or resumes) a subscription. Mirrors the SSE route's
   * `Last-Event-ID` semantics: `fromIndex` is the first index the caller
   * has NOT already seen (0 for a fresh subscribe).
   *
   * @param {string} deploymentId
   * @param {string} subscriptionId - caller-generated, unique per logical
   *   subscription (the renderer mints one per `subscribeLogs()` call).
   * @param {number} [fromIndex]
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  function subscribe(deploymentId, subscriptionId, fromIndex = 0) {
    // A stale subscriptionId (e.g. a duplicate subscribe call) must not
    // leak the previous subscription's live listener/timer.
    teardown(subscriptionId);

    const session = deploymentManager.getSession(deploymentId);
    if (!session) {
      return { ok: false, error: `Deployment ${deploymentId} not found.` };
    }

    const emit = (type, extra) => {
      sendEvent({ subscriptionId, deploymentId, type, ...extra });
    };

    // Phase 1: replay buffered lines the caller hasn't seen yet.
    const safeStart = Number.isInteger(fromIndex) && fromIndex >= 0 ? fromIndex : 0;
    for (let i = safeStart; i < session.logs.length; i += 1) {
      emit('log', { line: session.logs[i], index: i });
    }

    emit('status', { status: session.status });

    // Phase 2: live subscription, continuing the same index sequence.
    const unsubscribe = deploymentManager.subscribe(deploymentId, (line, index) => {
      emit('log', { line, index });
    });

    // Status changes aren't push-based on DeploymentManager (same
    // constraint the SSE route works around) — poll it, same interval.
    let lastStatus = session.status;
    const statusTimer = setInterval(() => {
      const current = deploymentManager.getSession(deploymentId);
      if (!current) {
        emit('end', { message: 'Deployment session expired.' });
        teardown(subscriptionId);
        return;
      }

      if (current.status !== lastStatus) {
        lastStatus = current.status;
        emit('status', { status: lastStatus });

        if (TERMINAL_STATUSES.has(lastStatus)) {
          emit('end', { message: `Deployment ${lastStatus}.` });
          teardown(subscriptionId);
        }
      }
    }, STATUS_POLL_MS);

    active.set(subscriptionId, { unsubscribe, statusTimer });
    return { ok: true };
  }

  /** @param {string} subscriptionId */
  function unsubscribe(subscriptionId) {
    teardown(subscriptionId);
  }

  /** Tears down every active subscription — called when the window closes. */
  function unsubscribeAll() {
    for (const subscriptionId of Array.from(active.keys())) {
      teardown(subscriptionId);
    }
  }

  /** @returns {number} count of currently-active subscriptions (test/debug hook). */
  function activeCount() {
    return active.size;
  }

  return { subscribe, unsubscribe, unsubscribeAll, activeCount };
}

module.exports = { createDeployLogBridge };
