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
const { app, Menu, dialog, shell, clipboard } = require('electron');

/**
 * @param {object} deps
 * @param {() => {port: number, urls: string[]} | null} deps.getWebhookInfo
 * @param {() => import('electron').BrowserWindow | null} deps.getMainWindow
 */
function buildAppMenu({ getWebhookInfo, getMainWindow }) {
  const dataDir = app.getPath('userData');
  const configPath = path.join(dataDir, 'idp.env');

  const showWebhookAddress = () => {
    const info = getWebhookInfo();
    const parent = getMainWindow();

    if (!info) {
      dialog.showMessageBoxSync(parent || undefined, {
        type: 'info',
        title: 'OTP yönlendirme',
        message: 'Otomatik OTP yakalama kapalı',
        detail:
          'Açmak için ayar dosyasına uzun ve rastgele bir anahtar yazın:\n\n' +
          `${configPath}\n\n` +
          'MFA_WEBHOOK_API_KEY=<değer>\n\n' +
          'Sonra uygulamayı yeniden başlatın. Anahtar tanımlı değilken hiçbir ' +
          'port açılmaz.',
        buttons: ['Ayar dosyasını aç', 'Kapat'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }) === 0 && shell.openPath(configPath);
      return;
    }

    // Several addresses show up on a machine with VPN or virtual interfaces.
    // The phone can only reach the one on the same Wi-Fi network, so list them
    // all rather than guessing wrong.
    const list = (info.interfaces || []).length
      ? info.interfaces.map((i) => `  ${i.address}  (${i.iface})`).join('\n')
      : info.urls.map((u) => `  ${u}`).join('\n');

    const body =
      'Telefonunuzu bu adrese yönlendirin:\n\n' +
      `  ${info.urls[0] || '(ağ adresi bulunamadı)'}\n\n` +
      (info.urls.length > 1
        ? `Birden fazla ağ arayüzü var:\n${list}\n\n`
        : '') +
      'ÖNCE TEST EDİN: bu adresi telefonun tarayıcısında açın. ' +
      '"ok: true" görüyorsanız ağ yolu çalışıyor.\n\n' +
      'API anahtarı — üçünden biri yeterli:\n' +
      '  • JSON gövdesine:  "apiKey": "<anahtar>"\n' +
      '  • Başlık olarak:   X-API-Key: <anahtar>\n' +
      '  • Başlık olarak:   Authorization: Bearer <anahtar>\n\n' +
      'Mesaj alanı "text" veya "message" olabilir. sessionId gerekmez.\n\n' +
      'Anahtarı aşağıdaki düğmeyle kopyalayıp telefona yapıştırın — ' +
      'elle yazmayın.';

    const choice = dialog.showMessageBoxSync(parent || undefined, {
      type: 'info',
      title: 'OTP yönlendirme adresi',
      message: `Dinleniyor — port ${info.port}`,
      detail: body,
      buttons: ['Anahtarı kopyala', 'Adresi kopyala', 'Kapat'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    // The key has to reach the phone somehow. Making the operator hunt for it
    // in a config file is how it ended up being typed as the placeholder text
    // from an instruction message instead of the real value.
    if (choice === 0) clipboard.writeText(process.env.MFA_WEBHOOK_API_KEY || '');
    if (choice === 1 && info.urls.length) clipboard.writeText(info.urls[0]);
  };

  const showRecentAttempts = () => {
    const parent = getMainWindow();
    let attempts = [];
    try {
      attempts = require('./webhook/otpWebhookServer').getRecentAttempts();
    } catch { /* listener never started */ }

    const detail = attempts.length
      ? attempts
          .map((a) => {
            const time = new Date(a.at).toLocaleTimeString();
            const mark = a.outcome === 'accepted' ? '✓' : a.outcome === 'ignored' ? '–' : '✗';
            return `${mark}  ${time}  ${a.detail}`;
          })
          .join('\n')
      : 'Hiç istek gelmedi.\n\n' +
        'Telefonunuzdaki yönlendirici hiçbir şey göndermemiş demektir. ' +
        'Gönderici filtresini (SOLEN-BT gibi) ve adresi kontrol edin — ' +
        'adresi telefonun tarayıcısında açıp "ok: true" gördüğünüzden emin olun.';

    dialog.showMessageBoxSync(parent || undefined, {
      type: 'info',
      title: 'Son OTP istekleri',
      message: attempts.length ? `Son ${attempts.length} istek` : 'Henüz istek yok',
      detail,
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
        { label: 'OTP yönlendirme adresi…', click: showWebhookAddress },
        { label: 'Son OTP istekleri…', click: showRecentAttempts },
        { type: 'separator' },
        { label: 'Ayar dosyasını aç', click: () => shell.openPath(configPath) },
        { label: 'Veri klasörünü göster', click: () => shell.openPath(dataDir) },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
