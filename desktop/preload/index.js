'use strict';

/**
 * Preload script — the ONLY bridge between the sandboxed renderer and
 * Node/Electron APIs (docs/03-ELECTRON-MIMARI.md §9).
 *
 * T-91: replaces T-90's two-method `window.idp` (`getApiBaseUrl`/
 * `getVersion`, backing an embedded HTTP server that no longer exists) with
 * the full IPC business-logic bridge — one whitelisted method per
 * `Transport` operation (see `frontend/src/services/transport/types.ts`),
 * each calling exactly one fixed `ipcMain.handle` channel (see
 * `main/ipc/*.js`) with exactly the arguments it's given.
 *
 * `ipcRenderer` itself is NEVER exposed. Every channel name is a literal
 * string baked into this file — the renderer cannot construct or pass an
 * arbitrary channel name; it can only call one of the fixed methods below,
 * each of which invokes exactly one hardcoded channel.
 *
 * `deploy.onLogEvent` is the one non-request/response method: it wraps
 * `ipcRenderer.on(...)` for the live log stream (`main/ipc/deployLogBridge.js`
 * pushes events here) and hands back an unsubscribe function instead of
 * exposing `ipcRenderer.on`/`removeListener` directly — the renderer can
 * register listeners, but can never touch the raw `ipcRenderer` object.
 *
 * Remote mode (`IDP_SERVER_URL`, see `main/remoteBackend.js`): the main
 * process passes `--idp-remote-mode` via `webPreferences.additionalArguments`.
 * Business calls then go over HTTP to `app://idp/api/*`, so the bridge only
 * carries the desktop-only features (`agentBuilder`, `update`) plus
 * `mode: 'remote'`, which `getTransport()` keys off. The business channels
 * are not even registered in the main process in that mode.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Literal duplicate of REMOTE_MODE_ARG in main/index.js — a sandboxed preload
// cannot require main-process modules.
const isRemoteMode = process.argv.includes('--idp-remote-mode');

/** @param {string} channel @param {...unknown} args */
function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const agentBuilder = {
  build: (input) => invoke('idp:agentBuilder:build', input),
};

const update = {
  getVersion: () => invoke('idp:update:getVersion'),
  getState: () => invoke('idp:update:getState'),
  install: () => invoke('idp:update:install'),
  dismiss: () => invoke('idp:update:dismiss'),
  onState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('idp:update:state', listener);
    return () => ipcRenderer.removeListener('idp:update:state', listener);
  },
};

if (isRemoteMode) {
  contextBridge.exposeInMainWorld('idp', {
    mode: 'remote',
    agentBuilder,
    update,
  });
} else {
  contextBridge.exposeInMainWorld('idp', {
    mode: 'local',

    auth: {
      login: (username, password) => invoke('idp:auth:login', username, password),
      logout: () => invoke('idp:auth:logout'),
      me: () => invoke('idp:auth:me'),
    },

    projects: {
      list: () => invoke('idp:projects:list'),
      get: (id) => invoke('idp:projects:get', id),
      create: (input) => invoke('idp:projects:create', input),
      updateConfig: (id, config) => invoke('idp:projects:updateConfig', id, config),
      remove: (id) => invoke('idp:projects:remove', id),
      environments: (id) => invoke('idp:projects:environments', id),
      telemetry: (id) => invoke('idp:projects:telemetry', id),
      testConnection: (id, environment) => invoke('idp:projects:testConnection', id, environment),
    },

    deploy: {
      trigger: (projectId, parameters) => invoke('idp:deploy:trigger', projectId, parameters),
      abort: (deploymentId) => invoke('idp:deploy:abort', deploymentId),
      sessions: () => invoke('idp:deploy:sessions'),
      history: (projectId, limit) => invoke('idp:deploy:history', projectId, limit),
      logsArchive: (deploymentId) => invoke('idp:deploy:logsArchive', deploymentId),
      /**
       * Starts (or resumes) a live log subscription. `subscriptionId` is
       * minted by the caller (renderer side — see ipcTransport.ts) so it can
       * register its event listener BEFORE this async call resolves, without
       * any risk of missing the first replayed line.
       */
      subscribeLogs: (deploymentId, subscriptionId, fromIndex) =>
        invoke('idp:deploy:subscribeLogs', deploymentId, subscriptionId, fromIndex),
      unsubscribeLogs: (subscriptionId) => invoke('idp:deploy:unsubscribeLogs', subscriptionId),
      /**
       * Subscribes to every deploy-log event from the main process (all
       * active subscriptions share this one channel; the payload's
       * `subscriptionId` is how the caller demultiplexes). Returns an
       * unsubscribe function — `ipcRenderer` itself is never exposed, only
       * this wrapped listener registration.
       * @param {(payload: object) => void} callback
       * @returns {() => void}
       */
      onLogEvent: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('idp:deploy:log-event', listener);
        return () => ipcRenderer.removeListener('idp:deploy:log-event', listener);
      },
    },

    hostKeys: {
      list: () => invoke('idp:hostKeys:list'),
      forget: (host, port) => invoke('idp:hostKeys:forget', host, port),
    },

    users: {
      list: () => invoke('idp:users:list'),
      create: (input) => invoke('idp:users:create', input),
      update: (id, patch) => invoke('idp:users:update', id, patch),
      remove: (id) => invoke('idp:users:remove', id),
    },

    audit: {
      list: (limit) => invoke('idp:audit:list', limit),
    },

    agentBuilder,

    agents: {
      list: () => invoke('idp:agents:list'),
    },

    fileTransfer: {
      selectFile: () => invoke('idp:fileTransfer:selectFile'),
      upload: (input) => invoke('idp:fileTransfer:upload', input),
    },

    pmp: {
      testConnection: (config) => invoke('idp:pmp:testConnection', config),
    },

    update,
  });
}
