'use strict';

/**
 * Builds the per-agent installation ZIP (agent JAR + target-OS installer).
 *
 * Identity: every agent gets its OWN secret, issued by the IDP backend
 * (`POST /api/agents/:id/credentials`, injected as `issueCredentials`). There
 * is no shared gateway token any more. Issuing for an ID that already has
 * credentials ROTATES them — the installation using the old secret disconnects
 * and every ZIP built earlier for that ID stops working.
 *
 * Secret handling:
 *   - Maven builds the JAR WITHOUT any application.yml. The config (with the
 *     secret) is added to the finished ZIP in memory and installed next to the
 *     JAR, so the secret never lands in a temporary build directory.
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
const KEEP_RELEASES_DEFAULT = 3;
const KEEP_RELEASES_MAX = 20;

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
 * Required artifact-deploy root (`deploy.base-path`): every path the agent
 * writes during an artifact deploy stays inside it. Absolute Windows drive
 * path (`C:\inetpub\wwwroot\jetsrm`) or POSIX path (`/var/www/jetsrm`); no
 * UNC share, no drive/filesystem root, no `.`/`..` segments. The parser
 * returns null for an empty value; validateInput rejects it with context.
 * @returns {string | null}
 */
function parseDeployBasePath(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.length > 260) throw new Error('Deploy taban dizini en fazla 260 karakter olabilir.');
  if (CONTROL_CHARS.test(value)) throw new Error('Deploy taban dizini kontrol karakteri içeremez.');
  if (/["*?<>|]/.test(value)) throw new Error('Deploy taban dizini geçersiz karakter içeriyor.');
  const windows = /^[A-Za-z]:[\\/]/.test(value);
  const posix = value.startsWith('/') && !value.startsWith('//');
  if (!windows && !posix) {
    throw new Error('Deploy taban dizini mutlak bir yol olmalıdır (ör. C:\\inetpub\\wwwroot\\jetsrm veya /var/www/jetsrm); UNC paylaşımı desteklenmez.');
  }
  const rest = value.slice(windows ? 3 : 1);
  if (rest.includes(':')) throw new Error("Deploy taban dizini ':' içeremez.");
  const segments = rest.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) throw new Error("Deploy taban dizini '.' veya '..' içeremez.");
  if (segments.length === 0) throw new Error('Deploy taban dizini sürücü/dosya sistemi kökü olamaz.');
  return value.replace(/[\\/]+$/, '');
}

/** `deploy.keep-releases`: integer 1-20, default 3. */
function parseKeepReleases(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return KEEP_RELEASES_DEFAULT;
  const count = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(count) || count < 1 || count > KEEP_RELEASES_MAX) {
    throw new Error(`Saklanacak önceki sürüm sayısı 1-${KEEP_RELEASES_MAX} arasında tam sayı olmalıdır.`);
  }
  return count;
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
  // Older renderer builds expose the project root as `workingDirectory` and
  // do not send `deployBasePath`. Treat that explicit user-entered path as the
  // compatibility alias; an explicitly empty deployBasePath still fails.
  const deployBasePath = parseDeployBasePath(
    Object.prototype.hasOwnProperty.call(input, 'deployBasePath') ? input.deployBasePath : workingDirectory,
  );
  if (!deployBasePath) {
    throw new Error('Deploy taban dizini zorunludur; agent proje kökündeki agent klasörüne kurulacaktır.');
  }
  return {
    agentId,
    workingDirectory,
    proxy: proxy ? proxy.value : null,
    logLevel: LOG_LEVELS.includes(input.logLevel) ? input.logLevel : 'INFO',
    deployBasePath,
    keepReleases: parseKeepReleases(input.keepReleases),
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
  const lines = [
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
  ];
  lines.push(
    'deploy:',
    `  base-path: ${yamlString(value.deployBasePath)}`,
    `  keep-releases: ${value.keepReleases || KEEP_RELEASES_DEFAULT}`,
    '',
  );
  return lines.join('\n');
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

/** POSIX shell single-quoted literal. */
function shQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

/** systemd double-quoted argument; `%` must be doubled to avoid specifier expansion. */
function systemdQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}

/**
 * One-shot installer (.ps1). Must stay ASCII: Windows PowerShell 5.1 reads a
 * BOM-less script in the ANSI code page. Written for PowerShell 5.1.
 * @param {string} agentId
 * @param {string} jarFileName
 * @param {string} serverUrl - gateway ws:// / wss:// URL (reachability pre-check).
 * @param {{ proxy?: string | null, deployBasePath: string }} options
 */
function createWindowsInstaller(agentId, jarFileName, serverUrl, options) {
  if (!AGENT_ID.test(agentId)) throw new Error('Agent kimliği geçersiz.');
  const deployBasePath = parseDeployBasePath(options && options.deployBasePath);
  if (!deployBasePath) throw new Error('Windows agent kurulumu için deploy taban dizini zorunludur.');
  if (!/^[A-Za-z]:[\\/]/.test(deployBasePath)) {
    throw new Error('Windows agent kurulumu için C:\\ ile başlayan bir deploy taban dizini gereklidir.');
  }
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
$projectRoot = ${psQuote(deployBasePath)}
$installDir = Join-Path $projectRoot 'agent'
$targetJar = Join-Path $installDir 'idp-agent.jar'
$configFile = Join-Path $installDir '${CONFIG_ENTRY}'
$launcher = Join-Path $installDir 'run-agent.ps1'
$logFile = Join-Path $installDir 'agent.log'
$installLog = Join-Path $installDir 'install.log'
$webConfig = Join-Path $installDir 'web.config'
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
  if (Test-Path -LiteralPath $projectRoot) {
    $projectRootItem = Get-Item -LiteralPath $projectRoot -Force
    if (-not $projectRootItem.PSIsContainer) {
      throw ('Proje kok yolu bir dizin degil: ' + $projectRoot)
    }
  } else {
    New-Item -ItemType Directory -Path $projectRoot -Force | Out-Null
    Write-Host ('Proje kok dizini olusturuldu: ' + $projectRoot) -ForegroundColor Green
    $projectRootItem = Get-Item -LiteralPath $projectRoot -Force
  }
  if (($projectRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw ('Proje kok dizini reparse point olamaz: ' + $projectRoot)
  }
  if (Test-Path -LiteralPath $installDir) {
    $installDirItem = Get-Item -LiteralPath $installDir -Force
    if (-not $installDirItem.PSIsContainer) { throw ('Agent yolu bir dizin degil: ' + $installDir) }
    if (($installDirItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw ('Agent dizini reparse point olamaz: ' + $installDir)
    }
  } else {
    New-Item -ItemType Directory -Path $installDir | Out-Null
  }

  # Lock the directory before copying application.yml. It contains the agent
  # secret and must never be briefly readable through inherited webroot ACLs.
  & icacls.exe $installDir /setowner '*S-1-5-32-544' /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ('Agent dizini sahipligi korunamadi: ' + $installDir) }
  & icacls.exe $installDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ('Agent dizini ACL korumasi uygulanamadi: ' + $installDir) }

  $denyWeb = @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <security>
      <authorization>
        <clear />
        <add accessType="Deny" users="*" />
      </authorization>
    </security>
  </system.webServer>
</configuration>
'@
  Set-Content -LiteralPath $webConfig -Value $denyWeb -Encoding ASCII

  try {
    Start-Transcript -LiteralPath $installLog -Append | Out-Null
    $transcriptStarted = $true
  } catch {
    Write-Host ('Kurulum logu baslatilamadi: ' + $_.Exception.Message) -ForegroundColor Yellow
  }

  $sourceJar = Join-Path $PSScriptRoot ${psQuote(jarFileName)}
  if (-not (Test-Path -LiteralPath $sourceJar)) { throw 'Agent JAR dosyasi kurulum betigiyle ayni klasorde olmali.' }
  $sourceConfig = Join-Path $PSScriptRoot '${CONFIG_ENTRY}'
  if (-not (Test-Path -LiteralPath $sourceConfig)) { throw '${CONFIG_ENTRY} kurulum betigiyle ayni klasorde olmali.' }

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
  Copy-Item -LiteralPath $sourceConfig -Destination $configFile -Force
  if (Test-Path -LiteralPath $logFile) {
    Move-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force -ErrorAction SilentlyContinue
  }
  # No JVM trust-store flags here: a launcher-level override would replace the
  # JDK default trust. The agent combines JDK and Windows trust internally.
  $launchContent = @'
& '__IDP_JAVA__' -jar '__IDP_JAR__' '--config=__IDP_CONFIG__' *>> '__IDP_LOG__'
exit $LASTEXITCODE
'@
  $launchContent = $launchContent.Replace('__IDP_JAVA__', $java.Replace("'", "''")).Replace('__IDP_JAR__', $targetJar.Replace("'", "''")).Replace('__IDP_CONFIG__', $configFile.Replace("'", "''")).Replace('__IDP_LOG__', $logFile.Replace("'", "''"))
  Set-Content -LiteralPath $launcher -Value $launchContent -Encoding UTF8
  # WorkingDirectory: the agent writes logs\\ relative to its cwd; without it a SYSTEM task starts in System32.
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"') -WorkingDirectory $installDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description 'IDP deployment agent - automatic startup and reconnect' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host 'IDP Agent kuruldu ve arka planda baslatildi.' -ForegroundColor Green
  Write-Host ('Gorev: ' + $taskName)
  Write-Host ('Dizin: ' + $installDir)
  Write-Host ('Config: ' + $configFile)
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

/**
 * One-shot Linux installer. Installs the agent beside the deployed project at
 * `<deploy.base-path>/agent` and runs it as a root-owned systemd service.
 * @param {string} agentId
 * @param {string} jarFileName
 * @param {{ deployBasePath: string }} options
 */
function createLinuxInstaller(agentId, jarFileName, options) {
  if (!AGENT_ID.test(agentId)) throw new Error('Agent kimliği geçersiz.');
  const deployBasePath = parseDeployBasePath(options && options.deployBasePath);
  if (!deployBasePath) throw new Error('Linux agent kurulumu için deploy taban dizini zorunludur.');
  if (!deployBasePath.startsWith('/') || deployBasePath.startsWith('//')) {
    throw new Error('Linux agent kurulumu için / ile başlayan bir deploy taban dizini gereklidir.');
  }
  const installDir = `${deployBasePath}/agent`;
  const serviceName = `idp-agent-${agentId}`;
  const targetJar = `${installDir}/idp-agent.jar`;
  const configFile = `${installDir}/${CONFIG_ENTRY}`;
  const launcher = `${installDir}/run-agent.sh`;
  const logFile = `${installDir}/agent.log`;
  const unitFile = `/etc/systemd/system/${serviceName}.service`;
  return `#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "KURULUM BASARISIZ: root yetkisi gerekli; sudo ile calistirin." >&2
  exit 1
fi

project_root=${shQuote(deployBasePath)}
install_dir=${shQuote(installDir)}
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_jar="$source_dir/${jarFileName}"
source_config="$source_dir/${CONFIG_ENTRY}"
target_jar=${shQuote(targetJar)}
config_file=${shQuote(configFile)}
launcher=${shQuote(launcher)}
log_file=${shQuote(logFile)}
unit_file=${shQuote(unitFile)}

if [ -L "$project_root" ]; then
  echo "KURULUM BASARISIZ: proje kok dizini sembolik bag olamaz: $project_root" >&2
  exit 1
fi
if [ -e "$project_root" ] && [ ! -d "$project_root" ]; then
  echo "KURULUM BASARISIZ: proje kok yolu bir dizin degil: $project_root" >&2
  exit 1
fi
if [ ! -d "$project_root" ]; then
  install -d -m 0755 "$project_root"
  echo "Proje kok dizini olusturuldu: $project_root"
fi
if [ ! -f "$source_jar" ]; then echo "KURULUM BASARISIZ: Agent JAR dosyasi kurulum betigiyle ayni klasorde olmali." >&2; exit 1; fi
if [ ! -f "$source_config" ]; then echo "KURULUM BASARISIZ: ${CONFIG_ENTRY} kurulum betigiyle ayni klasorde olmali." >&2; exit 1; fi
if ! command -v java >/dev/null 2>&1; then echo "KURULUM BASARISIZ: Java 17+ bulunamadi." >&2; exit 1; fi
if ! command -v systemctl >/dev/null 2>&1; then echo "KURULUM BASARISIZ: systemd/systemctl bulunamadi." >&2; exit 1; fi

systemctl stop ${shQuote(serviceName)} 2>/dev/null || true
install -d -m 0700 "$install_dir"
install -m 0600 "$source_jar" "$target_jar"
install -m 0600 "$source_config" "$config_file"
touch "$log_file"
chmod 0600 "$log_file"
cat > "$launcher" <<'IDP_LAUNCHER'
#!/bin/sh
exec java -jar ${shQuote(targetJar)} --config=${shQuote(configFile)} >> ${shQuote(logFile)} 2>&1
IDP_LAUNCHER
chmod 0700 "$launcher"

cat > "$unit_file" <<'IDP_UNIT'
[Unit]
Description=IDP deployment agent ${agentId}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${systemdQuote(installDir)}
ExecStart=/bin/sh ${systemdQuote(launcher)}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
IDP_UNIT
chmod 0600 "$unit_file"
systemctl daemon-reload
systemctl enable --now ${shQuote(serviceName)}
echo "IDP Agent kuruldu: $install_dir"
echo "Servis: ${serviceName}"
echo "Log: $log_file"
`;
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
 * Everything in memory: config-less JAR + external application.yml + installer → ZIP bytes.
 * @returns {Buffer}
 */
function packageAgent({ jarBuffer, value, credentials }) {
  const jar = new AdmZip(jarBuffer);
  if (jar.getEntry(CONFIG_ENTRY)) jar.deleteFile(CONFIG_ENTRY);
  const config = Buffer.from(createConfig(value, credentials), 'utf8');
  const jarFileName = `idp-agent-${value.agentId}.jar`;
  const zip = new AdmZip();
  zip.addFile(jarFileName, jar.toBuffer());
  zip.addFile(CONFIG_ENTRY, config);
  if (/^[A-Za-z]:[\\/]/.test(value.deployBasePath)) {
    const installerFileName = `install-idp-agent-${value.agentId}.ps1`;
    zip.addFile(installerFileName, Buffer.from(createWindowsInstaller(value.agentId, jarFileName, credentials.gatewayUrl, {
      proxy: value.proxy,
      deployBasePath: value.deployBasePath,
    }), 'utf8'));
  } else {
    const installerFileName = `install-idp-agent-${value.agentId}.sh`;
    zip.addFile(installerFileName, Buffer.from(createLinuxInstaller(value.agentId, jarFileName, {
      deployBasePath: value.deployBasePath,
    }), 'utf8'));
  }
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
  createLinuxInstaller,
  gatewayEndpoint,
  packageAgent,
  resolveMavenExecutable,
  yamlString,
};
