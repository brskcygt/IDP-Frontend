'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const [, , parentPidRaw, currentApp, stagedApp] = process.argv;
const parentPid = Number(parentPidRaw);
const backupApp = `${currentApp}.idp-update-backup`;

function waitForParent() {
  for (let i = 0; i < 120; i++) {
    try { process.kill(parentPid, 0); } catch { return; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('IDP did not quit in time');
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isUpdatedAppRunning() {
  const executable = path.join(currentApp, 'Contents', 'MacOS', path.basename(currentApp, '.app'));
  const result = spawnSync('/usr/bin/pgrep', ['-f', executable], { encoding: 'utf8' });
  if (result.status !== 0) return false;
  return result.stdout
    .split(/\s+/)
    .map(Number)
    .some(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function waitForUpdatedApp(milliseconds) {
  const attempts = Math.ceil(milliseconds / 250);
  for (let i = 0; i < attempts; i++) {
    if (isUpdatedAppRunning()) return true;
    pause(250);
  }
  return false;
}

function relaunchApp() {
  // LaunchServices can briefly retain the just-quit bundle as running and
  // silently swallow an immediate open request for the replacement at the
  // same path. Give it time to settle and force a new instance; retry once.
  pause(1800);
  spawnSync('/usr/bin/open', ['-n', currentApp], { stdio: 'ignore' });
  if (waitForUpdatedApp(4000)) return;

  // `open` may return zero while LaunchServices still associates this bundle
  // path with the process that just quit. Bypass LaunchServices as a fallback.
  const executable = path.join(currentApp, 'Contents', 'MacOS', path.basename(currentApp, '.app'));
  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(currentApp),
  });
  child.unref();
  if (!waitForUpdatedApp(5000)) throw new Error('Updated IDP could not be relaunched');
}

function swapDirectly() {
  fs.rmSync(backupApp, { recursive: true, force: true });
  fs.renameSync(currentApp, backupApp);
  try { fs.renameSync(stagedApp, currentApp); }
  catch (err) { fs.renameSync(backupApp, currentApp); throw err; }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function swapWithAdministratorApproval() {
  const command = [
    `/bin/rm -rf ${shellQuote(backupApp)}`,
    `/bin/mv ${shellQuote(currentApp)} ${shellQuote(backupApp)}`,
    `if /bin/mv ${shellQuote(stagedApp)} ${shellQuote(currentApp)}; then exit 0; else /bin/mv ${shellQuote(backupApp)} ${shellQuote(currentApp)}; exit 1; fi`,
  ].join(' && ');
  const appleScript = 'on run argv\ndo shell script (item 1 of argv) with administrator privileges\nend run';
  const result = spawnSync('/usr/bin/osascript', ['-e', appleScript, command], { stdio: 'ignore' });
  if (result.status !== 0) throw new Error('Administrator approval was cancelled or installation failed');
}

try {
  waitForParent();
  try { swapDirectly(); } catch { swapWithAdministratorApproval(); }
  relaunchApp();
  process.exit(0);
} catch (err) {
  try {
    if (!fs.existsSync(currentApp) && fs.existsSync(backupApp)) fs.renameSync(backupApp, currentApp);
    if (fs.existsSync(currentApp)) spawn('/usr/bin/open', ['-n', currentApp], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* best effort recovery */ }
  fs.writeFileSync(path.join(path.dirname(stagedApp), 'install-error.txt'), `${err.stack || err}\n`);
  process.exit(1);
}
