'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const version = packageJson.version;
const arch = process.arch;
const publicBaseUrl = String(process.env.IDP_RELEASE_BASE_URL ||
  'https://pub-e7acdfc88c144c308e92729d98a62fd5.r2.dev').replace(/\/$/, '');
const privateKeyPath = process.env.IDP_RELEASE_PRIVATE_KEY ||
  path.join(os.homedir(), 'Library', 'Application Support', 'IDP Release Keys', 'release-private.pem');
const distDir = path.join(desktopRoot, 'dist');
const releaseDir = path.join(distDir, 'release');

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`);
if (!fs.existsSync(privateKeyPath)) throw new Error(`Release private key not found: ${privateKeyPath}`);

const candidates = fs.readdirSync(distDir)
  .filter((name) => name.endsWith('.zip') && !name.startsWith('IDP-update-'))
  .map((name) => ({ name, mtime: fs.statSync(path.join(distDir, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!candidates.length) throw new Error('No macOS ZIP artifact found in desktop/dist');

fs.mkdirSync(releaseDir, { recursive: true, mode: 0o700 });
const artifactName = `IDP-${version}-darwin-${arch}.zip`;
const artifactPath = path.join(releaseDir, artifactName);
fs.copyFileSync(path.join(distDir, candidates[0].name), artifactPath);
const bytes = fs.readFileSync(artifactPath);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const notes = String(process.env.IDP_RELEASE_NOTES || `IDP ${version}`).trim();
const payloadObject = {
  version,
  publishedAt: new Date().toISOString(),
  notes,
  platforms: {
    [`darwin-${arch}`]: {
      url: `${publicBaseUrl}/${artifactName}`,
      sha256,
      size: bytes.length,
    },
  },
};
const payload = Buffer.from(JSON.stringify(payloadObject));
const privateKey = fs.readFileSync(privateKeyPath);
const signature = crypto.sign(null, payload, privateKey);
const envelope = {
  payload: payload.toString('base64'),
  signature: signature.toString('base64'),
};
fs.writeFileSync(path.join(releaseDir, 'latest.json'), `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o644 });
fs.writeFileSync(path.join(releaseDir, 'release-info.json'), `${JSON.stringify(payloadObject, null, 2)}\n`, { mode: 0o644 });

console.log(`Release ${version} prepared:`);
console.log(`  ${artifactPath}`);
console.log(`  ${path.join(releaseDir, 'latest.json')}`);
console.log(`  SHA-256: ${sha256}`);
