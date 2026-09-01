'use strict';

const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');

function registerAgentHandlers() {
  ipcMain.handle('idp:agents:list', ipcHandler('project:read', async () => {
    const { AgentGatewayClient } = getBackendModules();
    return new AgentGatewayClient().listAgents();
  }));
}

module.exports = { registerAgentHandlers };
