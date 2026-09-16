import type { Snippet } from './CodeBlock';

export type TroubleshootingCategory = 'network' | 'server' | 'build' | 'deploy' | 'app';

export type TroubleshootingEntry = {
  id: string;
  category: TroubleshootingCategory;
  /** Short question/title shown in the list. */
  title: string;
  /** Error text exactly as it appears on screen — also what search matches first. */
  symptoms: string[];
  /** Why it happens, in one or two sentences. */
  cause: string;
  /** Ordered fix steps; snippets below are the commands for them. */
  steps: string[];
  snippets?: Snippet[];
  /** Pitfall worth a warning box. */
  note?: string;
};

export const TROUBLESHOOTING_CATEGORIES: ReadonlyArray<{ id: TroubleshootingCategory; label: string }> = [
  { id: 'network', label: 'Bağlantı & firewall' },
  { id: 'server', label: 'Sunucu & kurulum' },
  { id: 'build', label: 'Jenkins & release' },
  { id: 'deploy', label: 'Deploy & agent' },
  { id: 'app', label: 'Arayüz' },
];

/**
 * Field-tested fixes for the problems hit while bringing up a Windows IDP
 * server (Oracle VM, public IP) with Jenkins on the same machine. Commands
 * target an elevated PowerShell on the IDP server unless the step says
 * otherwise. Keep placeholders in <ANGLE_BRACKETS>; never put real secrets here.
 */
export const TROUBLESHOOTING_ENTRIES: TroubleshootingEntry[] = [
  {
    id: 'server-unreachable',
    category: 'network',
    title: 'Uygulama IDP sunucusuna bağlanamıyor',
    symptoms: ['IDP sunucusuna ulaşılamadı: UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error (attempted address: <IP>:3001)'],
    cause: 'Sunucu çalışıyor ama 3001 dışarıya kapalı. install-idp-server.ps1 her çalıştığında Public profil kuralını silip yalnız -FirewallPublicRemoteAddress ile verilen IP’lere yeniden açar; parametre verilmezse port dışarıya kapanır.',
    steps: [
      'RDP ile sunucuya bağlan; RDP açılıyorsa VM ayakta demektir.',
      'Ağ profilini ve IDP kurallarını kontrol et; profil Public ise “[Public, kisitli]” kuralı olmalı.',
      'Kurulum betiğini izinli IP’lerle yeniden çalıştır (IP listesinde boşluk olmasın).',
      'Oracle Cloud Security List / NSG’de 3001 ve 7003 için ingress kuralı olduğundan emin ol.',
    ],
    snippets: [
      {
        label: 'Kontrol',
        value: 'Get-NetConnectionProfile | Select InterfaceAlias, NetworkCategory\nGet-NetFirewallRule -DisplayName \'IDP*\' | Select DisplayName, Profile, Enabled\nTest-NetConnection 127.0.0.1 -Port 3001 | Select TcpTestSucceeded',
      },
      {
        label: 'Kalıcı düzeltme',
        value: 'cd C:\\IDP\\idp-server\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\deploy\\windows\\install-idp-server.ps1 `\n  -RepoPath C:\\IDP\\idp-server -DataDir C:\\ProgramData\\IDP\\Server `\n  -FirewallPublicRemoteAddress "<MAC_IP>,<AGENT_IP>"',
      },
    ],
    note: 'Betiği her güncellemede aynı -FirewallPublicRemoteAddress listesiyle çalıştır; unutursan portlar yine kapanır.',
  },
  {
    id: 'installer-data-dir-shift',
    category: 'server',
    title: 'Kurulumdan sonra projeler/kullanıcılar kayboldu',
    symptoms: ['Veri    : C:\\IDP\\idp-server\\<IP>', 'Kural: ... [Public, sadece: <tek IP>]'],
    cause: '-FirewallPublicRemoteAddress listesine virgülden sonra boşluk yazılınca (a, b) powershell.exe -File ikinci IP’yi ayrı argüman sayar ve sıradaki parametreye, veri dizinine bağlar. Backend boş bir veri klasörüyle açılır. Gerçek veri C:\\ProgramData\\IDP\\Server altında durur.',
    steps: [
      'Betiği boşluksuz, tırnaklı IP listesi ve açık -DataDir ile yeniden çalıştır.',
      'Çıktıda “Veri : C:\\ProgramData\\IDP\\Server” satırını doğrula.',
      'Arayüzde projelerin geri geldiğini gördükten sonra yanlış oluşan klasörü sil.',
    ],
    snippets: [
      {
        label: 'Doğru veri diziniyle yeniden kur',
        value: 'cd C:\\IDP\\idp-server\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\deploy\\windows\\install-idp-server.ps1 `\n  -RepoPath C:\\IDP\\idp-server -DataDir C:\\ProgramData\\IDP\\Server `\n  -FirewallPublicRemoteAddress "<IP1>,<IP2>"',
      },
      { label: 'Yanlış klasörü temizle', value: 'Remove-Item C:\\IDP\\idp-server\\<IP> -Recurse -Force' },
    ],
    note: 'Boş veriyle çalışırken proje yeniden oluşturulduysa Project ID değişmiştir; Jenkins IDP_PROJECT_ID ve upload token’ı da yenile.',
  },
  {
    id: 'restart-backend',
    category: 'server',
    title: 'Backend / gateway nasıl yeniden başlatılır?',
    symptoms: ['.env değişikliği etkisiz', 'IDP_ARTIFACT_UPLOAD_TOKEN değişti ama upload 503'],
    cause: 'Backend ve gateway Windows servisi değil, idp-svc hesabıyla çalışan zamanlanmış görevdir. .env yalnız açılışta okunur.',
    steps: [
      'Görevi durdurup başlat.',
      'Portu ve logun son satırlarını kontrol et; uyarılar logda görünür.',
    ],
    snippets: [
      { label: 'Backend', value: 'Stop-ScheduledTask IDP-Backend; Start-ScheduledTask IDP-Backend\nStart-Sleep 5\nTest-NetConnection 127.0.0.1 -Port 3001 | Select TcpTestSucceeded\nGet-Content C:\\ProgramData\\IDP\\Server\\logs\\backend.log -Tail 8' },
      { label: 'Gateway', value: 'Stop-ScheduledTask IDP-Agent-Gateway; Start-ScheduledTask IDP-Agent-Gateway\nInvoke-RestMethod http://127.0.0.1:7003/health' },
    ],
  },
  {
    id: 'env-permission',
    category: 'server',
    title: 'backend\\.env açılmıyor',
    symptoms: ['You do not have permission to open this file', 'C:\\IDP\\idp-server\\backend\\.env'],
    cause: '.env sırlar içerdiği için yalnız SYSTEM, Administrators ve idp-svc okuyabilir. Normal açılan Notepad yetkisizdir. ACL’i genişletme.',
    steps: [
      'PowerShell’i “Run as administrator” ile aç ve Notepad’i oradan başlat.',
      'Sadece bir anahtarın dolu olup olmadığına bakacaksan değeri ekrana basmadan uzunluğunu kontrol et.',
      'Kaydettikten sonra backend’i yeniden başlat.',
    ],
    snippets: [
      { label: 'Yönetici olarak düzenle', value: 'notepad C:\\IDP\\idp-server\\backend\\.env' },
      {
        label: 'Değeri göstermeden kontrol et',
        value: "Select-String -Path C:\\IDP\\idp-server\\backend\\.env -Pattern '^(IDP_ARTIFACT_UPLOAD_TOKEN|IDP_PUBLIC_URL)=' |\n  ForEach-Object { $k,$v = $_.Line -split '=',2; \"{0} -> uzunluk {1}\" -f $k, $v.Length }",
      },
    ],
  },
  {
    id: 'settings-save-failed',
    category: 'app',
    title: 'Proje ayarları kaydedilmiyor',
    symptoms: ['Failed to update project settings', 'Invalid project settings.', 'No Jenkins URL configured — set it in project settings.'],
    cause: 'Kaydet, iki sekmedeki (General + Artifact Deploy) değişiklikleri birlikte gönderir; yarım bir Artifact Deploy bileşeni tüm kaydı reddettirir. Connection Test yalnız kayıtlı ayarları test eder, kayıt olmadıysa URL’yi göremez.',
    steps: [
      'Hata bildirimindeki alan yoluna bak (örn. artifactDeploy.components.0.name).',
      'Cancel ile kapatıp yeniden aç; önce yalnız General Settings’i kaydet, sonra Artifact Deploy’u ayrı kaydet.',
      'Component Name: küçük harfle başlar, yalnız a-z 0-9 - (en fazla 32).',
      'Subdirectory: zorunlu, tek klasör adı; iki component aynı ad/klasörü kullanamaz.',
      'NSSM / Windows service / systemd seçiliyse Service name zorunlu; Health URL girilirse http(s):// ile başlamalı.',
    ],
  },
  {
    id: 'jenkins-same-host',
    category: 'build',
    title: 'Jenkins aynı sunucuda: hangi adresleri kullanmalıyım?',
    symptoms: ['Jenkins API: Could not verify', 'connect ETIMEDOUT <PUBLIC_IP>:8080'],
    cause: 'Oracle VM kendi public IP’sine içeriden bağlanamaz (public IP NIC’te değil, NAT’ta). IDP → Jenkins ve Jenkins → IDP çağrıları yerel adresten yapılmalı.',
    steps: [
      'Project Settings → Jenkins URL: http://127.0.0.1:8080',
      'Jenkins Global properties → IDP_URL: http://127.0.0.1:3001',
      'Jenkins Username/API Token: Jenkins kullanıcısının kendi Security → API Token değeri (IDP admin hesabı değil).',
    ],
    snippets: [
      {
        label: 'Token ve job erişimini sunucudan doğrula',
        value: "$u = '<JENKINS_USER>'\n$t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Jenkins API token' -AsSecureString)))\n$h = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(\"${u}:${t}\")) }\n(Invoke-WebRequest http://127.0.0.1:8080/job/<JOB_NAME>/api/json -Headers $h -UseBasicParsing).StatusCode\n$t = $null",
      },
    ],
  },
  {
    id: 'jenkins-no-revision',
    category: 'build',
    title: 'Jenkins checkout başarısız',
    symptoms: ["ERROR: Couldn't find any revision to build", 'Seen 0 remote branches', 'Maximum checkout retry attempts reached'],
    cause: 'Job’un branch ayarı repodaki branch ile eşleşmiyor (Jenkins varsayılanı */master, repo main) ya da Repository URL yanlış.',
    steps: [
      'Job → Configure → Pipeline: Definition “Pipeline script from SCM”, SCM Git.',
      'Repository URL’yi .git uzantısıyla doğru yaz; public repoda Credentials “- none -”.',
      'Branch Specifier: */main · Script Path: Jenkinsfile.',
      'Hâlâ olmuyorsa Jenkins makinesinden repoya erişimi test et.',
    ],
    snippets: [{ label: 'Repo erişimi', value: 'git ls-remote https://github.com/<OWNER>/<REPO>.git' }],
  },
  {
    id: 'jenkins-env-missing',
    category: 'build',
    title: 'Jenkins IDP_URL / IDP_PROJECT_ID bulamıyor',
    symptoms: ['Jenkins environment variable IDP_URL is missing.', 'Jenkins environment variable IDP_PROJECT_ID is missing.'],
    cause: 'Jenkinsfile bu değerleri ortam değişkeni olarak bekler; job parametresi değildir.',
    steps: [
      'Manage Jenkins → System → Global properties → Environment variables’ı işaretle.',
      'IDP_URL = http://127.0.0.1:3001 (Jenkins IDP ile aynı makinedeyse) · IDP_PROJECT_ID = Project Settings başlığındaki Project ID.',
      'Kaydet ve yeni bir VERSION ile release başlat.',
    ],
  },
  {
    id: 'upload-token-missing',
    category: 'build',
    title: 'Upload token eksik veya geçersiz',
    symptoms: ['Jenkins credential idp-artifact-upload-token is missing.', 'upload-artifacts: IDP_ARTIFACT_UPLOAD_TOKEN is missing or invalid.'],
    cause: 'Credential var ama Secret boş ya da yanlış değer kaydedilmiş. Doğru token proje-kapsamlıdır: “idpu_” ile başlar ve tam 48 karakterdir. .env’deki ana token veya betiğin hata mesajı token değildir.',
    steps: [
      'Sunucuda yönetici PowerShell ile token’ı üret; betik doğrulayıp panoya kopyalar.',
      '“HATA: Artifact upload master token is unavailable.” çıkarsa .env’ye IDP_ARTIFACT_UPLOAD_TOKEN (≥32 karakter) ekle, backend’i yeniden başlat, tekrar üret.',
      'Jenkins → Credentials → idp-artifact-upload-token → Update: Kind “Secret text”, Secret alanını temizleyip yapıştır.',
      'Panoyu temizle.',
    ],
    snippets: [
      {
        label: 'Token üret ve panoya kopyala',
        value: "cd C:\\IDP\\idp-server\\backend\n$t = node scripts\\derive-artifact-upload-token.js <IDP_PROJECT_ID>\nif ($t -like 'idpu_*' -and $t.Length -eq 48) { 'OK - panoya kopyalandi'; $t | Set-Clipboard } else { \"HATA: $t\" }\n$t = $null",
      },
      { label: 'Panoyu temizle', value: "Set-Clipboard -Value ' '" },
    ],
  },
  {
    id: 'upload-unauthorized',
    category: 'build',
    title: 'Artifact upload 401 / 503 dönüyor',
    symptoms: ['Upload failed for <file>.tar.gz: 401 {"error":"Unauthorized"}', 'Upload failed ... 503'],
    cause: '401: token başka bir Project ID için üretilmiş (proje silinip yeniden oluşturulduysa ID değişir) veya ana token değişmiş. 503: backend’de IDP_ARTIFACT_UPLOAD_TOKEN yok ya da backend yeni .env’yi okumamış.',
    steps: [
      'Build logunun ilk satırındaki deploy_<PROJECT_ID>_… ile Jenkins IDP_PROJECT_ID’yi karşılaştır.',
      'Farklıysa IDP_PROJECT_ID’yi güncelle ve token’ı o ID için yeniden üretip credential’a yaz.',
      '503 ise .env’yi kontrol edip backend’i yeniden başlat.',
    ],
    note: 'Ana token (.env) değişirse daha önce üretilen tüm proje token’ları geçersiz olur.',
  },
  {
    id: 'gateway-unreachable',
    category: 'network',
    title: 'Agent gateway’e bağlanamıyor',
    symptoms: ["UYARI: Gateway'e erisilemiyor: <IP>:7003 - ag/proxy/firewall kontrol edin", 'agent offline'],
    cause: 'Public profilde 7003 yalnız -FirewallPublicRemoteAddress listesindeki IP’lere açıktır. Agent makinesinin çıkış IP’si listede yoksa bağlantı zaman aşımına düşer. Liste hatalı yazıldıysa (boşluk) ikinci IP kurala hiç eklenmez.',
    steps: [
      'Agent makinesinde gerçek çıkış IP’sini al (ipconfig’deki 10.x / 192.168.x değil).',
      'Agent ağının 7003’e dışarı çıkabildiğini portquiz ile doğrula.',
      'Sunucuda 7003 kuralının uzak adreslerini listele; agent IP’si yoksa betiği boşluksuz listeyle yeniden çalıştır.',
      'Arayüzdeki agent IP izin listesi doluysa agent IP’sini oraya da ekle (yoksa TCP açılır ama 403 alınır).',
    ],
    snippets: [
      {
        label: 'Agent makinesinde',
        value: "Invoke-RestMethod https://api.ipify.org\nTest-NetConnection <IDP_PUBLIC_IP> -Port 7003 | Select TcpTestSucceeded\nTest-NetConnection portquiz.net -Port 7003 | Select TcpTestSucceeded",
      },
      {
        label: 'IDP sunucusunda: 7003 kuralları',
        value: "Get-NetFirewallPortFilter -Protocol TCP | Where-Object LocalPort -eq 7003 | Get-NetFirewallRule |\n  Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' } |\n  ForEach-Object { [pscustomobject]@{ Ad = $_.DisplayName; Profil = $_.Profile; Uzak = (($_ | Get-NetFirewallAddressFilter).RemoteAddress -join ',') } } | Format-Table -AutoSize",
      },
      {
        label: 'Paket geliyor mu? (engellenenleri logla)',
        value: "Set-NetFirewallProfile -Profile Public -LogBlocked True -LogFileName \"$env:windir\\System32\\LogFiles\\Firewall\\pfirewall.log\"\n# agent'tan tekrar dene, sonra:\nSelect-String ' 7003 ' \"$env:windir\\System32\\LogFiles\\Firewall\\pfirewall.log\" | Select-Object -Last 5\nSet-NetFirewallProfile -Profile Public -LogBlocked False",
      },
    ],
    note: 'Agent IDP ile aynı VM’deyse public IP’ye bağlanamaz; application.yml içinde server.url’yi ws://127.0.0.1:7003 yap.',
  },
  {
    id: 'public-url-https',
    category: 'deploy',
    title: 'Deploy “IDP_PUBLIC_URL geçersiz” diyor',
    symptoms: ["IDP_PUBLIC_URL geçersiz: NODE_ENV=production iken https:// olmalı", 'Artifact deploy (POST /api/targets/:id/deploy) 503 döner.'],
    cause: 'Agent paketi indirirken kısa ömürlü token’ı bu adrese gönderir; production’da düz http kabul edilmez. NODE_ENV’i değiştirmek diğer korumaları da gevşetir, önerilmez.',
    steps: [
      'Hızlı test: Cloudflare geçici tüneli aç, verdiği https adresini IDP_PUBLIC_URL yap (adres her açılışta değişir).',
      'Kalıcı: Caddy + <IP-tireli>.sslip.io ile otomatik sertifika; 80/443 hem Oracle’da hem Windows firewall’da açık olmalı.',
      '.env’yi güncelle, backend’i yeniden başlat, deploy’u tekrarla.',
    ],
    snippets: [
      { label: 'Hızlı test (pencere açık kalmalı)', value: 'cloudflared tunnel --url http://127.0.0.1:3001' },
      {
        label: 'Kalıcı: C:\\caddy\\Caddyfile',
        value: '<IP-TIRELI>.sslip.io {\n    @download path_regexp ^/api/artifacts/[^/]+/download$\n    handle @download {\n        reverse_proxy 127.0.0.1:3001\n    }\n    respond 404\n}',
      },
      { label: '.env satırı', value: 'IDP_PUBLIC_URL=https://<IP-TIRELI>.sslip.io' },
    ],
  },
  {
    id: 'service-name',
    category: 'deploy',
    title: 'Component “Service name” ne olmalı?',
    symptoms: ["Required for 'nssm': 1-128 letters, digits, '.', '_', '@' or '-'.", 'BACKEND not installed'],
    cause: 'Service name, hedef makinede zaten kayıtlı Windows servisinin adıdır; agent servisi oluşturmaz, yalnız durdurur/başlatır. “not installed” ilk deploy’dan önce normaldir.',
    steps: [
      'İlk deploy’da Runtime “None” kalsın; dosyalar hedefe insin.',
      'Hedefte servisi oluştur (demo: ops\\bootstrap-windows.ps1).',
      'Get-Service ile Name sütunundaki değeri al (DisplayName değil) ve Runtime’ı NSSM/Windows service yap.',
      'IIS static için App pool adını IIS listesinden al.',
    ],
    snippets: [
      {
        label: 'Hedef makinede',
        value: "Get-Service | Where-Object { $_.Name -like '*<UYGULAMA>*' -or $_.DisplayName -like '*<UYGULAMA>*' } | Select Name, DisplayName, Status\nImport-Module WebAdministration; Get-ChildItem IIS:\\AppPools | Select Name, State",
      },
    ],
  },
  {
    id: 'wwwroot-access-denied',
    category: 'deploy',
    title: 'Deploy klasörüne erişim reddediliyor',
    symptoms: ['Folder Access Denied', 'You require permission from Administrators to make changes to this folder'],
    cause: 'Agent SYSTEM olarak çalışır ve klasörleri yalnız SYSTEM/Administrators erişimiyle oluşturur; yönetici olarak açılmayan Gezgin bu yetkiyi kullanamaz. Silme/taşımada açık dosyalar (çalışan servis, app pool) da aynı hatayı verir.',
    steps: [
      'Hesabına web köküne kalıtımlı Modify izni ver.',
      'Alt klasörler izni devralmadıysa ACL’leri sıfırla.',
      'Silme/taşıma yapacaksan önce servisi ve app pool’u durdur.',
    ],
    snippets: [
      {
        label: 'Kalıcı izin',
        value: '$me = "$env:USERDOMAIN\\$env:USERNAME"\nicacls C:\\inetpub\\wwwroot /grant "${me}:(OI)(CI)M" /T /C /Q',
      },
      { label: 'Kalıtımı yeniden uygula', value: 'icacls C:\\inetpub\\wwwroot\\<PROJE> /reset /T /C /Q' },
      {
        label: 'Kilitli dosyalar için',
        value: 'Stop-Service <SERVIS_ADI> -ErrorAction SilentlyContinue\nStop-WebAppPool <APP_POOL> -ErrorAction SilentlyContinue\n# işlemi yap\nStart-Service <SERVIS_ADI>; Start-WebAppPool <APP_POOL>',
      },
    ],
  },
];
