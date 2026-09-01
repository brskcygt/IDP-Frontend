'use strict';

const { app, ipcMain } = require('electron');
const updater = require('../updater');

function registerUpdateHandlers() {
  ipcMain.handle('idp:update:getState', () => updater.getUpdateState());
  ipcMain.handle('idp:update:getVersion', () => app.getVersion());
  ipcMain.handle('idp:update:install', () => updater.installAvailableUpdate());
  ipcMain.handle('idp:update:dismiss', () => updater.dismissAvailableUpdate());
}

module.exports = { registerUpdateHandlers };
