'use strict';

const { ipcMain } = require('electron');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');

const RUNNER_ADMIN_KEY_REF = 'system.cloudflareRunner.adminApiKey';
const DEFAULT_API_URL = 'https://idp-runner-api.bariskoc-249.workers.dev';

async function runnerAdminRequest(path, options = {}) {
  const { secretStore } = getBackendModules();
  const adminKey = secretStore ? await secretStore.get(RUNNER_ADMIN_KEY_REF) : null;
  if (!adminKey) throw new Error('Cloudflare runner administrator credential is not configured in secure storage.');
  const apiBaseUrl = String(process.env.IDP_RUNNER_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${adminKey}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Runner API ${response.status}: ${body.message || body.error || 'request failed'}`);
  return body;
}

async function runnerPublicRequest(path) {
  const apiBaseUrl = String(process.env.IDP_RUNNER_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const response = await fetch(`${apiBaseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Runner API ${response.status}: ${body.message || body.error || 'request failed'}`);
  return body;
}

function registerRunnerHandlers() {
  ipcMain.handle(
    'idp:runners:list',
    ipcHandler('project:read', async () => {
      const body = await runnerAdminRequest('/v1/admin/agents');
      return Array.isArray(body.agents) ? body.agents : [];
    })
  );

  ipcMain.handle(
    'idp:runners:createEnrollment',
    ipcHandler('project:write', async (_event, agentName) => {
      if (typeof agentName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(agentName)) {
        throw new Error('Runner name must be 3-64 letters, numbers, dots, underscores, or hyphens.');
      }
      return runnerAdminRequest('/v1/admin/enrollment-tokens', {
        method: 'POST',
        body: JSON.stringify({ agentName }),
      });
    })
  );

  ipcMain.handle('idp:runners:approveBootstrap', ipcHandler('project:write', async (_event, userCode) => {
    const normalized = String(userCode || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(normalized)) throw new Error('Bootstrap code must be 8 characters.');
    return runnerAdminRequest('/v1/admin/bootstrap-sessions/approve', { method: 'POST', body: JSON.stringify({ userCode: normalized }) });
  }));

  ipcMain.handle(
    'idp:runners:retire',
    ipcHandler('project:write', async (_event, agentId) => {
      if (typeof agentId !== 'string' || !/^[a-f0-9-]{36}$/i.test(agentId)) {
        throw new Error('A valid runner agent ID is required.');
      }
      await runnerAdminRequest(`/v1/admin/agents/${agentId}/retire`, { method: 'POST' });
    })
  );

  ipcMain.handle('idp:runners:getRelease', ipcHandler('project:read', async () => {
    try { return await runnerPublicRequest('/v1/releases/current'); }
    catch (error) { if (String(error.message).includes('404')) return null; throw error; }
  }));

  ipcMain.handle('idp:runners:listReleases', ipcHandler('project:read', async () => {
    const body = await runnerAdminRequest('/v1/admin/releases');
    return Array.isArray(body.releases) ? body.releases : [];
  }));

  ipcMain.handle('idp:runners:activateRelease', ipcHandler('project:write', async (_event, releaseId) => {
    if (!/^[0-9]{8}-[0-9]{6}$/.test(String(releaseId || ''))) throw new Error('A valid runner release ID is required.');
    await runnerAdminRequest(`/v1/admin/releases/${releaseId}/activate`, { method: 'POST' });
  }));

  ipcMain.handle('idp:runners:createReleaseUploadToken', ipcHandler('project:write', async () => {
    return runnerAdminRequest('/v1/admin/release-upload-tokens', { method: 'POST' });
  }));
}

module.exports = { registerRunnerHandlers };
