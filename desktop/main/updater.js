'use strict';

/** Signed one-click updater for the small internal unsigned macOS release. */
const { app, net } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const https = require('https');
const { spawn, spawnSync } = require('child_process');

const MANIFEST_URL = process.env.IDP_UPDATE_MANIFEST_URL ||
  'https://pub-e7acdfc88c144c308e92729d98a62fd5.r2.dev/latest.json';
const PUBLIC_KEY_PATH = path.join(__dirname, '..', 'build', 'update-public-key.pem');
let initialized = false;
let mainWindow = null;
let availableManifest = null;
let updateState = { status: 'idle' };

function emitState(nextState) {
  updateState = nextState;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('idp:update:state', updateState);
  }
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function requireHttps(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  return parsed.toString();
}

async function fetchSignedManifest() {
  requireHttps(MANIFEST_URL, 'Update manifest URL');
  const response = await net.fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifest request returned HTTP ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > 64 * 1024) throw new Error('Update manifest is unexpectedly large');
  const envelope = JSON.parse(raw.toString('utf8'));
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
    throw new Error('Update manifest signature envelope is invalid');
  }
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signature, 'base64');
  const publicKey = await fsp.readFile(PUBLIC_KEY_PATH);
  if (!crypto.verify(null, payload, publicKey, signature)) {
    throw new Error('Update manifest signature verification failed');
  }
  const manifest = JSON.parse(payload.toString('utf8'));
  const platformKey = `${process.platform}-${process.arch}`;
  const artifact = manifest.platforms && manifest.platforms[platformKey];
  if (!parseVersion(manifest.version) || !artifact) throw new Error(`No release for ${platformKey}`);
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || '')) throw new Error('Artifact SHA-256 is invalid');
  return { ...manifest, artifact: { ...artifact, url: requireHttps(artifact.url, 'Update artifact URL') } };
}

function downloadAndHash(url, destination, onProgress, redirects = 0) {
  if (redirects > 3) return Promise.reject(new Error('Too many update download redirects'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const next = requireHttps(new URL(response.headers.location, url).toString(), 'Update redirect URL');
        resolve(downloadAndHash(next, destination, onProgress, redirects + 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Update download returned HTTP ${response.statusCode}`));
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      let received = 0;
      const hash = crypto.createHash('sha256');
      const output = fs.createWriteStream(destination, { mode: 0o600 });
      response.on('data', (chunk) => {
        received += chunk.length;
        hash.update(chunk);
        if (total > 0) onProgress(received / total);
      });
      response.once('error', reject);
      output.once('error', reject);
      output.once('finish', () => resolve(hash.digest('hex')));
      response.pipe(output);
    });
    request.setTimeout(120000, () => request.destroy(new Error('Update download timed out')));
    request.once('error', reject);
  });
}

async function prepareAndInstall(win, manifest) {
  const updateRoot = path.join(app.getPath('userData'), 'updates', manifest.version);
  const zipPath = path.join(updateRoot, 'IDP-update.zip');
  const extractPath = path.join(updateRoot, 'extracted');
  await fsp.rm(updateRoot, { recursive: true, force: true });
  await fsp.mkdir(extractPath, { recursive: true, mode: 0o700 });
  emitState({ status: 'downloading', version: manifest.version, notes: manifest.notes || '', progress: 0 });
  win.setProgressBar(0);
  try {
    const digest = await downloadAndHash(manifest.artifact.url, zipPath, (value) => {
      win.setProgressBar(value);
      emitState({ status: 'downloading', version: manifest.version, notes: manifest.notes || '', progress: value });
    });
    if (digest.toLowerCase() !== manifest.artifact.sha256.toLowerCase()) {
      throw new Error('Downloaded update SHA-256 does not match the signed manifest');
    }
    const extract = spawnSync('/usr/bin/ditto', ['-x', '-k', zipPath, extractPath], { encoding: 'utf8' });
    if (extract.status !== 0) throw new Error(`Update archive could not be extracted: ${extract.stderr || extract.stdout}`);
    const stagedApp = path.join(extractPath, 'IDP.app');
    if (!fs.existsSync(path.join(stagedApp, 'Contents', 'MacOS', 'IDP'))) {
      throw new Error('Update archive does not contain IDP.app');
    }
    const plist = spawnSync('/usr/bin/defaults', ['read', path.join(stagedApp, 'Contents', 'Info'), 'CFBundleShortVersionString'], { encoding: 'utf8' });
    if (plist.status !== 0 || plist.stdout.trim() !== manifest.version) {
      throw new Error('Update bundle version does not match the signed manifest');
    }
    emitState({ status: 'installing', version: manifest.version, notes: manifest.notes || '', progress: 1 });
    const installerCopy = path.join(updateRoot, 'updateInstaller.js');
    await fsp.copyFile(path.join(__dirname, 'updateInstaller.js'), installerCopy);
    const currentApp = path.resolve(path.dirname(process.execPath), '..', '..');
    spawn(process.execPath, [installerCopy, String(process.pid), currentApp, stagedApp], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).unref();
    app.quit();
  } finally {
    if (!win.isDestroyed()) win.setProgressBar(-1);
  }
}

async function checkForUnsignedUpdate() {
  const manifest = await fetchSignedManifest();
  if (!isNewerVersion(manifest.version, app.getVersion())) return;
  availableManifest = manifest;
  emitState({
    status: 'available',
    version: manifest.version,
    currentVersion: app.getVersion(),
    notes: String(manifest.notes || '').trim().slice(0, 1500),
  });
}

function initAutoUpdater(win) {
  if (initialized || !app.isPackaged || process.platform !== 'darwin') return;
  initialized = true;
  mainWindow = win;
  checkForUnsignedUpdate().catch((err) => {
    console.warn('[updater] Güncelleme kontrolü/kurulumu başarısız (uygulama çalışmaya devam ediyor):', err.message);
  });
}

function getUpdateState() {
  return updateState;
}

async function installAvailableUpdate() {
  if (!availableManifest || !mainWindow || mainWindow.isDestroyed()) {
    throw new Error('No verified update is ready to install');
  }
  try {
    await prepareAndInstall(mainWindow, availableManifest);
  } catch (err) {
    emitState({ status: 'error', version: availableManifest.version, message: err.message });
    throw err;
  }
}

function dismissAvailableUpdate() {
  if (updateState.status === 'available') emitState({ status: 'idle' });
}

module.exports = {
  initAutoUpdater,
  isNewerVersion,
  fetchSignedManifest,
  getUpdateState,
  installAvailableUpdate,
  dismissAvailableUpdate,
};
