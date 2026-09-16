'use strict';

/**
 * Preload for the server-address setup window only. It exposes three
 * one-way calls and nothing else — the setup page runs before any server is
 * known, so it must not be able to reach the app's real IPC surface.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('idpSetup', {
  context: () => ipcRenderer.invoke('idp:setup:context'),
  test: (url) => ipcRenderer.invoke('idp:setup:test', url),
  save: (url) => ipcRenderer.invoke('idp:setup:save', url),
});
