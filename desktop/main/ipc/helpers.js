'use strict';

/**
 * Shared plumbing for every `ipcMain.handle` registration (T-91):
 *   - permission enforcement (`can(role, action)` from
 *     `backend/src/auth/permissions.js` — the SAME table `requirePermission`
 *     middleware used for HTTP, just invoked directly instead of via
 *     Express middleware)
 *   - typed-error serialization, so `core/errors.js`'s
 *     NotFoundError/ValidationError/ConflictError/PermissionError survive
 *     the trip across `ipcMain.handle` → `ipcRenderer.invoke` as something
 *     the renderer can branch on, not just a flattened string.
 *
 * Electron's `ipcRenderer.invoke` only ever gives the renderer a plain
 * `Error` whose `.message` is `"Error invoking remote method '<channel>': " +
 * String(thrownError)` — any extra properties on a thrown Error instance do
 * NOT survive the trip. So instead of relying on `instanceof` on the other
 * side, the thrown error's `message` IS a JSON payload:
 *   { __idpError: true, kind: 'NotFoundError'|'ValidationError'|...,
 *     message: string, details?: unknown }
 * `frontend/src/services/transport/ipcTransport.ts`'s `parseIpcError()` is
 * the exact mirror of `serializeError()` below — the two must be read
 * together.
 */
const {
  NotFoundError,
  ValidationError,
  ConflictError,
  PermissionError,
} = require('../../../backend/src/core/errors');
const { createRateLimiter } = require('../../../backend/src/core/rateLimiter');
const session = require('./session');
const { getBackendModules } = require('./backendModules');

/**
 * @param {unknown} err
 * @returns {{ __idpError: true, kind: string, message: string, details?: unknown }}
 */
function serializeError(err) {
  if (err instanceof NotFoundError) {
    return { __idpError: true, kind: 'NotFoundError', message: err.message };
  }
  if (err instanceof ValidationError) {
    return {
      __idpError: true,
      kind: 'ValidationError',
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    };
  }
  if (err instanceof ConflictError) {
    return { __idpError: true, kind: 'ConflictError', message: err.message };
  }
  if (err instanceof PermissionError) {
    return { __idpError: true, kind: 'PermissionError', message: err.message };
  }
  const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
  return { __idpError: true, kind: 'Error', message };
}

/**
 * A userStore error (see `backend/src/auth/userStore.js` — `addUser` /
 * `updateUserRole` / etc. throw a plain `Error` with a stable `.code`
 * rather than one of `core/errors.js`'s typed classes) is mapped onto the
 * closest matching `core/errors.js` kind so the renderer's error handling
 * doesn't need a second, IPC-only error taxonomy.
 */
function normalizeUserStoreError(err) {
  switch (err && err.code) {
    case 'USERNAME_TAKEN':
    case 'LAST_ADMIN':
      return new ConflictError(err.message);
    case 'NOT_FOUND':
      return new NotFoundError(err.message);
    case 'INVALID_USERNAME':
    case 'INVALID_PASSWORD':
    case 'INVALID_ROLE':
      return new ValidationError(err.message);
    default:
      return err;
  }
}

/** Sentinel: the channel requires a logged-in user, but no specific action permission (mirrors HTTP's bare `requireAuth`, e.g. `/api/pmp/test-connection`). */
const AUTHENTICATED_ONLY = 'authenticated';

/**
 * Depth-in-defense rate limiting for IPC channels (T-91b).
 *
 * The renderer is our own code, not untrusted network traffic — the HTTP
 * threat model (an anonymous attacker hammering a public endpoint) doesn't
 * apply the same way here. But the point isn't stopping an attacker who
 * already controls the renderer; it's making sure the desktop build doesn't
 * silently drop a protection the web build has, e.g. so a compromised /
 * buggy renderer, or a runaway retry loop, can't hammer login or deploy
 * exactly like it could if this gate didn't exist. See
 * `backend/src/middleware/rateLimit.js` for the HTTP twin — same core
 * (`backend/src/core/rateLimiter.js`), same windows/limits for the two
 * channels below.
 *
 * This is a single-window, single-operator app (see `desktop/main/ipc/
 * session.js`'s doc comment) — there is no per-caller identity to key
 * bucketed limits by the way HTTP keys by `req.ip`, so each limited channel
 * gets exactly one bucket, keyed by a fixed string. That's the IPC
 * equivalent of "per operator" rate limiting: one human, one process, one
 * counter.
 *
 * @param {{ windowMs: number, max: number }} rateLimitOptions
 * @returns {{ check: () => { allowed: boolean, retryAfterMs: number } }}
 */
function createIpcRateLimit({ windowMs, max }) {
  const limiter = createRateLimiter({ windowMs, max });
  const SINGLE_BUCKET_KEY = 'ipc';
  return { check: () => limiter.check(SINGLE_BUCKET_KEY) };
}

/**
 * Wraps an IPC handler with:
 *   1. an identity/permission check — throws an "unauthenticated" error or
 *      `PermissionError` before the handler body ever runs, exactly
 *      mirroring `requireAuth`/`requirePermission(action)` middleware;
 *   2. an optional rate-limit check (T-91b) — mirrors the order used on
 *      the HTTP side for the equivalent route (e.g. `/api/deploy/trigger`
 *      checks permission, THEN rate limit; `/api/auth/login` has no
 *      permission gate, so rate limit is the only check);
 *   3. error serialization on the way out.
 *
 * @param {string | null} requireAction - one of:
 *   - `null`: no auth gate at all (login itself, and `me()`);
 *   - `AUTHENTICATED_ONLY` ('authenticated'): must be logged in, any role
 *     (mirrors bare `requireAuth`, e.g. PMP test-connection);
 *   - an `Action` from `backend/src/auth/permissions.js` (e.g.
 *     `'project:read'`): must be logged in AND hold that permission
 *     (mirrors `requirePermission(action)`).
 * @param {(event: import('electron').IpcMainInvokeEvent, ...args: unknown[]) => unknown} handler
 * @param {{ rateLimit?: { windowMs: number, max: number } }} [options] -
 *   `rateLimit`, when given, creates one rate limiter for this channel
 *   (shared across every call — NOT re-created per invocation) mirroring
 *   the equivalent HTTP route's `createRateLimit({ windowMs, max })`.
 */
function ipcHandler(requireAction, handler, options = {}) {
  const { rateLimit } = options;
  const ipcRateLimit = rateLimit ? createIpcRateLimit(rateLimit) : null;

  return async (event, ...args) => {
    try {
      if (requireAction) {
        const role = session.getCurrentRole();
        if (!role) {
          throw new Error('Unauthorized: not logged in.');
        }
        if (requireAction !== AUTHENTICATED_ONLY) {
          const { permissions } = getBackendModules();
          if (!permissions.can(role, requireAction)) {
            throw new PermissionError(
              `Bu işlem için yetkiniz yok ('${requireAction}' izni gerekir). Mevcut rolünüz: ${role}.`
            );
          }
        }
      }
      if (ipcRateLimit) {
        const { allowed, retryAfterMs } = ipcRateLimit.check();
        if (!allowed) {
          const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
          throw new ConflictError(
            `Too many attempts. Try again in ${retryAfterSec}s.`
          );
        }
      }
      return await handler(event, ...args);
    } catch (err) {
      throw new Error(JSON.stringify(serializeError(normalizeUserStoreError(err))));
    }
  };
}

module.exports = { ipcHandler, serializeError, normalizeUserStoreError, AUTHENTICATED_ONLY };
