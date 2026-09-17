'use strict';

/**
 * Tests for agentBuilder.js — plain Node, no Electron window, no Maven, no network:
 *   node --test desktop/main/agentBuilder.test.js
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const {
  buildAgentJar,
  validateInput,
  validateCredentials,
  createConfig,
  createWindowsInstaller,
  createLinuxInstaller,
  gatewayEndpoint,
  packageAgent,
  yamlString,
} = require('./agentBuilder');

// Real YAML parse: js-yaml is a transitive devDependency (electron-builder) — optional, not a declared dep.
let yaml = null;
try { yaml = require('js-yaml'); } catch { yaml = null; }

const AGENT_ID = 'WIN-PROD-01';
const SECRET = 'agt_S3cr3t"quote\\back:#slash';
const CF_ID = 'cf-client-id.access';
const CF_SECRET = 'cf-client-secret-0123456789abcdef';
const baseInput = {
  agentId: AGENT_ID,
  workingDirectory: 'C:\\Uygulamalar\\Ödeme "API"',
  deployBasePath: 'C:\\inetpub\\wwwroot\\jetsrm',
  logLevel: 'INFO',
};
const response = (overrides = {}) => ({
  agentId: AGENT_ID,
  secret: SECRET,
  gatewayUrl: 'wss://agent-gw.example.com',
  cfAccess: null,
  ...overrides,
});
const withCf = () => response({ cfAccess: { clientId: CF_ID, clientSecret: CF_SECRET } });

test('application.yml: agent-secret instead of the shared token; CF Access and proxy only when given', () => {
  const plain = createConfig(validateInput(baseInput), validateCredentials(response(), AGENT_ID));
  assert.match(plain, /^ {2}url: "wss:\/\/agent-gw\.example\.com"$/m);
  assert.match(plain, /^ {2}agent-secret: /m);
  assert.doesNotMatch(plain, /token/);
  assert.doesNotMatch(plain, /cf-access-client/);
  assert.doesNotMatch(plain, /proxy/);

  const full = createConfig(validateInput({ ...baseInput, proxy: 'proxy.corp.local:8080' }), validateCredentials(withCf(), AGENT_ID));
  assert.match(full, new RegExp(`^ {2}cf-access-client-id: "${CF_ID.replace(/\./g, '\\.')}"$`, 'm'));
  assert.match(full, new RegExp(`^ {2}cf-access-client-secret: "${CF_SECRET}"$`, 'm'));
  assert.match(full, /^ {2}proxy: "proxy\.corp\.local:8080"$/m);
  assert.match(full, /^agent:\n {2}id: "WIN-PROD-01"$/m);
  assert.match(full, /^application:\n {2}working-directory: /m);
});

test('application.yml parses back to the exact values (quotes, backslashes, Turkish characters)', (t) => {
  if (!yaml) return t.skip('backend/node_modules/js-yaml yok');
  const value = validateInput({ ...baseInput, proxy: '[fd00::1]:3128' });
  const parsed = yaml.load(createConfig(value, validateCredentials(withCf(), AGENT_ID)));
  assert.equal(parsed.server.url, 'wss://agent-gw.example.com');
  assert.equal(parsed.server['agent-secret'], SECRET);
  assert.equal(parsed.server['cf-access-client-id'], CF_ID);
  assert.equal(parsed.server['cf-access-client-secret'], CF_SECRET);
  assert.equal(parsed.server.proxy, '[fd00::1]:3128');
  assert.equal(parsed.server.token, undefined);
  assert.equal(parsed.agent.id, AGENT_ID);
  assert.equal(parsed.application['working-directory'], baseInput.workingDirectory);
  assert.equal(parsed.logging.level, 'INFO');
});

test('yamlString escapes controls and YAML 1.1 line breaks; output is JSON-compatible', () => {
  const tricky = 'a\u2028b\u2029c\u0085d\ne\tf"g\\h\u0001i\ufeffj';
  const quoted = yamlString(tricky);
  assert.doesNotMatch(quoted, /[\u0000-\u001f\u0085\u2028\u2029\ufeff]/);
  assert.equal(JSON.parse(quoted), tricky);
  assert.equal(yamlString('Ödeme: #1'), '"Ödeme: #1"');
  assert.throws(() => yamlString('lone \ud800 surrogate'), /Unicode/);
});

test('validateInput: contract ID format, optional proxy, legacy token/serverUrl ignored', () => {
  const ok = validateInput({ ...baseInput, gatewayToken: 'legacy', serverUrl: 'ws://legacy' });
  assert.deepEqual(Object.keys(ok).sort(), ['agentId', 'deployBasePath', 'keepReleases', 'logLevel', 'nssmPath', 'proxy', 'workingDirectory']);
  assert.equal(ok.proxy, null);
  assert.equal(ok.deployBasePath, 'C:\\inetpub\\wwwroot\\jetsrm');
  assert.equal(ok.keepReleases, 3);
  assert.equal(validateInput({ ...baseInput, agentId: `A${'b'.repeat(127)}` }).agentId.length, 128);
  assert.throws(() => validateInput({ ...baseInput, agentId: `A${'b'.repeat(128)}` }), /en fazla 128/);
  assert.throws(() => validateInput({ ...baseInput, agentId: '-bad' }), /Agent kimliği/);
  assert.throws(() => validateInput({ ...baseInput, agentId: 'ab' }), /Agent kimliği/);
  assert.throws(() => validateInput({ ...baseInput, workingDirectory: 'C:\\a\nb' }), /kontrol karakteri/);
  assert.equal(validateInput({ ...baseInput, proxy: ' 10.0.0.9:3128 ' }).proxy, '10.0.0.9:3128');
  assert.equal(validateInput({ ...baseInput, proxy: '[fd00::1]:3128' }).proxy, '[fd00::1]:3128');
  for (const proxy of ['http://proxy:8080', 'proxy', 'proxy:0', 'proxy:70000', 'a..b:80', 'proxy:80 x']) {
    assert.throws(() => validateInput({ ...baseInput, proxy }), /host:port/, proxy);
  }
});

test('validateInput: optional nssm path must be an absolute Windows path to an .exe', () => {
  assert.equal(validateInput(baseInput).nssmPath, null);
  assert.equal(validateInput({ ...baseInput, nssmPath: '   ' }).nssmPath, null);
  assert.equal(
    validateInput({ ...baseInput, nssmPath: ' C:\\tools\\nssm\\win64\\nssm.exe ' }).nssmPath,
    'C:\\tools\\nssm\\win64\\nssm.exe',
  );
  assert.equal(validateInput({ ...baseInput, nssmPath: 'D:/ops/NSSM.EXE' }).nssmPath, 'D:/ops/NSSM.EXE');
  assert.throws(() => validateInput({ ...baseInput, nssmPath: 'nssm' }), /mutlak bir Windows yolu/);
  assert.throws(() => validateInput({ ...baseInput, nssmPath: '/usr/bin/nssm' }), /mutlak bir Windows yolu/);
  assert.throws(() => validateInput({ ...baseInput, nssmPath: 'C:\\tools\\nssm' }), /nssm\.exe/);
  assert.throws(() => validateInput({ ...baseInput, nssmPath: 'C:\\tools\\..\\nssm.exe' }), /'\.' veya '\.\.'/);
  assert.throws(() => validateInput({ ...baseInput, nssmPath: 'C:\\tools\\ns\nsm.exe' }), /kontrol karakteri/);
});

test('validateInput: deploy base path must be absolute (Windows drive or POSIX), keep-releases 1-20', () => {
  assert.equal(validateInput({ ...baseInput, deployBasePath: ' C:\\inetpub\\wwwroot\\jetsrm\\ ' }).deployBasePath, 'C:\\inetpub\\wwwroot\\jetsrm');
  assert.equal(validateInput({ ...baseInput, deployBasePath: 'D:/apps/Ödeme Portalı' }).deployBasePath, 'D:/apps/Ödeme Portalı');
  assert.equal(validateInput({ ...baseInput, deployBasePath: '/var/www/jetsrm/' }).deployBasePath, '/var/www/jetsrm');
  assert.throws(() => validateInput({ ...baseInput, deployBasePath: '   ' }), /zorunludur/);
  assert.equal(
    validateInput({ agentId: AGENT_ID, workingDirectory: 'C:\\inetpub\\wwwroot\\legacy-project', logLevel: 'INFO' }).deployBasePath,
    'C:\\inetpub\\wwwroot\\legacy-project',
  );
  const badPaths = [
    ['inetpub\\wwwroot\\jetsrm', /mutlak/],
    ['.\\jetsrm', /mutlak/],
    ['\\\\fileserver\\share\\jetsrm', /mutlak/],
    ['//fileserver/share', /mutlak/],
    ['C:\\', /kökü/],
    ['/', /kökü/],
    ['C:\\inetpub\\..\\Windows', /'\.\.'/],
    ['/var/www/./x', /'\.\.'/],
    ['C:\\inetpub\\site:stream', /':'/],
    ['C:\\inet"pub', /geçersiz karakter/],
    ['C:\\inetpub\n\\x', /kontrol karakteri/],
    [`C:\\${'a'.repeat(300)}`, /260/],
  ];
  for (const [deployBasePath, pattern] of badPaths) {
    assert.throws(() => validateInput({ ...baseInput, deployBasePath }), pattern, deployBasePath);
  }
  assert.equal(validateInput({ ...baseInput, keepReleases: '5' }).keepReleases, 5);
  assert.equal(validateInput({ ...baseInput, keepReleases: 20 }).keepReleases, 20);
  assert.equal(validateInput({ ...baseInput, keepReleases: '' }).keepReleases, 3);
  for (const keepReleases of [0, 21, 1.5, 'x', -1]) {
    assert.throws(() => validateInput({ ...baseInput, keepReleases }), /1-20/, String(keepReleases));
  }
});

test('application.yml: required deploy base path is preserved for Windows and Linux', () => {
  const credentials = validateCredentials(response(), AGENT_ID);
  const config = createConfig(validateInput({ ...baseInput, deployBasePath: 'C:\\inetpub\\wwwroot\\jetsrm', keepReleases: 4 }), credentials);
  assert.match(config, /^deploy:\n {2}base-path: "C:\\\\inetpub\\\\wwwroot\\\\jetsrm"\n {2}keep-releases: 4$/m);
  if (yaml) {
    const parsed = yaml.load(config);
    assert.equal(parsed.deploy['base-path'], 'C:\\inetpub\\wwwroot\\jetsrm');
    assert.equal(parsed.deploy['keep-releases'], 4);
    assert.equal(parsed.application['working-directory'], baseInput.workingDirectory);
  }
  const linuxConfig = createConfig(validateInput({ ...baseInput, deployBasePath: '/var/www/başka-proje' }), credentials);
  assert.match(linuxConfig, /^deploy:\n {2}base-path: "\/var\/www\/başka-proje"$/m);
  if (yaml) assert.equal(yaml.load(linuxConfig).deploy['base-path'], '/var/www/başka-proje');
});

test('application.yml: nssm-path is written only when given', () => {
  const credentials = validateCredentials(response(), AGENT_ID);
  // Without it the agent falls back to a bare `nssm` on PATH, which is exactly
  // the "CreateProcess error=2" failure this field exists to prevent.
  assert.equal(/nssm-path/.test(createConfig(validateInput(baseInput), credentials)), false);

  const config = createConfig(
    validateInput({ ...baseInput, nssmPath: 'C:\\tools\\nssm\\win64\\nssm.exe' }),
    credentials,
  );
  assert.match(config, /^ {2}nssm-path: "C:\\\\tools\\\\nssm\\\\win64\\\\nssm\.exe"$/m);
  if (yaml) assert.equal(yaml.load(config).deploy['nssm-path'], 'C:\\tools\\nssm\\win64\\nssm.exe');
});

test('validateCredentials rejects bad responses without echoing their values', () => {
  const leaky = 'do not echo me';
  const cases = [
    [response({ secret: leaky }), /secret/],
    [response({ secret: '' }), /secret/],
    [response({ agentId: 'OTHER-01' }), /başka bir agent/],
    [response({ gatewayUrl: 'https://agent-gw.example.com' }), /ws: veya wss:/],
    [response({ gatewayUrl: 'wss://user:pw@agent-gw.example.com' }), /kullanıcı adı veya parola/],
    [response({ cfAccess: { clientId: CF_ID } }), /cfAccess\.clientSecret/],
    [response({ cfAccess: 'yes' }), /cfAccess/],
    [null, /geçersiz/],
  ];
  for (const [raw, pattern] of cases) {
    assert.throws(() => validateCredentials(raw, AGENT_ID), (err) => pattern.test(err.message) && !err.message.includes(leaky));
  }
  assert.equal(validateCredentials(response({ gatewayUrl: 'wss://agent-gw.example.com/' }), AGENT_ID).gatewayUrl, 'wss://agent-gw.example.com');
});

test('gatewayEndpoint: wss -> 443, ws -> explicit port or 80', () => {
  assert.deepEqual(gatewayEndpoint('wss://agent-gw.example.com'), { host: 'agent-gw.example.com', port: 443 });
  assert.deepEqual(gatewayEndpoint('wss://agent-gw.example.com:8443/agent'), { host: 'agent-gw.example.com', port: 8443 });
  assert.deepEqual(gatewayEndpoint('ws://10.0.0.5'), { host: '10.0.0.5', port: 80 });
  assert.deepEqual(gatewayEndpoint('ws://10.0.0.5:8081'), { host: '10.0.0.5', port: 8081 });
  assert.deepEqual(gatewayEndpoint('ws://[fd00::5]:8081'), { host: 'fd00::5', port: 8081 });
});

test('installer: project-local files, IIS/ACL protection, Java 17, reachability and handshake hint', () => {
  const script = createWindowsInstaller(AGENT_ID, 'idp-agent-WIN-PROD-01.jar', 'wss://agent-gw.example.com', {
    deployBasePath: baseInput.deployBasePath,
  });
  assert.match(script, /^[\t\n\r\x20-\x7e]*$/, 'ASCII only');

  // Structure: elevation first, then the whole body in try/catch/finally.
  assert.match(script, /^param\(\)\n\$ErrorActionPreference = 'Stop'\n/);
  assert.match(script, /\ntry \{\n[\s\S]*\n\} catch \{\n {2}\$exitCode = 1\n[\s\S]*-ForegroundColor Red[\s\S]*\n\} finally \{\n[\s\S]*Read-Host 'Kapatmak icin Enter'[\s\S]*\n\}\nexit \$exitCode\n$/);
  assert.match(script, /\$installLog = Join-Path \$installDir 'install\.log'/);
  assert.match(script, /Start-Transcript -LiteralPath \$installLog -Append/);
  assert.match(script, /Stop-Transcript/);

  // Agent files live beside the project, never under ProgramData. The installer creates a missing base path.
  assert.match(script, /\$projectRoot = 'C:\\inetpub\\wwwroot\\jetsrm'/);
  assert.match(script, /\$installDir = Join-Path \$projectRoot 'agent'/);
  assert.match(script, /if \(Test-Path -LiteralPath \$projectRoot\) \{/);
  assert.match(script, /New-Item -ItemType Directory -Path \$projectRoot -Force/);
  assert.match(script, /Proje kok dizini olusturuldu/);
  assert.match(script, /Proje kok yolu bir dizin degil/);
  assert.match(script, /Agent dizini reparse point olamaz/);
  assert.doesNotMatch(script, /\$env:ProgramData/);

  // External config is copied beside the JAR and explicitly passed to the agent.
  assert.match(script, /Copy-Item -LiteralPath \$sourceConfig -Destination \$configFile -Force/);
  assert.match(script, /--config=__IDP_CONFIG__/);

  // Defense in depth under IIS: deny-all web.config plus SYSTEM/Administrators-only ACL.
  assert.match(script, /<add accessType="Deny" users="\*" \/>/);
  assert.match(script, /icacls\.exe \$installDir \/inheritance:r \/grant:r '\*S-1-5-18:\(OI\)\(CI\)F' '\*S-1-5-32-544:\(OI\)\(CI\)F'/);
  assert.match(script, /Agent dizini ACL korumasi uygulanamadi/);
  assert.ok(script.indexOf('icacls.exe $installDir') < script.indexOf('Copy-Item -LiteralPath $sourceConfig'), 'ACL precedes secret config copy');

  // Java >= 17, stderr-safe under PS 5.1, 1.x aware.
  assert.match(script, /\$ErrorActionPreference = 'Continue'\n {2}try \{\n {4}\$javaVersionText = \(& \$java -version 2>&1[\s\S]*\} finally \{\n {4}\$ErrorActionPreference = \$previousPreference/);
  assert.ok(script.includes(`-match 'version "(\\d+)(\\.(\\d+))?'`));
  assert.match(script, /if \(\$javaMajor -eq 1 -and \$Matches\[3\]\) \{ \$javaMajor = \[int\]\$Matches\[3\] \}/);
  assert.match(script, /if \(\$javaMajor -lt 17\)/);
  assert.match(script, /'Java 17\+ gerekli, bulunan: '/);

  // Launcher: no trust-store override (it would replace the JDK cacerts; the agent combines cacerts + Windows-ROOT itself).
  assert.match(script, /\n& '__IDP_JAVA__' -jar '__IDP_JAR__' '--config=__IDP_CONFIG__' \*>> '__IDP_LOG__'\nexit \$LASTEXITCODE\n'@\n/);
  assert.doesNotMatch(script, /Windows-ROOT/);
  assert.doesNotMatch(script, /javax\.net\.ssl/);

  // Reachability: TCP with 5 s timeout, yellow warning, does not throw.
  assert.match(script, /WaitOne\(5000, \$false\)/);
  assert.match(script, /if \(Test-TcpEndpoint 'agent-gw\.example\.com' 443\) \{/);
  assert.match(script, /Gateway''e erisilemiyor: agent-gw\.example\.com:443 - ag\/proxy\/firewall kontrol edin'\) -ForegroundColor Yellow/);
  assert.doesNotMatch(script, /Proxy erisilebilir/);

  // Scheduled task runs in the install dir (relative logs\ must not land in System32).
  assert.match(script, /\$action = New-ScheduledTaskAction -Execute 'powershell\.exe' -Argument \([^\n]*\) -WorkingDirectory \$installDir\n/);

  // Handshake hint after start, 20 s, non-fatal.
  assert.match(script, /Start-ScheduledTask -TaskName \$taskName[\s\S]*AddSeconds\(20\)[\s\S]*-Pattern 'Handshake onaylan'/);
  assert.match(script, /'Agent gateway''e baglandi\.' -ForegroundColor Green/);
  assert.match(script, /\('Henuz baglanmadi, log: ' \+ \$logFile\) -ForegroundColor Yellow/);

  // Cheap structural sanity (no PowerShell parser on macOS/Linux CI).
  const count = (ch) => script.split(ch).length - 1;
  assert.equal(count('{'), count('}'), 'braces balanced');
  assert.equal(count('('), count(')'), 'parentheses balanced');
  assert.equal(count("@'\n"), 2);
  assert.equal(count("\n'@\n"), 2);
});

test('installer: ws port, IPv6, IDN host and proxy check', () => {
  const options = { deployBasePath: baseInput.deployBasePath };
  assert.match(createWindowsInstaller(AGENT_ID, 'a.jar', 'ws://10.0.0.5:8081/agent', options), /Test-TcpEndpoint '10\.0\.0\.5' 8081/);
  assert.match(createWindowsInstaller(AGENT_ID, 'a.jar', 'ws://gw.local', options), /Test-TcpEndpoint 'gw\.local' 80/);
  assert.match(createWindowsInstaller(AGENT_ID, 'a.jar', 'wss://[fd00::5]', options), /Test-TcpEndpoint 'fd00::5' 443/);
  const idn = createWindowsInstaller(AGENT_ID, 'a.jar', 'wss://büro.example.com', options);
  assert.match(idn, /Test-TcpEndpoint 'xn--bro-hoa\.example\.com' 443/);
  assert.match(idn, /^[\t\n\r\x20-\x7e]*$/);
  const proxied = createWindowsInstaller(AGENT_ID, 'a.jar', 'wss://agent-gw.example.com', { ...options, proxy: 'proxy.corp.local:8080' });
  assert.match(proxied, /if \(Test-TcpEndpoint 'proxy\.corp\.local' 8080\) \{/);
  assert.match(proxied, /Proxy''e erisilemiyor: proxy\.corp\.local:8080/);
  assert.throws(() => createWindowsInstaller("bad'id", 'a.jar', 'wss://agent-gw.example.com', options), /geçersiz/);
  assert.throws(() => createWindowsInstaller(AGENT_ID, 'a.jar', 'wss://agent-gw.example.com'), /zorunludur/);
  assert.throws(() => createWindowsInstaller(AGENT_ID, 'a.jar', 'wss://agent-gw.example.com', { deployBasePath: '/var/www/jetsrm' }), /Windows/);
});

test('linux installer uses <basePath>/agent with external config and a systemd service', () => {
  const script = createLinuxInstaller(AGENT_ID, 'idp-agent-WIN-PROD-01.jar', { deployBasePath: '/var/www/jetsrm' });
  assert.match(script, /project_root='\/var\/www\/jetsrm'/);
  assert.match(script, /install_dir='\/var\/www\/jetsrm\/agent'/);
  assert.match(script, /--config='\/var\/www\/jetsrm\/agent\/application\.yml'/);
  assert.match(script, /WorkingDirectory="\/var\/www\/jetsrm\/agent"/);
  assert.match(script, /ExecStart=\/bin\/sh "\/var\/www\/jetsrm\/agent\/run-agent\.sh"/);
  assert.match(script, /systemctl enable --now 'idp-agent-WIN-PROD-01'/);
  assert.match(script, /if \[ ! -d "\$project_root" \]; then\n {2}install -d -m 0755 "\$project_root"/);
  assert.match(script, /Proje kok dizini olusturuldu/);
  assert.match(script, /proje kok dizini sembolik bag olamaz/);
  assert.match(script, /install -d -m 0700/);
  assert.throws(() => createLinuxInstaller(AGENT_ID, 'a.jar', { deployBasePath: 'C:\\inetpub\\wwwroot\\jetsrm' }), /Linux/);
});

test('Linux base path produces a Linux package with the exact target in application.yml', () => {
  const sourceJar = new AdmZip();
  sourceJar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
  const archive = packageAgent({
    jarBuffer: sourceJar.toBuffer(),
    value: validateInput({ ...baseInput, deployBasePath: '/var/www/jetsrm' }),
    credentials: validateCredentials(response(), AGENT_ID),
  });
  const zip = new AdmZip(archive);
  assert.deepEqual(zip.getEntries().map((entry) => entry.entryName).sort(), [
    'application.yml',
    'idp-agent-WIN-PROD-01.jar',
    'install-idp-agent-WIN-PROD-01.sh',
  ]);
  assert.match(zip.readAsText('application.yml'), /^ {2}base-path: "\/var\/www\/jetsrm"$/m);
  assert.match(zip.readAsText('install-idp-agent-WIN-PROD-01.sh'), /install_dir='\/var\/www\/jetsrm\/agent'/);
});

async function makeFakeJar(buildRoot) {
  const jar = new AdmZip();
  jar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nMain-Class: com.idp.agent.Starter\n'));
  // A stale developer config baked in by the build must be replaced, not duplicated.
  jar.addFile('application.yml', Buffer.from('server:\n  token: "stale-dev-token"\n'));
  const target = path.join(buildRoot, 'target');
  await fs.mkdir(target, { recursive: true });
  const jarPath = path.join(target, 'idp-agent-1.0.0.jar');
  jar.writeZip(jarPath);
  return jarPath;
}

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'idp-agent-builder-test-'));
  const tmpDir = path.join(dir, 'tmp');
  await fs.mkdir(tmpDir);
  try {
    return await fn({ dir, tmpDir, zipPath: path.join(dir, 'out', 'idp-agent.zip') });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('buildAgentJar: secret only inside the ZIP, never in the result; credentials issued after the build', () => withTempDir(async ({ tmpDir, zipPath }) => {
  await fs.mkdir(path.dirname(zipPath));
  const calls = [];
  const result = await buildAgentJar({ ...baseInput, proxy: 'proxy.corp.local:8080', gatewayToken: 'legacy' }, {
    showSaveDialog: async () => { calls.push('dialog'); return { canceled: false, filePath: zipPath }; },
    buildJar: async (root) => { calls.push('build'); return makeFakeJar(root); },
    issueCredentials: async (id) => { calls.push(`credentials:${id}`); return withCf(); },
    tmpDir,
  });

  assert.deepEqual(calls, ['dialog', 'build', `credentials:${AGENT_ID}`]);
  assert.deepEqual(Object.keys(result).sort(), ['canceled', 'cfAccess', 'filePath', 'gatewayUrl', 'sha256']);
  assert.equal(result.canceled, false);
  assert.equal(result.filePath, zipPath);
  assert.equal(result.gatewayUrl, 'wss://agent-gw.example.com');
  assert.equal(result.cfAccess, true);
  const serialized = JSON.stringify(result);
  for (const value of [SECRET, CF_SECRET, CF_ID]) assert.ok(!serialized.includes(value), 'no credential in the renderer result');

  const bytes = await fs.readFile(zipPath);
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase());
  if (process.platform !== 'win32') assert.equal((await fs.stat(zipPath)).mode & 0o777, 0o600);

  const outer = new AdmZip(zipPath);
  assert.deepEqual(outer.getEntries().map((entry) => entry.entryName).sort(), ['application.yml', 'idp-agent-WIN-PROD-01.jar', 'install-idp-agent-WIN-PROD-01.ps1']);
  const jar = new AdmZip(outer.readFile('idp-agent-WIN-PROD-01.jar'));
  assert.equal(jar.getEntries().filter((entry) => entry.entryName === 'application.yml').length, 0);
  assert.ok(jar.getEntry('META-INF/MANIFEST.MF'));
  const config = outer.readAsText('application.yml');
  assert.ok(config.includes(`agent-secret: ${yamlString(SECRET)}`));
  assert.ok(config.includes('proxy: "proxy.corp.local:8080"'));
  assert.doesNotMatch(config, /token/);
  const installer = outer.readAsText('install-idp-agent-WIN-PROD-01.ps1');
  assert.ok(!installer.includes(SECRET) && !installer.includes(CF_SECRET));
  assert.match(installer, /Test-TcpEndpoint 'agent-gw\.example\.com' 443/);
  assert.match(installer, /\$installDir = Join-Path \$projectRoot 'agent'/);

  assert.deepEqual(await fs.readdir(tmpDir), [], 'build directory removed');
}));

test('buildAgentJar: cancelled dialog or failed build never requests (= rotates) credentials', () => withTempDir(async ({ tmpDir, zipPath }) => {
  let issued = 0;
  const issueCredentials = async () => { issued += 1; return response(); };

  const cancelled = await buildAgentJar(baseInput, {
    showSaveDialog: async () => ({ canceled: true }),
    buildJar: async () => { throw new Error('must not build'); },
    issueCredentials,
    tmpDir,
  });
  assert.deepEqual(cancelled, { canceled: true });

  await assert.rejects(buildAgentJar(baseInput, {
    showSaveDialog: async () => ({ canceled: false, filePath: zipPath }),
    buildJar: async (root) => { await fs.mkdir(root, { recursive: true }); throw new Error('Agent JAR derlenemedi: boom'); },
    issueCredentials,
    tmpDir,
  }), /derlenemedi: boom/);

  assert.equal(issued, 0);
  assert.deepEqual(await fs.readdir(tmpDir), []);
}));

test('buildAgentJar: invalid credential response writes nothing and does not echo it; issuer is mandatory', () => withTempDir(async ({ tmpDir, zipPath }) => {
  await fs.mkdir(path.dirname(zipPath));
  const deps = {
    showSaveDialog: async () => ({ canceled: false, filePath: zipPath }),
    buildJar: makeFakeJar,
    tmpDir,
  };
  await assert.rejects(
    buildAgentJar(baseInput, { ...deps, issueCredentials: async () => response({ gatewayUrl: `https://${SECRET}` }) }),
    (err) => /gateway adresi/.test(err.message) && !err.message.includes(SECRET),
  );
  await assert.rejects(fs.access(zipPath));
  await assert.rejects(buildAgentJar(baseInput, deps), /yapılandırılmamış/);
}));
