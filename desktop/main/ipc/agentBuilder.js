'use strict';

const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { buildAgentJar } = require('../agentBuilder');

function registerAgentBuilderHandlers() {
  ipcMain.handle('idp:agentBuilder:build', ipcHandler('project:write', async (_event, input) => buildAgentJar(input)));
}

module.exports = { registerAgentBuilderHandlers };
