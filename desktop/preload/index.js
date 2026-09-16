'use strict';

/**
 * Preload script — the ONLY bridge between the sandboxed renderer and
 * Node/Electron APIs (docs/03-ELECTRON-MIMARI.md §9).
 *
 * Business calls do NOT go through here: the app always talks to a remote IDP
 * server, and the renderer reaches it over HTTP at `app://idp/api/*` (see
 * `main/remoteBackend.js`). What this bridge carries is only the two
 * desktop-only features — the agent JAR builder and the updater — plus
 * `mode: 'remote'`, which `getTransport()` keys off.
 *
 * `ipcRenderer` itself is NEVER exposed. Every channel name is a literal
 * string baked into this file — the renderer cannot construct or pass an
 * arbitrary channel name; it can only call one of the fixed methods below,
 * each of which invokes exactly one hardcoded channel.
 *
 * The main process passes `--idp-remote-mode` via
 * `webPreferences.additionalArguments`.
 */

const { contextBridge, ipcRenderer } = require('electron');

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

contextBridge.exposeInMainWorld('idp', {
  mode: 'remote',
  agentBuilder,
  update,
});
