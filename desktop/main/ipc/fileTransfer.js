'use strict';

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { ipcHandler } = require('./helpers');
const { getBackendModules } = require('./backendModules');

function isBenignDisconnectError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === 'ECONNRESET' || code === 'EPIPE' || /read ECONNRESET|write EPIPE/i.test(message);
}

function validateConnection(input) {
  if (!input || typeof input !== 'object') throw new Error('Bağlantı bilgileri geçersiz.');
  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  const remotePath = String(input.remotePath || '').trim().replace(/\\/g, '/');
  const localPath = String(input.localPath || '').trim();
  const port = Number(input.port || 22);
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new Error('Geçerli bir SSH sunucu adı veya IP adresi girin.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH portu 1-65535 arasında olmalıdır.');
  if (!username || username.length > 128) throw new Error('SSH kullanıcı adı zorunludur.');
  if (!password) throw new Error('SSH parolası zorunludur.');
  if (!localPath || !fs.statSync(localPath, { throwIfNoEntry: false })?.isFile()) throw new Error('Aktarılacak yerel dosya bulunamadı.');
  if (!remotePath || remotePath.includes('\0') || remotePath.includes('..')) throw new Error('Geçerli bir uzak hedef dosya yolu girin.');
  return { host, port, username, password, remotePath, localPath };
}

function registerFileTransferHandlers() {
  ipcMain.handle('idp:fileTransfer:selectFile', ipcHandler('project:write', async () => {
    const result = await dialog.showOpenDialog({ title: 'Sunucuya gönderilecek dosyayı seç', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const stats = await fs.promises.stat(filePath);
    return { canceled: false, filePath, name: path.basename(filePath), size: stats.size };
  }));

  ipcMain.handle('idp:fileTransfer:upload', ipcHandler('project:write', async (_event, rawInput) => {
    const input = validateConnection(rawInput);
    const { NodeSSH, createHostVerifier } = getBackendModules();
    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        readyTimeout: 15000,
        tryKeyboard: true,
        onKeyboardInteractive: (_name, _instructions, _lang, prompts, finish) => finish(prompts.map(() => input.password)),
        hostVerifier: createHostVerifier({ host: input.host, port: input.port, policy: 'tofu' }),
      });
      // node-ssh removes its temporary `error` listener once `ready` fires.
      // Windows OpenSSH can reset the TCP socket after a completed SFTP
      // session; without a persistent listener EventEmitter escalates that
      // harmless close into an uncaught exception in Electron's main process.
      ssh.connection?.on('error', (error) => {
        if (!isBenignDisconnectError(error)) console.warn('[file-transfer] SSH connection error:', error);
      });
      await ssh.putFile(input.localPath, input.remotePath);
      const stats = await fs.promises.stat(input.localPath);
      return { ok: true, remotePath: input.remotePath, bytes: stats.size };
    } catch (error) {
      const message = String(error?.message || error);
      if (/authentication|all configured authentication/i.test(message)) throw new Error('SSH kimlik doğrulaması başarısız. Kullanıcı adı ve parolayı kontrol edin.');
      if (/ECONNREFUSED/i.test(message)) throw new Error(`SSH bağlantısı ${input.host}:${input.port} tarafından reddedildi.`);
      throw new Error(`Dosya aktarılamadı: ${message}`);
    } finally {
      ssh.dispose();
    }
  }));
}

module.exports = { registerFileTransferHandlers, validateConnection, isBenignDisconnectError };
