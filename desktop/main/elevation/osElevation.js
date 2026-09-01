'use strict';

/**
 * OS-native elevation provider (T-93) — macOS implementation.
 *
 * Registered as the `elevationProvider` (see
 * `backend/src/services/vpn/elevationProvider.js`) from
 * `desktop/main/index.js` at startup. VpnManager calls whatever's
 * registered there instead of holding a sudo password itself, replacing
 * the removed `POST /api/vpn/grant-permissions` endpoint (SEC-02: raw
 * shell-string command injection; SEC-08: permanent NOPASSWD sudoers).
 *
 * SECURITY (SEC-02 — do not repeat): the bug being fixed here was string
 * concatenation of user-controlled input into a shell command. Every
 * argument that reaches a shell in this file goes through `shellQuote()`,
 * which wraps a value in single quotes and escapes any embedded single
 * quote as `'\''` — the standard POSIX-shell-safe quoting form. Nothing is
 * ever interpolated into a shell/AppleScript string unescaped, and
 * `shellQuote`/`appleScriptQuote` are the only two places responsible for
 * that guarantee. No argument is ever passed through `exec()`-style shell
 * interpretation without going through one of them first.
 *
 * `do shell script "..." with administrator privileges` is macOS's own
 * elevation dialog (Security Agent / Touch ID prompt) — the user's account
 * password (or biometric) is entered directly into that OS dialog and never
 * touches this process' memory, unlike the old endpoint's `sudoPassword`
 * request body field.
 *
 * Long-running tunnel shape: `do shell script` blocks until the shell
 * command it runs EXITS and only then returns its captured stdout — it
 * does not stream output, and it cannot be used to "run this in the
 * foreground and give me a live stdout stream" for a process that's
 * supposed to keep running for the life of a VPN tunnel (potentially
 * hours). So what's actually elevated is a small wrapper that backgrounds
 * the real command, redirects its output to a private logfile, and records
 * its PID — `do shell script` returns as soon as that hand-off happens.
 * The returned handle then:
 *   - tails the logfile (via a normal, non-elevated `tail -f`) and emits
 *     it on synthetic `.stdout`, matching what a real ChildProcess gives
 *     VpnManager's marker-watching logic;
 *   - polls the recorded PID for liveness and emits `'exit'` once the
 *     elevated process is gone;
 *   - `.kill(signal)` re-elevates (a second `do shell script ... with
 *     administrator privileges`) to send the signal, since a non-root
 *     process can't signal a root-owned one directly. macOS caches
 *     "administrator privileges" authorization for a few minutes, so this
 *     usually does not re-prompt right after the initial connect.
 */

const { spawn, execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PID_POLL_INTERVAL_MS = 1000;

/** Wraps `value` as a single POSIX-shell-safe quoted token. */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Builds `command arg1 arg2 ...` with every token individually shell-quoted. */
function buildShellCommand(command, args) {
  if (!command || typeof command !== 'string') {
    throw new TypeError('buildShellCommand: command must be a non-empty string');
  }
  const safeArgs = Array.isArray(args) ? args : [];
  return [command, ...safeArgs].map(shellQuote).join(' ');
}

/** Wraps `value` as an AppleScript string literal (used inside `do shell script "..."`). */
function appleScriptQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Runs `shellCommand` (already fully shell-quoted by the caller) via
 * osascript's `do shell script ... with administrator privileges`.
 * Resolves with captured stdout; rejects with a clear error if the user
 * declines the dialog or the command itself fails.
 */
function runOsascriptAdminShell(shellCommand, reason) {
  return new Promise((resolve, reject) => {
    const script =
      `do shell script ${appleScriptQuote(shellCommand)} ` +
      `with prompt ${appleScriptQuote(reason || 'IDP needs administrator privileges.')} ` +
      `with administrator privileges`;

    const proc = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      // osascript reports (-128) "User canceled." when the admin-privileges
      // dialog is dismissed/declined — surface that distinctly so callers
      // can show a clean message instead of a raw AppleScript error dump.
      if (/-128|user canceled|user cancelled/i.test(stderr)) {
        reject(new Error('Administrator approval was declined by the user.'));
        return;
      }
      reject(new Error(`Elevated command failed (osascript exit ${code}): ${stderr.trim() || 'unknown error'}`));
    });
  });
}

/**
 * ChildProcess-shaped handle for an elevated, backgrounded process.
 * Satisfies VpnManager's needs: `.stdout`/`.stderr` (readable streams-ish,
 * via EventEmitter 'data'), `.stdin` (no-op sink — none of today's elevated
 * commands need stdin input; openfortivpn's password is a `-p` argument),
 * `.on('exit' | 'error')`, `.kill(signal)`.
 */
class ElevatedProcessHandle extends EventEmitter {
  constructor({ dir, logFile, pidFile, command, stdinFd = null }) {
    super();
    this._dir = dir;
    this._logFile = logFile;
    this._pidFile = pidFile;
    this._command = command;
    this._stdinFd = stdinFd;
    this._killed = false;
    this.killed = false;

    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    // A real stdin, backed by the FIFO the elevated command reads from.
    //
    // This used to be a stub that silently swallowed writes, which quietly
    // broke every interactive prompt: openfortivpn asks for its one-time token
    // on stdin, the OTP interception in VpnManager wrote the code here, and
    // nothing arrived. The gateway then failed with "No token specified" and
    // the cause was invisible — the write reported no error.
    this.stdin = {
      writable: stdinFd !== null,
      write: (chunk) => {
        if (this._stdinFd === null) return false;
        try {
          fs.writeSync(this._stdinFd, typeof chunk === 'string' ? chunk : String(chunk));
          return true;
        } catch {
          return false;
        }
      },
      end: () => this._closeStdin(),
    };

    this._startTail();
    this._startPidWatch();
  }

  _closeStdin() {
    if (this._stdinFd === null) return;
    try { fs.closeSync(this._stdinFd); } catch { /* already gone */ }
    this._stdinFd = null;
    this.stdin.writable = false;
  }

  _readPid() {
    try {
      const raw = fs.readFileSync(this._pidFile, 'utf8').trim();
      const pid = parseInt(raw, 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch (_err) {
      return null;
    }
  }

  _startTail() {
    // `-F` (capital) so it survives the file being (re)created briefly
    // slower than this process starts watching it; unprivileged — the
    // logfile was created 0600 by us before the elevated write, and root
    // writes to an already-open/existing file bypass the permission check
    // without changing ownership.
    this._tailProc = spawn('tail', ['-n', '+1', '-F', this._logFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    this._tailProc.stdout.on('data', (chunk) => this.stdout.emit('data', chunk));
    this._tailProc.stderr.on('data', (chunk) => this.stdout.emit('data', chunk));
    this._tailProc.on('error', () => {
      /* best-effort log tailing — a failure here must not crash the tunnel */
    });
  }

  _startPidWatch() {
    this._pidWatchTimer = setInterval(() => {
      if (this._killed) return;
      const pid = this._readPid();
      if (!pid) return; // pidfile not written yet
      try {
        // Signal 0: existence/permission check only, no signal actually sent.
        process.kill(pid, 0);
      } catch (err) {
        if (err.code === 'ESRCH') {
          this._onExit(0);
        }
        // EPERM means the process exists but we can't signal it directly
        // (expected — it's root-owned) — that's still "alive".
      }
    }, PID_POLL_INTERVAL_MS);
    if (typeof this._pidWatchTimer.unref === 'function') this._pidWatchTimer.unref();
  }

  _onExit(code) {
    if (this._exited) return;
    this._exited = true;
    this._cleanup();
    this.emit('exit', code);
  }

  _cleanup() {
    if (this._pidWatchTimer) clearInterval(this._pidWatchTimer);
    if (this._tailProc && !this._tailProc.killed) {
      try { this._tailProc.kill('SIGTERM'); } catch (_err) { /* already gone */ }
    }
    try { fs.rmSync(this._dir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
  }

  /**
   * Re-elevates to signal the underlying root-owned process — a non-root
   * process cannot signal a root one directly. Async by necessity; matches
   * ChildProcess.kill()'s fire-and-forget shape (failures surface via the
   * 'error' event rather than a thrown/rejected value the caller must
   * await, since VpnManager's teardown path calls `.kill()` synchronously).
   */
  kill(signal = 'SIGTERM') {
    if (this._killed) return true;
    this._killed = true;
    const pid = this._readPid();
    if (!pid) {
      this._onExit(null);
      return true;
    }
    const sig = String(signal).replace(/^SIG/, '');
    const shellCommand = buildShellCommand('kill', [`-${sig}`, String(pid)]);
    runOsascriptAdminShell(shellCommand, `IDP needs administrator privileges to stop ${this._command}`)
      .then(() => this._onExit(0))
      .catch((err) => {
        this.emit('error', err);
        // Still consider it "done" from our side — we can't keep polling
        // forever if the elevated kill itself was declined.
        this._onExit(null);
      });
    return true;
  }
}

/**
 * The `elevationProvider` contract function
 * (`backend/src/services/vpn/elevationProvider.js`):
 *   ({ command, args, reason, onLog }) => Promise<ChildProcess-like>
 */
async function elevate({ command, args, reason, onLog }) {
  if (process.platform !== 'darwin') {
    throw new Error(`OS elevation is not implemented on this platform (${process.platform}).`);
  }
  if (!command || typeof command !== 'string') {
    throw new TypeError('elevate: command must be a non-empty string');
  }

  const log = typeof onLog === 'function' ? onLog : () => {};
  const runId = crypto.randomBytes(8).toString('hex');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idp-elevate-'));
  const logFile = path.join(dir, `${runId}.log`);
  const pidFile = path.join(dir, `${runId}.pid`);
  // Pre-create with 0600 as the invoking (non-root) user so it stays
  // readable by us after the elevated shell writes to it — see class doc.
  fs.writeFileSync(logFile, '', { mode: 0o600 });
  fs.writeFileSync(pidFile, '', { mode: 0o600 });

  // A FIFO carries stdin to the elevated command, so interactive prompts (the
  // VPN gateway's one-time token) can still be answered.
  //
  // Opened O_RDWR on our side BEFORE the wrapper runs, on purpose: opening a
  // FIFO for reading blocks until a writer exists, and opening for writing
  // blocks until a reader exists. The wrapper's `< fifo` would deadlock against
  // us. Holding it read-write means a "reader" already exists from the kernel's
  // point of view, so the wrapper's open returns immediately.
  const stdinFifo = path.join(dir, `${runId}.stdin`);
  let stdinFd = null;
  try {
    execFileSync('mkfifo', ['-m', '600', stdinFifo]);
    stdinFd = fs.openSync(stdinFifo, fs.constants.O_RDWR);
  } catch (err) {
    // Non-fatal: without a FIFO the command simply has no stdin, which is the
    // pre-existing behavior. Interactive prompts will fail, but a
    // non-interactive tunnel still works.
    log(`[Elevation] ⚠ Could not create the stdin channel (${err.message}); interactive prompts will not work.`);
    stdinFd = null;
  }

  const innerCommand = buildShellCommand(command, args || []);
  // Backgrounds the elevated process, redirects its output to our logfile,
  // records its PID, and returns immediately — `do shell script` only
  // waits for THIS wrapper shell to exit, not for the tunnel itself.
  //
  // Deliberately NO `nohup`. Under `do shell script ... with administrator
  // privileges` there is no controlling terminal, and BSD nohup's attempt to
  // detach from one fails with:
  //
  //     nohup: can't detach from console: Inappropriate ioctl for device
  //
  // …which kills the wrapper before the real command ever starts. nohup buys
  // nothing here anyway: its whole job is shielding a child from the SIGHUP a
  // terminal sends on hangup, and there is no terminal in this context. The
  // backgrounded process is reparented to launchd when the wrapper shell
  // exits, which is exactly what we want.
  const stdinRedirect = stdinFd !== null ? `< ${shellQuote(stdinFifo)}` : '< /dev/null';
  const wrapperShell =
    `${innerCommand} > ${shellQuote(logFile)} 2>&1 ${stdinRedirect} & echo $! > ${shellQuote(pidFile)}`;

  log(`[Elevation] Requesting administrator approval to run: ${command} ${(args || []).join(' ')}`);

  try {
    await runOsascriptAdminShell(wrapperShell, reason);
  } catch (err) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
    throw err;
  }

  // The wrapper shell returning 0 only means the *wrapper* ran. If the real
  // command died immediately (bad flags, missing binary, a shell builtin that
  // failed), the caller would otherwise see a bare "exited prematurely with
  // code 0" and have to guess. Check the PID and, when it's already gone,
  // raise the command's own output instead.
  const startupFailure = detectImmediateFailure(pidFile, logFile);
  if (startupFailure) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
    throw new Error(startupFailure);
  }

  return new ElevatedProcessHandle({ dir, logFile, pidFile, command, stdinFd });
}

/**
 * Did the elevated command die before it ever got going?
 *
 * @returns {string|null} a message describing the failure, or null if the
 *   process is running (or we can't tell, in which case we don't block).
 */
function detectImmediateFailure(pidFile, logFile) {
  let pid;
  try {
    pid = parseInt(String(fs.readFileSync(pidFile, 'utf8')).trim(), 10);
  } catch {
    return null; // can't read it — let the normal marker/timeout path decide
  }

  if (!Number.isInteger(pid) || pid <= 0) {
    return 'The elevated command did not start (no process id was recorded).';
  }

  try {
    process.kill(pid, 0); // signal 0 = existence check only
    return null; // alive
  } catch (err) {
    if (err.code === 'EPERM') return null; // running as root — alive, just not ours to signal
  }

  let output = '';
  try {
    output = String(fs.readFileSync(logFile, 'utf8')).trim();
  } catch { /* no output captured */ }

  const tail = output ? output.split('\n').slice(-5).join('\n') : '(no output)';
  return `The elevated command exited immediately. Its output was:\n${tail}`;
}

module.exports = {
  detectImmediateFailure,
  elevate,
  shellQuote,
  buildShellCommand,
  appleScriptQuote,
};
