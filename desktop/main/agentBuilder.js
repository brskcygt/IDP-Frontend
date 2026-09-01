'use strict';

const { app, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

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
  return parsed.toString().replace(/\/$/, '');
}

function yamlString(value) {
  return JSON.stringify(value);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Agent bilgileri geçersiz.');
  const agentId = required(input.agentId, 'Agent kimliği', 64);
  if (!AGENT_ID.test(agentId)) throw new Error('Agent kimliği 3-64 karakter olmalı; yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.');
  return {
    agentId,
    serverUrl: webUrl(input.serverUrl, 'IDP WebSocket adresi', ['ws:', 'wss:']),
    gatewayToken: String(input.gatewayToken || '').trim(),
    workingDirectory: required(input.workingDirectory, 'Repository dizini'),
    logLevel: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].includes(input.logLevel) ? input.logLevel : 'INFO',
  };
}

function createConfig(value) {
  return `server:\n  url: ${yamlString(value.serverUrl)}\n  token: ${yamlString(value.gatewayToken)}\n\nagent:\n  id: ${yamlString(value.agentId)}\n  service-name: "idp-agent"\n  version: "1.0.0"\n\nlogging:\n  level: ${value.logLevel}\n\napplication:\n  working-directory: ${yamlString(value.workingDirectory)}\n`;
}

function createWindowsInstaller(agentId, jarFileName) {
  const taskName = `IDP-Agent-${agentId}`;
  return `param()
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
  exit
}
$sourceJar = Join-Path $PSScriptRoot '${jarFileName}'
if (-not (Test-Path -LiteralPath $sourceJar)) { throw 'Agent JAR dosyasi kurulum betigiyle ayni klasorde olmali.' }
$java = (Get-Command java.exe -ErrorAction Stop).Source
$installDir = Join-Path $env:ProgramData 'IDP\\Agent\\${agentId}'
$targetJar = Join-Path $installDir 'idp-agent.jar'
$launcher = Join-Path $installDir 'run-agent.ps1'
$logFile = Join-Path $installDir 'agent.log'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $sourceJar -Destination $targetJar -Force
$launchContent = @'
& '__IDP_JAVA__' -jar '__IDP_JAR__' *>> '__IDP_LOG__'
exit $LASTEXITCODE
'@
$launchContent = $launchContent.Replace('__IDP_JAVA__', $java).Replace('__IDP_JAR__', $targetJar).Replace('__IDP_LOG__', $logFile)
Set-Content -LiteralPath $launcher -Value $launchContent -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"')
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description 'IDP deployment agent - automatic startup and reconnect' -Force | Out-Null
Start-ScheduledTask -TaskName '${taskName}'
Write-Host 'IDP Agent kuruldu ve arka planda baslatildi.' -ForegroundColor Green
Write-Host ('Gorev: ${taskName}')
Write-Host ('Dizin: ' + $installDir)
Write-Host ('Log: ' + $logFile)
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

async function buildAgentJar(input) {
  const value = validateInput(input);
  const destination = await dialog.showSaveDialog({
    title: 'IDP Agent kurulum paketini kaydet',
    defaultPath: `idp-agent-${value.agentId}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (destination.canceled || !destination.filePath) return { canceled: true };

  const buildRoot = path.join(os.tmpdir(), `idp-agent-build-${crypto.randomUUID()}`);
  try {
    await fs.cp(templateRoot(), buildRoot, { recursive: true });
    await fs.writeFile(path.join(buildRoot, 'src', 'main', 'resources', 'application.yml'), createConfig(value), { encoding: 'utf8', mode: 0o600 });
    await runMaven(buildRoot);
    const jarPath = path.join(buildRoot, 'target', 'idp-agent-1.0.0.jar');
    const jarFileName = `idp-agent-${value.agentId}.jar`;
    const installerFileName = `install-idp-agent-${value.agentId}.ps1`;
    const zip = new AdmZip();
    zip.addLocalFile(jarPath, '', jarFileName);
    zip.addFile(installerFileName, Buffer.from(createWindowsInstaller(value.agentId, jarFileName), 'utf8'));
    await new Promise((resolve, reject) => zip.writeZip(destination.filePath, (error) => error ? reject(error) : resolve()));
    const bytes = await fs.readFile(destination.filePath);
    return { canceled: false, filePath: destination.filePath, sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase() };
  } finally {
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
}

module.exports = { buildAgentJar, validateInput, createConfig, createWindowsInstaller, resolveMavenExecutable };
