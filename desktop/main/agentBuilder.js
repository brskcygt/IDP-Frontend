'use strict';

/**
 * Builds the per-agent installation ZIP (agent JAR + Windows installer).
 *
 * Identity: every agent gets its OWN secret, issued by the IDP backend
 * (`POST /api/agents/:id/credentials`, injected as `issueCredentials`). There
 * is no shared gateway token any more. Issuing for an ID that already has
 * credentials ROTATES them — the installation using the old secret disconnects
 * and every ZIP built earlier for that ID stops working.
 *
 * Secret handling:
 *   - Maven builds the JAR WITHOUT any application.yml. The config (with the
 *     secret) is injected into the finished JAR in memory, so the secret never
 *     lands in a temporary file.
 *   - Credentials are requested only after the save dialog was confirmed and
 *     the JAR built successfully: a cancelled dialog or a failed build does not
 *     rotate (and so does not disconnect) an existing installation.
 *   - The only file the secret is written to is the chosen ZIP (mode 0600).
 *   - The result returned to the renderer carries no secret (see buildAgentJar).
 */

const { app, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/** Same format the backend enforces for `/api/agents/:id/credentials`. */
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const PROXY = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?):(\d{1,5})$/;
const CONFIG_ENTRY = 'application.yml';

function required(value, label, max = 2048) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} zorunludur.`);
  if (normalized.length > max) throw new Error(`${label} en fazla ${max} karakter olabilir.`);
  return normalized;
}

function webUrl(value, label, protocols) {
  const normalized = required(value, label);
  let parsed;
  try { parsed = new URL(normalized); } catch { throw new Error(`${label} geçerli bir URL olmalıdır.`); }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${label} ${protocols.join(' veya ')} ile başlamalıdır.`);
  if (parsed.username || parsed.password) throw new Error(`${label} kullanıcı adı veya parola içeremez.`);
  return parsed.toString().replace(/\/$/, '');
}

const YAML_ESCAPES = Object.freeze({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' });

/**
 * YAML double-quoted scalar. Escapes `\` and `"`, every C0/C1 control
 * character and the characters YAML 1.1 (SnakeYAML) treats as line breaks
 * (U+0085, U+2028, U+2029) or strips (U+FEFF). Everything else stays literal
 * UTF-8, so a Turkish path such as `C:\Uygulamalar\Ödeme` round-trips as-is.
 */
function yamlString(value) {
  const text = String(value);
  if (!text.isWellFormed()) throw new Error('Değer geçersiz Unicode karakter içeriyor.');
  // eslint-disable-next-line no-control-regex
  const escaped = text.replace(/[\\"\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/g, (ch) =>
    YAML_ESCAPES[ch] || `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `"${escaped}"`;
}

/** @returns {{ host: string, port: number, value: string } | null} `null` when empty. */
function parseProxy(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const match = PROXY.exec(value);
  const port = match ? Number(match[2]) : 0;
  if (!match || port < 1 || port > 65535 || match[1].includes('..')) {
    throw new Error('Proxy host:port biçiminde olmalıdır (ör. proxy.sirket.local:8080). Gerekmiyorsa boş bırakın.');
  }
  return { host: match[1].replace(/^\[|\]$/g, ''), port, value };
}

/**
 * Renderer input. Only these fields are read: a renderer that still sends the
 * old `serverUrl` / `gatewayToken` has them ignored — the gateway address and
 * the secret come from the backend now.
 */
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Agent bilgileri geçersiz.');
  const agentId = required(input.agentId, 'Agent kimliği', 128);
  if (!AGENT_ID.test(agentId)) {
    throw new Error('Agent kimliği 3-128 karakter olmalı; harf veya rakamla başlamalı, yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.');
  }
  const workingDirectory = required(input.workingDirectory, 'Repository dizini');
  if (CONTROL_CHARS.test(workingDirectory)) throw new Error('Repository dizini kontrol karakteri içeremez.');
  const proxy = parseProxy(input.proxy);
  return {
    agentId,
    workingDirectory,
    proxy: proxy ? proxy.value : null,
    logLevel: LOG_LEVELS.includes(input.logLevel) ? input.logLevel : 'INFO',
  };
}

function secretString(value, label) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /\s/.test(value) || CONTROL_CHARS.test(value)) {
    // Never echo the value: it may be (part of) a secret.
    throw new Error(`IDP sunucusu geçersiz bir agent kimliği yanıtı döndürdü (${label}).`);
  }
  return value;
}

/**
 * Backend response of `POST /api/agents/:id/credentials`:
 * `{ agentId, secret, gatewayUrl, cfAccess: { clientId, clientSecret } | null }`.
 * Error messages never include the received values.
 */
function validateCredentials(raw, agentId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('IDP sunucusu geçersiz bir agent kimliği yanıtı döndürdü.');
  }
  if (raw.agentId !== agentId) throw new Error('IDP sunucusu başka bir agent ID için kimlik döndürdü.');
  let gatewayUrl;
  try {
    gatewayUrl = webUrl(raw.gatewayUrl, 'Gateway adresi', ['ws:', 'wss:']);
  } catch (err) {
    throw new Error(`IDP sunucusunun döndürdüğü gateway adresi kullanılamıyor: ${err.message}`);
  }
  let cfAccess = null;
  if (raw.cfAccess !== null && raw.cfAccess !== undefined) {
    if (typeof raw.cfAccess !== 'object' || Array.isArray(raw.cfAccess)) {
      throw new Error('IDP sunucusu geçersiz bir agent kimliği yanıtı döndürdü (cfAccess).');
    }
    cfAccess = {
      clientId: secretString(raw.cfAccess.clientId, 'cfAccess.clientId'),
      clientSecret: secretString(raw.cfAccess.clientSecret, 'cfAccess.clientSecret'),
    };
  }
  return { agentId, secret: secretString(raw.secret, 'secret'), gatewayUrl, cfAccess };
}

/**
 * @param {ReturnType<typeof validateInput>} value
 * @param {ReturnType<typeof validateCredentials>} credentials
 */
function createConfig(value, credentials) {
  const server = [
    `  url: ${yamlString(credentials.gatewayUrl)}`,
    `  agent-secret: ${yamlString(credentials.secret)}`,
  ];
  if (credentials.cfAccess) {
    server.push(
      `  cf-access-client-id: ${yamlString(credentials.cfAccess.clientId)}`,
      `  cf-access-client-secret: ${yamlString(credentials.cfAccess.clientSecret)}`,
    );
  }
  if (value.proxy) server.push(`  proxy: ${yamlString(value.proxy)}`);
  return [
    'server:',
    ...server,
    '',
    'agent:',
    `  id: ${yamlString(value.agentId)}`,
    '  service-name: "idp-agent"',
    '  version: "1.0.0"',
    '',
    'logging:',
    `  level: ${value.logLevel}`,
    '',
    'application:',
    `  working-directory: ${yamlString(value.workingDirectory)}`,
    '',
  ].join('\n');
}

/** Host + TCP port the agent dials: wss → 443, ws → explicit port or 80. */
function gatewayEndpoint(serverUrl) {
  const parsed = new URL(webUrl(serverUrl, 'Gateway adresi', ['ws:', 'wss:']));
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'wss:' ? 443 : 80);
  return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port };
}

/** PowerShell single-quoted literal. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * One-shot installer (.ps1). Must stay ASCII: Windows PowerShell 5.1 reads a
 * BOM-less script in the ANSI code page. Written for PowerShell 5.1.
 * @param {string} agentId
 * @param {string} jarFileName
 * @param {string} serverUrl - gateway ws:// / wss:// URL (reachability pre-check).
 * @param {{ proxy?: string | null }} [options]
 */
function createWindowsInstaller(agentId, jarFileName, serverUrl, options = {}) {
  if (!AGENT_ID.test(agentId)) throw new Error('Agent kimliği geçersiz.');
  const taskName = `IDP-Agent-${agentId}`;
  const gateway = gatewayEndpoint(serverUrl);
  const proxy = parseProxy(options.proxy);
  const proxyCheck = proxy ? `
  if (Test-TcpEndpoint ${psQuote(proxy.host)} ${proxy.port}) {
    Write-Host ('Proxy erisilebilir: ${proxy.host}:${proxy.port}') -ForegroundColor Green
  } else {
    Write-Host ('UYARI: Proxy''e erisilemiyor: ${proxy.host}:${proxy.port} - proxy adresini ve firewall kurallarini kontrol edin') -ForegroundColor Yellow
  }
` : '';

  const script = `param()
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
  exit
}

$taskName = ${psQuote(taskName)}
$installDir = Join-Path $env:ProgramData ${psQuote(`IDP\\Agent\\${agentId}`)}
$targetJar = Join-Path $installDir 'idp-agent.jar'
$launcher = Join-Path $installDir 'run-agent.ps1'
$logFile = Join-Path $installDir 'agent.log'
$installLog = Join-Path $installDir 'install.log'
$transcriptStarted = $false
$exitCode = 0

# TcpClient with a 5 s timeout instead of Test-NetConnection: that one pings
# (ICMP) first and waits ~20 s on a filtered port.
function Test-TcpEndpoint([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $pending = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $pending.AsyncWaitHandle.WaitOne(5000, $false)) { return $false }
    $client.EndConnect($pending)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

try {
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  try {
    Start-Transcript -LiteralPath $installLog -Append | Out-Null
    $transcriptStarted = $true
  } catch {
    Write-Host ('Kurulum logu baslatilamadi: ' + $_.Exception.Message) -ForegroundColor Yellow
  }

  $sourceJar = Join-Path $PSScriptRoot ${psQuote(jarFileName)}
  if (-not (Test-Path -LiteralPath $sourceJar)) { throw 'Agent JAR dosyasi kurulum betigiyle ayni klasorde olmali.' }

  # Java 17+ check. "java -version" writes to stderr; with 'Stop', PS 5.1 turns
  # redirected stderr lines into terminating errors, so relax it for this call.
  $javaCommand = Get-Command java.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $javaCommand) { throw 'java.exe bulunamadi. Java 17+ kurun ve PATH degiskenine ekleyin.' }
  $java = $javaCommand.Source
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $javaVersionText = (& $java -version 2>&1 | ForEach-Object { $_.ToString() }) -join ' '
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  $javaMajor = 0
  if ($javaVersionText -match 'version "(\\d+)(\\.(\\d+))?') {
    $javaMajor = [int]$Matches[1]
    if ($javaMajor -eq 1 -and $Matches[3]) { $javaMajor = [int]$Matches[3] }
  }
  if ($javaMajor -lt 17) {
    if ($javaMajor -gt 0) { $javaFound = [string]$javaMajor } else { $javaFound = 'surum okunamadi' }
    throw ('Java 17+ gerekli, bulunan: ' + $javaFound + ' (' + $java + ')')
  }
  Write-Host ('Java ' + $javaMajor + ' bulundu: ' + $java) -ForegroundColor Green

  # Reachability pre-check: a warning only, the installation continues.
  if (Test-TcpEndpoint ${psQuote(gateway.host)} ${gateway.port}) {
    Write-Host ('Gateway erisilebilir: ${gateway.host}:${gateway.port}') -ForegroundColor Green
  } else {
    Write-Host ('UYARI: Gateway''e erisilemiyor: ${gateway.host}:${gateway.port} - ag/proxy/firewall kontrol edin') -ForegroundColor Yellow
  }
${proxyCheck}
  # Reinstall / credential rotation: the running agent holds the JAR open.
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Host 'Mevcut agent gorevi durduruluyor...'
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($targetJar) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1

  Copy-Item -LiteralPath $sourceJar -Destination $targetJar -Force
  if (Test-Path -LiteralPath $logFile) {
    Move-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force -ErrorAction SilentlyContinue
  }
  # No JVM trust-store flags here: a launcher-level override would replace the
  # JDK default trust. The agent combines JDK and Windows trust internally.
  $launchContent = @'
& '__IDP_JAVA__' -jar '__IDP_JAR__' *>> '__IDP_LOG__'
exit $LASTEXITCODE
'@
  $launchContent = $launchContent.Replace('__IDP_JAVA__', $java.Replace("'", "''")).Replace('__IDP_JAR__', $targetJar.Replace("'", "''")).Replace('__IDP_LOG__', $logFile.Replace("'", "''"))
  Set-Content -LiteralPath $launcher -Value $launchContent -Encoding UTF8
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"')
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description 'IDP deployment agent - automatic startup and reconnect' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host 'IDP Agent kuruldu ve arka planda baslatildi.' -ForegroundColor Green
  Write-Host ('Gorev: ' + $taskName)
  Write-Host ('Dizin: ' + $installDir)
  Write-Host ('Log: ' + $logFile)

  # Connection hint only: not finding the line does not fail the installation.
  Write-Host 'Gateway baglantisi bekleniyor (en fazla 20 sn)...'
  $connected = $false
  $deadline = (Get-Date).AddSeconds(20)
  while (-not $connected -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $logFile) {
      $connected = [bool](Get-Content -LiteralPath $logFile -ErrorAction SilentlyContinue | Select-String -SimpleMatch -Pattern 'Handshake onaylan' -Quiet)
    }
  }
  if ($connected) {
    Write-Host 'Agent gateway''e baglandi.' -ForegroundColor Green
  } else {
    Write-Host ('Henuz baglanmadi, log: ' + $logFile) -ForegroundColor Yellow
  }
  Write-Host ('Log izlemek icin: Get-Content -LiteralPath ''' + $logFile + ''' -Tail 50 -Wait')
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host ('KURULUM BASARISIZ: ' + $_.Exception.Message) -ForegroundColor Red
  if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
    Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor Red
  }
} finally {
  Write-Host ('Kurulum logu: ' + $installLog)
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch { }
  }
  try { [void](Read-Host 'Kapatmak icin Enter') } catch { }
}
exit $exitCode
`;
  if (!/^[\t\n\r\x20-\x7e]*$/.test(script)) throw new Error('Kurulum betiği ASCII dışı karakter içeremez.');
  return script;
}

function resolveMavenExecutable() {
  const pathEntries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    process.env.IDP_MAVEN_PATH,
    ...pathEntries.map((entry) => path.join(entry, process.platform === 'win32' ? 'mvn.cmd' : 'mvn')),
    '/opt/homebrew/bin/mvn',
    '/usr/local/bin/mvn',
    process.platform === 'win32' ? 'C:\\Program Files\\Apache\\Maven\\bin\\mvn.cmd' : null,
  ].filter(Boolean);
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
}

function runMaven(projectRoot) {
  return new Promise((resolve, reject) => {
    const executable = resolveMavenExecutable();
    if (!executable) return reject(new Error('Apache Maven bulunamadı. Maven 3.9+ kurun veya IDP_MAVEN_PATH ile mvn dosyasının tam yolunu belirtin.'));
    const executableDir = path.dirname(executable);
    const childPath = [executableDir, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].filter(Boolean).join(path.delimiter);
    execFile(executable, ['-q', '-DskipTests', 'clean', 'package'], {
      cwd: projectRoot,
      timeout: 5 * 60 * 1000,
      env: { ...process.env, PATH: childPath },
    }, (error, stdout, stderr) => {
      if (!error) return resolve();
      if (error.code === 'ENOENT') return reject(new Error(`Maven çalıştırılamadı: ${executable}. IDP_MAVEN_PATH ayarını kontrol edin.`));
      reject(new Error(`Agent JAR derlenemedi: ${String(stderr || stdout || error.message).trim().slice(-2000)}`));
    });
  });
}

function templateRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'idp-agent')
    : path.join(__dirname, '..', '..', 'idp-agent');
}

/** Builds the config-less agent JAR in `buildRoot`; returns its path. */
async function buildTemplateJar(buildRoot) {
  await fs.cp(templateRoot(), buildRoot, { recursive: true });
  // A developer's local config must never end up in a shipped package.
  await fs.rm(path.join(buildRoot, 'src', 'main', 'resources', CONFIG_ENTRY), { force: true });
  await runMaven(buildRoot);
  return path.join(buildRoot, 'target', 'idp-agent-1.0.0.jar');
}

/**
 * Everything in memory: JAR + injected application.yml + installer → ZIP bytes.
 * @returns {Buffer}
 */
function packageAgent({ jarBuffer, value, credentials }) {
  const jar = new AdmZip(jarBuffer);
  if (jar.getEntry(CONFIG_ENTRY)) jar.deleteFile(CONFIG_ENTRY);
  jar.addFile(CONFIG_ENTRY, Buffer.from(createConfig(value, credentials), 'utf8'));
  const jarFileName = `idp-agent-${value.agentId}.jar`;
  const installerFileName = `install-idp-agent-${value.agentId}.ps1`;
  const zip = new AdmZip();
  zip.addFile(jarFileName, jar.toBuffer());
  zip.addFile(installerFileName, Buffer.from(createWindowsInstaller(value.agentId, jarFileName, credentials.gatewayUrl, { proxy: value.proxy }), 'utf8'));
  return zip.toBuffer();
}

const ROTATED_NOTE = 'Bu ID için yeni kimlik zaten üretildi; eski kurulum artık bağlanamaz. Paketi yeniden oluşturun.';

/**
 * @param {unknown} input - from the renderer (see validateInput).
 * @param {object} deps
 * @param {(agentId: string) => Promise<unknown>} deps.issueCredentials - `POST /api/agents/:id/credentials`.
 * @param {(options: object) => Promise<{ canceled: boolean, filePath?: string }>} [deps.showSaveDialog]
 * @param {(buildRoot: string) => Promise<string>} [deps.buildJar] - builds the config-less JAR, returns its path.
 * @param {string} [deps.tmpDir]
 * @returns {Promise<{ canceled: true } | { canceled: false, filePath: string, sha256: string, gatewayUrl: string, cfAccess: boolean }>}
 *   Goes to the renderer as-is: no secret, no CF Access credentials.
 */
async function buildAgentJar(input, deps = {}) {
  const {
    issueCredentials,
    showSaveDialog = (options) => dialog.showSaveDialog(options),
    buildJar = buildTemplateJar,
    tmpDir = os.tmpdir(),
  } = deps;
  if (typeof issueCredentials !== 'function') throw new Error('Agent kimliği üretimi bu modda yapılandırılmamış.');
  const value = validateInput(input);
  const destination = await showSaveDialog({
    title: 'IDP Agent kurulum paketini kaydet',
    defaultPath: `idp-agent-${value.agentId}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (destination.canceled || !destination.filePath) return { canceled: true };

  const buildRoot = path.join(tmpDir, `idp-agent-build-${crypto.randomUUID()}`);
  let jarBuffer;
  try {
    jarBuffer = await fs.readFile(await buildJar(buildRoot));
  } finally {
    await fs.rm(buildRoot, { recursive: true, force: true });
  }

  // Rotation point: from here on an existing installation of this ID is disconnected.
  const credentials = validateCredentials(await issueCredentials(value.agentId), value.agentId);
  let archive;
  try {
    archive = packageAgent({ jarBuffer, value, credentials });
    await fs.writeFile(destination.filePath, archive, { mode: 0o600 });
    await fs.chmod(destination.filePath, 0o600).catch(() => {});
  } catch (err) {
    throw new Error(`Agent paketi kaydedilemedi: ${err && err.message ? err.message : String(err)}. ${ROTATED_NOTE}`);
  }
  return {
    canceled: false,
    filePath: destination.filePath,
    sha256: crypto.createHash('sha256').update(archive).digest('hex').toUpperCase(),
    gatewayUrl: credentials.gatewayUrl,
    cfAccess: credentials.cfAccess !== null,
  };
}

module.exports = {
  buildAgentJar,
  validateInput,
  validateCredentials,
  createConfig,
  createWindowsInstaller,
  gatewayEndpoint,
  packageAgent,
  resolveMavenExecutable,
  yamlString,
};
