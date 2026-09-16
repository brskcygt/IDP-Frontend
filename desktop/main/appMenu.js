'use strict';

/**
 * Application menu.
 *
 * Exists because the desktop app has things an operator needs to find — where
 * its settings file is, which URL to point a phone at — and stdout is not a
 * place they can look. An app launched from Finder has no console, so anything
 * that only gets logged is, for practical purposes, not communicated at all.
 */

const path = require('path');
const { app, Menu, dialog, shell } = require('electron');

/**
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow | null} deps.getMainWindow
 * @param {{ serverUrl: string, checkConnection: () => Promise<{ ok: boolean, detail: string }> } | null} [deps.remote]
 *   Set in remote mode (IDP_SERVER_URL); adds the server address and a
 *   connection test to the Tools menu.
 */
function buildAppMenu({ getMainWindow, remote = null }) {
  const dataDir = app.getPath('userData');
  const configPath = path.join(dataDir, 'idp.env');

  const showRemoteConnection = async () => {
    const result = await remote.checkConnection();
    const parent = getMainWindow();
    dialog.showMessageBoxSync(parent || undefined, {
      type: result.ok ? 'info' : 'warning',
      title: 'IDP sunucu bağlantısı',
      message: result.ok ? 'Sunucu erişilebilir' : 'Sunucuya ulaşılamıyor',
      detail:
        `Sunucu: ${remote.serverUrl}\n\n${result.detail}\n\n` +
        `Adres ayar dosyasındaki IDP_SERVER_URL satırından gelir:\n${configPath}`,
      buttons: ['Kapat'],
      noLink: true,
    });
  };

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Araçlar',
      submenu: [
        ...(remote
          ? [
              { label: `Uzak sunucu: ${remote.serverUrl}`, enabled: false },
              { label: 'Sunucu bağlantısını test et…', click: () => { showRemoteConnection(); } },
              { type: 'separator' },
            ]
          : []),
        { label: 'Ayar dosyasını aç', click: () => shell.openPath(configPath) },
        { label: 'Veri klasörünü göster', click: () => shell.openPath(dataDir) },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
