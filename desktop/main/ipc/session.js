'use strict';

/**
 * Desktop "session" (T-91).
 *
 * There is no HTTP request/cookie in the IPC world, so there is nowhere for
 * `express-session` to live. The Electron main process plays that role
 * instead: it holds the single currently-authenticated user in memory for
 * the lifetime of the process (this is a single-window, single-operator
 * desktop tool — there is exactly one "session" to track, matching what
 * `req.session.user` meant in the HTTP shell).
 *
 * `login()`/`logout()`/`getCurrentUser()` below are the direct IPC
 * equivalents of `POST /api/auth/login` / `POST /api/auth/logout` /
 * `GET /api/auth/me` in `backend/src/server.js` — same `userStore.verify()`
 * call, same "unknown username and wrong password are indistinguishable"
 * behavior (T-11 / SEC-04), same audit log entries.
 */
const { getBackendModules } = require('./backendModules');

/** @type {{ id: string, username: string, role: string } | null} */
let currentUser = null;

/**
 * @param {string} username
 * @param {string} password
 * @returns {{ username: string, role: string }}
 * @throws {Error} 'Invalid credentials' on any failed login (never reveals
 *   whether the username exists — mirrors server.js's /api/auth/login).
 */
function login(username, password) {
  const { userStore, auditLogger } = getBackendModules();
  const user = userStore.verify(username, password);
  if (!user) {
    auditLogger.log(username, 'LOGIN_FAILED', 'Failed login attempt', { ip: null });
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  currentUser = user;
  auditLogger.log(user.username, 'LOGIN', 'User logged in successfully');
  return { username: user.username, role: user.role };
}

function logout() {
  const { auditLogger } = getBackendModules();
  if (currentUser) {
    auditLogger.log(currentUser.username, 'LOGOUT', 'User logged out');
  }
  currentUser = null;
}

/** @returns {{ username: string, role: string } | null} */
function getCurrentUser() {
  if (!currentUser) return null;
  return { username: currentUser.username, role: currentUser.role };
}

/** @returns {string} the actor string every core service call needs for audit logging. */
function getCurrentActor() {
  return currentUser ? currentUser.username : 'System';
}

/** @returns {string | null} the current user's role, or null if nobody is logged in. */
function getCurrentRole() {
  return currentUser ? currentUser.role : null;
}

module.exports = { login, logout, getCurrentUser, getCurrentActor, getCurrentRole };
