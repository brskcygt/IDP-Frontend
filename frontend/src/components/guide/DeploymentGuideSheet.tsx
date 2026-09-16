import { useState } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  Check,
  GitBranch,
  Network,
  PackageCheck,
  Rocket,
  RotateCcw,
  Server,
  ServerCog,
  Settings2,
  Workflow,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CodeBlock, type Snippet } from './CodeBlock';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void; onOpenAgentBuilder: () => void };
type GuideProvider = 'github' | 'bitbucket' | 'jenkins';
type GuideStep = {
  title: string;
  summary: string;
  items: string[];
  snippets?: Snippet[];
  note?: string;
  icon: typeof GitBranch;
};

const githubSteps: GuideStep[] = [
  {
    title: 'GitHub projesini IDP’ye bağla',
    summary: 'IDP, lokal branch’i değil GitHub’daki uzak branch’i build eder.',
    icon: GitBranch,
    items: [
      'New ile projeyi oluştur; provider olarak Pipeline seç.',
      'Platform GitHub, owner/repository, branch ve workflow dosyasını gir.',
      'GitHub PAT’i hem Pipeline API Token hem Artifact Repository Token alanına kaydet.',
      'PAT için yalnız gereken repository’lerde Contents ve Actions read/write izinlerini kullan.',
    ],
    note: 'Release öncesi geliştirme branch’in main/master gibi IDP’de kayıtlı release branch’ine merge ve push edilmiş olmalı.',
  },
  {
    title: 'GitHub Actions runner’ını hazırla',
    summary: 'Build müşteride değil, repository’ye bağlı self-hosted runner’da alınır.',
    icon: Workflow,
    items: [
      'GitHub → Repository Settings → Actions → Runners → New self-hosted runner yolunu aç.',
      'İşletim sistemi ve mimariyi seçip GitHub’ın verdiği download/config komutlarını çalıştır.',
      'Runner’ın repository sayfasında Idle ve etiketlerinin self-hosted, Windows, X64 olduğunu doğrula.',
      'Windows’ta Run as service seçeneğini aç; terminal kapansa veya makine yeniden başlasa da runner çalışsın.',
    ],
    note: 'Repository-scoped runner yalnız kayıtlı olduğu repository’nin işlerini alır. IDP Java agent ile GitHub Actions runner aynı şey değildir.',
  },
  {
    title: 'Workflow ve upload kimliğini tanımla',
    summary: 'Workflow iki immutable artifact ve SHA-256 manifest üretip IDP’ye yollar.',
    icon: Settings2,
    items: [
      '.github/workflows/idp-release.yml içinde workflow_dispatch ve zorunlu VERSION input’u bulunmalı.',
      'Project Settings başlığından Project ID’yi kopyala; Repository Variables içine IDP_URL ve IDP_PROJECT_ID olarak ekle.',
      'IDP sunucusunda proje-kapsamlı upload token üretip Repository Secret olarak IDP_ARTIFACT_UPLOAD_TOKEN adıyla ekle.',
      'Tokenı workflow dosyasına, loga veya komut satırı argümanına yazma.',
    ],
    snippets: [
      {
        label: 'Upload token üret',
        value: 'cd C:\\IDP\\idp-server\\backend\nnode .\\scripts\\derive-artifact-upload-token.js <IDP_PROJECT_ID>',
      },
      {
        label: 'Workflow sözleşmesi',
        value: [
          'on:',
          '  workflow_dispatch:',
          '    inputs:',
          '      VERSION:',
          '        required: true',
          '        type: string',
          '',
          'jobs:',
          '  release:',
          '    runs-on: [self-hosted, Windows, X64]',
          '    env:',
          '      VERSION: ${{ inputs.VERSION }}',
          '      IDP_URL: ${{ vars.IDP_URL }}',
          '      IDP_PROJECT_ID: ${{ vars.IDP_PROJECT_ID }}',
          '      IDP_ARTIFACT_UPLOAD_TOKEN: ${{ secrets.IDP_ARTIFACT_UPLOAD_TOKEN }}',
        ].join('\n'),
      },
    ],
  },
  {
    title: 'Müşteri sunucusu için IDP Agent oluştur',
    summary: 'Her hedef kendi agent kimliğine ve sabit deploy base path’ine sahip olur.',
    icon: ServerCog,
    items: [
      'Sol menüde IDP Agent oluştur’u aç; benzersiz Agent ID ve hedefteki proje kökünü gir.',
      'ZIP’i müşteri sunucusuna taşı, çıkart ve install-idp-agent-<ID>.ps1 dosyasını yönetici PowerShell ile çalıştır.',
      'Installer eksik deploy base path’i ve altındaki agent klasörünü otomatik oluşturur; wwwroot altında elle klasör açman gerekmez.',
      'Agent’ın gateway’e outbound erişimi olmalı; Cloudflare yoksa LAN/VPN rotası gerekir.',
      'IDP agent listesinde ilgili kimlik Online görünmeden target oluşturma.',
    ],
    snippets: [
      {
        label: 'Windows agent kurulumu',
        value: 'powershell.exe -NoProfile -ExecutionPolicy Bypass `\n  -File .\\install-idp-agent-<AGENT_ID>.ps1',
      },
    ],
  },
  {
    title: 'Deploy target oluştur',
    summary: 'Target, bir release’in hangi agent ve dizine kurulacağını belirler.',
    icon: Network,
    items: [
      'Project → Releases → Targets → Add target yolunu aç.',
      'Target adı, online agent, işletim sistemi, ortam ve base path’i seç.',
      'Target base path ile agent application.yml içindeki deploy.base-path birebir aynı olmalı.',
      'Backend için env-file, frontend için frontend-config-js runtime config kullan; config.js içine secret koyma.',
    ],
  },
  {
    title: 'İlk release’i üret',
    summary: 'Sürüm numarası immutable’dır; başarısız veya hazır bir sürümü tekrar kullanma.',
    icon: PackageCheck,
    items: [
      'Project satırındaki Releases ekranında New’e bas.',
      '1.4.0 veya 1.4.0-test.1 gibi daha önce kullanılmamış bir VERSION gir.',
      'IDP repository/workflow/dispatch kontrollerinden sonra GitHub Actions işini başlatır.',
      'Build; test, package, manifest, upload ve finalize aşamalarını tamamlayınca release Ready olur.',
    ],
    note: 'Queued uzun sürerse runner’ın doğru repository’ye kayıtlı ve workflow etiketleriyle eşleştiğini kontrol et.',
  },
  {
    title: 'Release’i hedefe deploy et',
    summary: 'Ready release seçilir; build çıktısı müşteri sunucusunda yeniden derlenmez.',
    icon: Rocket,
    items: [
      'Ready release’i seç, Deploy’e bas ve target’ı seç.',
      'Gerekmedikçe backend ve frontend component seçimlerini değiştirme.',
      'IDP download → SHA verify → extract → stop → swap → configure → start → health sırasını yürütür.',
      'Health endpoint’i artifact sürümünü döndürüyorsa expectVersionPath olarak version tanımla.',
    ],
    note: 'İlk kurulumda servis/IIS henüz yoksa önce runtime:none ile dosyaları bırak, bir kerelik bootstrap yap, sonra runtime’ı NSSM/IIS olarak kaydet.',
  },
  {
    title: 'Doğrula ve gerektiğinde rollback yap',
    summary: 'Başarı yalnız dosyanın açılması değil, çalışan uygulamanın doğru sürümü vermesidir.',
    icon: RotateCcw,
    items: [
      'Deploy sonucunda tüm component’lerin completed olduğunu kontrol et.',
      'Backend /health ve frontend /version.json cevaplarında release sürümünü doğrula.',
      'Yeni sürüm hatalıysa target menüsündeki Rollback ile önceki kurulu sürüme dön.',
      'Rollback sonrası health cevaplarının eski sürümü gösterdiğini kontrol et.',
    ],
  },
];

const bitbucketSteps: GuideStep[] = [
  {
    title: 'Bitbucket projesini IDP’ye bağla',
    summary: 'IDP, seçilen branch veya tag üzerindeki custom pipeline’ı REST API ile tetikler.',
    icon: GitBranch,
    items: [
      'New ile projeyi oluştur; Provider olarak Pipeline, CI Platform olarak Bitbucket Pipelines seç.',
      'Workspace, Repository, Ref Type, Branch/Tag ve Custom pipeline name alanlarını doldur.',
      'Demo için Branch master/main ve custom pipeline adı idp-release kullan.',
      'API Base URL’yi Bitbucket Cloud için boş bırak; IDP varsayılan https://api.bitbucket.org/2.0 adresini kullanır.',
    ],
    note: 'Release, bilgisayarındaki lokal branch’ten değil Bitbucket’a push edilmiş commit’ten üretilir.',
  },
  {
    title: 'API erişim token’ını oluştur',
    summary: 'Bu token yalnız IDP’nin repository’yi doğrulaması, pipeline’ı başlatması ve logları izlemesi içindir.',
    icon: Settings2,
    items: [
      'Önerilen seçenek: repository, project veya workspace access token oluştur.',
      'Token’a repository read ile pipeline read/write izinlerini ver; kapsamı yalnız gereken repository ile sınırla.',
      'IDP Authentication alanında Access token (Bearer) seçip tokenı API Token alanına kaydet.',
      'Alternatif olarak API token + Atlassian email seçilebilir; eski App Password kullanma.',
    ],
    note: 'Pipeline API token ile IDP_ARTIFACT_UPLOAD_TOKEN farklı kimliklerdir. Birini diğerinin yerine kullanma.',
  },
  {
    title: 'Self-hosted Windows runner’ı hazırla',
    summary: 'Windows artifact şirket ağındaki Bitbucket runner’da build edilir; müşteri sunucusunda build yapılmaz.',
    icon: Workflow,
    items: [
      'Bitbucket Repository → Settings → Pipelines → Runners → Add runner yolunu aç.',
      'Windows 64-bit seç; Bitbucket’ın verdiği indirme ve başlatma komutlarını şirket build sunucusunda yönetici PowerShell ile çalıştır.',
      'Runner listesinde Online olduğunu ve self.hosted ile windows etiketlerini taşıdığını doğrula.',
      'Runner servis hesabının Git, Node.js, tar ve şirket ağındaki IDP_URL adresine erişimi olmalı.',
    ],
    snippets: [
      {
        label: 'Runner eşleştirme sözleşmesi',
        value: [
          'step:',
          '  name: Build, test and publish',
          '  runs-on:',
          '    - self.hosted',
          '    - windows',
        ].join('\n'),
      },
    ],
    note: 'Bitbucket runner build katmanıdır; müşteri sunucusundaki IDP Java agent deploy katmanıdır.',
  },
  {
    title: 'Custom pipeline ve repository variables ekle',
    summary: 'Pipeline zorunlu VERSION alır; test, package, manifest, upload ve finalize işlemlerini yürütür.',
    icon: PackageCheck,
    items: [
      'Repository köküne bitbucket-pipelines.yml ekle; pipelines.custom.idp-release altında VERSION değişkenini tanımla.',
      'Repository Settings → Pipelines → Repository variables altında IDP_URL ve IDP_PROJECT_ID ekle.',
      'IDP_ARTIFACT_UPLOAD_TOKEN değişkenini Secured olarak ekle; Project ID’yi IDP Project Settings başlığından kopyala.',
      'scripts/make-manifest.js ve scripts/upload-artifacts.js dosyalarını uygulama repository’sine koy.',
    ],
    snippets: [
      {
        label: 'Upload token üret',
        value: 'cd C:\\IDP\\idp-server\\backend\nnode .\\scripts\\derive-artifact-upload-token.js <IDP_PROJECT_ID>',
      },
      {
        label: 'bitbucket-pipelines.yml sözleşmesi',
        value: [
          'pipelines:',
          '  custom:',
          '    idp-release:',
          '      - variables:',
          '          - name: VERSION',
          '      - step:',
          '          name: Build, test and publish',
          '          runs-on: [self.hosted, windows]',
          '          script:',
          '            - npm ci',
          '            - npm test',
          '            - npm run build',
          '            - node scripts/make-manifest.js app "$env:VERSION" "$env:BITBUCKET_COMMIT" <component-specs>',
          '            - node scripts/upload-artifacts.js --project-id "$env:IDP_PROJECT_ID" --version "$env:VERSION" --manifest "artifacts/app-$env:VERSION-manifest.json" --allow-http',
        ].join('\n'),
      },
    ],
    note: '--allow-http yalnız şirket LAN/VPN içindeki HTTP IDP adresi için kullanılır. İnternete açık kurulumda HTTPS zorunlu olmalı.',
  },
  {
    title: 'Bağlantıyı ve pipeline sözleşmesini doğrula',
    summary: 'Test Connection release öncesinde repository, pipeline yetkisi ve YAML tanımını salt okunur kontrol eder.',
    icon: Network,
    items: [
      'Project Settings’i kaydet ve Test Connection çalıştır.',
      'Bitbucket Repository ve Bitbucket Pipelines kontrollerinin yeşil olduğunu doğrula.',
      'Pipeline Definition kontrolünde idp-release custom pipeline’ının seçilen ref’te bulunduğunu gör.',
      'YAML shared/imported config kullanıyorsa tanım kontrolü uyarı verebilir; gerçek tetikleme yine Bitbucket tarafından belirlenir.',
    ],
  },
  {
    title: 'Müşteri sunucusu için IDP Agent ve target oluştur',
    summary: 'Bitbucket artifact üretir; müşteri agent’ı immutable çıktıyı hedef dizine kurar.',
    icon: ServerCog,
    items: [
      'Agent oluştur ekranında benzersiz Agent ID ve deploy base path gir; paketi müşteri sunucusunda yönetici olarak kur.',
      'Installer eksik deploy base path’i ve agent klasörünü otomatik oluşturur; hedef klasörü önceden elle hazırlama.',
      'Agent Online olduktan sonra target’ta aynı agent, işletim sistemi, ortam ve birebir aynı base path’i seç.',
      'Backend .env ve frontend config.js değerlerini target runtime config alanına ekle; config.js içine secret koyma.',
      'İlk kurulumda component runtime’larını none bırak; önce Ready release’i dosya olarak deploy et.',
    ],
    snippets: [
      {
        label: 'Windows agent kurulumu',
        value: 'powershell.exe -NoProfile -ExecutionPolicy Bypass `\n  -File .\\install-idp-agent-<AGENT_ID>.ps1',
      },
    ],
    note: 'Aynı Windows makinede GitHub/Jenkins demoları da varsa ayrı agent ve ayrı base path kullan.',
  },
  {
    title: 'Release’i tetikle ve ilk bootstrap’ı yap',
    summary: 'IDP VERSION değerini custom pipeline’a gönderir; finalize edilen release Ready olduğunda target’a deploy edilir.',
    icon: Rocket,
    items: [
      'Releases → New ile daha önce kullanılmamış bir sürüm gir; IDP Bitbucket pipeline’ını tetikleyip logları canlı izler.',
      'Pipeline test/package/upload/finalize tamamlanınca Ready release’i seçip target’a Deploy selected yap.',
      'Bootstrap öncesinde backend/server.js ve frontend/index.html dosyalarının target base path altında oluştuğunu doğrula.',
      'İlk runtime:none deploy’dan sonra artifact içindeki bootstrap scriptini müşteri sunucusunda yönetici olarak bir kez çalıştır.',
      'Frontend config.js içindeki API_BASE_URL değerinde localhost değil, istemcilerin erişebildiği müşteri sunucusu IP’sini ve backend 8087 portunu kullan.',
      'Ardından backend runtime NSSM, frontend runtime IIS static ve iki health/version ayarını kaydet.',
      'Sunucu içinden 8092 listener/version.json kontrolünü yap; sonra istemci cihazdan http://<SUNUCU_IP>:8092 adresini aç.',
    ],
    snippets: [
      {
        label: 'Tek seferlik Windows bootstrap',
        value: [
          'powershell.exe -NoProfile -ExecutionPolicy Bypass `',
          '  -File "C:\\inetpub\\wwwroot\\idp-demo-bitbucket\\backend\\ops\\bootstrap-windows.ps1" `',
          '  -BasePath "C:\\inetpub\\wwwroot\\idp-demo-bitbucket" `',
          '  -ServiceName "IDPDemoBitbucketBackend" `',
          '  -SiteName "IDP Demo Bitbucket" `',
          '  -AppPoolName "IDPDemoBitbucketFrontendPool" `',
          '  -BackendPort 8087 `',
          '  -FrontendPort 8092 `',
          '  -NssmPath "C:\\tools\\nssm\\win64\\nssm.exe"',
        ].join('\n'),
      },
      {
        label: 'Bootstrap sonrası runtime ayarı',
        value: [
          'backend:  NSSM / IDPDemoBitbucketBackend',
          'health:   http://127.0.0.1:8087/health',
          'version:  version',
          '',
          'frontend: IIS static / IDPDemoBitbucketFrontendPool',
          'health:   http://127.0.0.1:8092/version.json',
          'version:  version',
        ].join('\n'),
      },
      {
        label: 'Frontend config.js',
        value: [
          'window.IDP_DEMO_CONFIG = {',
          '  API_BASE_URL: "http://<SUNUCU_IP>:8087/api"',
          '};',
        ].join('\n'),
      },
      {
        label: '8092 erişim kontrolü',
        value: [
          'Invoke-WebRequest "http://127.0.0.1:8092/version.json"',
          'Get-NetTCPConnection -LocalPort 8092 -State Listen',
          '',
          '# İstemci/Mac tarayıcısı:',
          'http://<SUNUCU_IP>:8092',
        ].join('\n'),
      },
      {
        label: 'Gerekirse Windows Firewall',
        value: [
          'New-NetFirewallRule -DisplayName "IDP Demo Bitbucket Frontend 8092" `',
          '  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8092 `',
          '  -Profile Any -RemoteAddress LocalSubnet',
          '',
          'New-NetFirewallRule -DisplayName "IDP Demo Bitbucket Backend 8087" `',
          '  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8087 `',
          '  -Profile Any -RemoteAddress LocalSubnet',
        ].join('\n'),
      },
    ],
    note: 'Bootstrap yalnız ilk kurulumda gerekir. Sonraki release’lerde IDP deploy/restart akışını yürütür; PowerShell’de sürekli frontend prosesi açık tutulmaz.',
  },
  {
    title: 'Normal deploy, config ve rollback akışını kullan',
    summary: 'Bootstrap sonrası yeni sürümlerde müşteri sunucusunda elle komut çalıştırılmaz.',
    icon: RotateCcw,
    items: [
      'Yeni geliştirmeyi kayıtlı release branch’ine merge/push et ve IDP’den benzersiz VERSION ile New release başlat.',
      'Ready release için yalnız Deploy selected kullan; IDP stop, swap, config, start ve health adımlarını yürütür.',
      'Yalnız ortam ayarı değiştiyse target config’i güncelle ve Apply config çalıştır.',
      'Health başarısızsa logu incele; gerekirse Rollback ile önceki sağlıklı sürüme dön.',
    ],
    note: 'Apply config servis veya IIS sitesi oluşturmaz. Bootstrap yalnız yeni/sıfırlanmış target ya da service/site/port değişikliğinde tekrarlanır.',
  },
];

const jenkinsSteps: GuideStep[] = [
  {
    title: 'Jenkins ve build node’larını hazırla',
    summary: 'IDP Jenkins API’ye erişir; Jenkins node’ları kaynak kodu build edip artifact’ları IDP’ye yollar.',
    icon: Server,
    items: [
      'Jenkins controller’ı müşteri sunucusuna değil, IDP backend/artifact store’un bulunduğu şirket ara katmanına kur.',
      'Jenkins controller URL’sinin IDP sunucusundan erişilebilir olduğunu doğrula.',
      'Build ihtiyacına göre linux ve windows label’lı node’ları online duruma getir.',
      'Node’larda Git, Node.js ve tar komutlarının Jenkins servis hesabının PATH’inde olduğunu doğrula.',
      'Windows native bağımlılıkları Windows x64 node’da, ortak frontend çıktısını uygun node’da üret.',
    ],
    note: 'Jenkins node’u build içindir; müşteri sunucusundaki IDP Java agent deploy içindir. Aynı görev değildir.',
  },
  {
    title: 'Parameterized Pipeline job oluştur',
    summary: 'IDP, Jenkins job’unu buildWithParameters üzerinden VERSION değeriyle başlatır.',
    icon: Workflow,
    items: [
      'Jenkins’te Pipeline türünde bir job oluştur ve Pipeline script from SCM ile repository’ye bağla.',
      'Script Path değerini repository’deki Jenkinsfile olarak bırak veya gerçek dosya yolunu gir.',
      'Job’da VERSION adlı String Parameter tanımla; IDP’deki Version variable ile birebir aynı olmalı.',
      'Karışan release’leri önlemek için disableConcurrentBuilds kullan ve manuel onay adımı koyma.',
    ],
    snippets: [
      {
        label: 'Jenkinsfile sözleşmesi',
        value: [
          'pipeline {',
          "  agent { label 'linux' }",
          '  options { disableConcurrentBuilds() }',
          '  parameters {',
          "    string(name: 'VERSION', trim: true, description: 'Immutable IDP release version')",
          '  }',
          '  stages {',
          "    stage('Build, test and publish') {",
          '      steps {',
          "        sh 'npm ci && npm test && npm run build'",
          '      }',
          '    }',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
  },
  {
    title: 'Jenkins kimliklerini ve IDP değişkenlerini ekle',
    summary: 'Jenkins API token’ı job tetiklemek, proje-kapsamlı upload token’ı artifact yayınlamak içindir.',
    icon: Settings2,
    items: [
      'Jenkins kullanıcısı için API token üret; kullanıcıya Overall Read, Job Read, Job Build ve gerekirse Job Cancel ver.',
      'Manage Jenkins → Credentials altında Secret text oluştur; ID değeri idp-artifact-upload-token olsun.',
      'IDP Project Settings başlığından Project ID’yi kopyala; job/global environment içine IDP_URL ve IDP_PROJECT_ID olarak ekle.',
      'Upload token’ını yalnız withCredentials bloğunda IDP_ARTIFACT_UPLOAD_TOKEN olarak aç.',
    ],
    snippets: [
      {
        label: 'Upload token üret',
        value: 'cd C:\\IDP\\idp-server\\backend\nnode .\\scripts\\derive-artifact-upload-token.js <IDP_PROJECT_ID>',
      },
      {
        label: 'Jenkins credential kullanımı',
        value: [
          "withCredentials([string(credentialsId: 'idp-artifact-upload-token',",
          "  variable: 'IDP_ARTIFACT_UPLOAD_TOKEN')]) {",
          "  sh 'node scripts/upload-artifacts.js --project-id \"$IDP_PROJECT_ID\" --version \"$VERSION\" --manifest \"artifacts/app-$VERSION-manifest.json\"'",
          '}',
        ].join('\n'),
      },
    ],
    note: 'IDP_ARTIFACT_UPLOAD_TOKEN komut satırı parametresi değildir; upload scripti onu yalnız environment’tan okur.',
  },
  {
    title: 'Jenkins projesini IDP’ye bağla',
    summary: 'Projenin ana provider’ı ve artifact build provider’ı Jenkins olarak kaydedilir.',
    icon: GitBranch,
    items: [
      'New ile projeyi oluştur; Provider olarak Jenkins seç.',
      'Project Settings içinde Jenkins URL, tam Job Name, Username ve API Token alanlarını doldur.',
      'Artifact deployment’ı etkinleştir; Build provider Jenkins, Version variable VERSION olsun.',
      'Artifact name ve backend/frontend component, OS, runtime ve health ayarlarını kaydet.',
    ],
    note: 'Connection test içinde Jenkins API ve Jenkins Job kontrolleri yeşil olmadan release başlatma.',
  },
  {
    title: 'Müşteri sunucusu için IDP Agent oluştur',
    summary: 'Jenkins yalnız build eder; kurulumu hedefte çalışan IDP agent gerçekleştirir.',
    icon: ServerCog,
    items: [
      'Sol menüde IDP Agent oluştur’u aç; benzersiz Agent ID ve deploy base path gir.',
      'ZIP’i müşteri sunucusuna taşı ve kurulum scriptini yönetici PowerShell ile çalıştır.',
      'Installer eksik deploy base path’i ve altındaki agent klasörünü otomatik oluşturur; hedef klasörü elle açman gerekmez.',
      'Agent’ın IDP gateway’e outbound erişimi olduğundan emin ol.',
      'Agent listesinde kimlik Online görünene kadar target oluşturma.',
    ],
    snippets: [
      {
        label: 'Windows agent kurulumu',
        value: 'powershell.exe -NoProfile -ExecutionPolicy Bypass `\n  -File .\\install-idp-agent-<AGENT_ID>.ps1',
      },
    ],
  },
  {
    title: 'Deploy target ve runtime config oluştur',
    summary: 'Target, Jenkins’in ürettiği release’in hangi müşteri agent’ına ve dizine kurulacağını belirler.',
    icon: Network,
    items: [
      'Her proje instance’ı için ayrı agent kullan; mevcut başka target’a bağlı agent’ı yeniden seçme.',
      'Online müşteri agent’ını, işletim sistemini, ortamı ve agent ile birebir aynı base path’i seç.',
      'Backend için .env; frontend için config.js formatını ve hedef ortama ait değerleri target’ta tanımla.',
      'İlk kurulumda component runtime’larını none bırak; önce Ready release’i Deploy selected ile dosya olarak kur.',
    ],
    note: 'Apply config servis veya IIS sitesi oluşturmaz. runtime:none iken config yazılabilir fakat port açılmaz, restart ve health-check atlanır.',
  },
  {
    title: 'IDP’den Jenkins release’i tetikle',
    summary: 'New release, Jenkins job’una yalnız doğrulanmış sürüm parametresini gönderir.',
    icon: PackageCheck,
    items: [
      'Project satırında Releases → New yolunu aç ve benzersiz sürüm gir.',
      'IDP Jenkins job’una VERSION=<sürüm> ile buildWithParameters isteği gönderir.',
      'Queue’dan gerçek build numarası çözülür ve Jenkins console output IDP ekranına canlı akar.',
      'Job manifest ile artifact’ları IDP’ye upload/finalize ederse release Ready olur.',
    ],
    note: 'Jenkins build SUCCESS olsa bile upload/finalize yapılmadıysa IDP release Ready olamaz.',
  },
  {
    title: 'İlk bootstrap’ı yap; sonraki deploy’ları IDP’ye bırak',
    summary: 'Bootstrap her target/application instance’ı için yalnız bir kez gerekir; normal release deploy’u tamamen IDP’den yürür.',
    icon: Rocket,
    items: [
      'İlk runtime:none deploy tamamlanınca artifact içindeki bootstrap scriptini müşteri sunucusunda yönetici PowerShell ile çalıştır.',
      'Project Settings’te backend’i NSSM, frontend’i IIS static yap; service/app pool ve version health alanlarını kaydet.',
      'Target’ta Apply config çalıştır; bundan sonra IDP stop → swap → configure → start → health sırasını otomatik yürütür.',
      'Sonraki sürümlerde yalnız Release → Deploy selected kullan; hata halinde Rollback ile önceki sağlıklı sürüme dön.',
    ],
    snippets: [
      {
        label: 'Tek seferlik Windows bootstrap',
        value: [
          'powershell.exe -NoProfile -ExecutionPolicy Bypass `',
          '  -File "C:\\inetpub\\wwwroot\\idp-demo-jenkins\\backend\\ops\\bootstrap-windows.ps1" `',
          '  -BasePath "C:\\inetpub\\wwwroot\\idp-demo-jenkins" `',
          '  -ServiceName "IDPDemoJenkinsBackend" `',
          '  -SiteName "IDP Demo Jenkins" `',
          '  -AppPoolName "IDPDemoJenkinsFrontendPool" `',
          '  -BackendPort 8086 `',
          '  -FrontendPort 8091 `',
          '  -NssmPath "C:\\tools\\nssm\\win64\\nssm.exe"',
        ].join('\n'),
      },
      {
        label: 'Bootstrap sonrası runtime ayarı',
        value: [
          'backend:  NSSM / IDPDemoJenkinsBackend',
          'health:   http://127.0.0.1:8086/health',
          'version:  version',
          '',
          'frontend: IIS static / IDPDemoJenkinsFrontendPool',
          'health:   http://127.0.0.1:8091/version.json',
          'version:  version',
        ].join('\n'),
      },
    ],
    note: 'Bootstrap yalnız yeni sunucu/target, silinmiş servis veya IIS sitesi ya da değişen service/site/port durumunda tekrar çalıştırılır. Config değişiminde yalnız Apply config yeterlidir.',
  },
];

const diagnosticsByProvider: Record<GuideProvider, string[][]> = {
  github: [
    ['Pipeline queued', 'Runner doğru repository’de mi ve self-hosted/Windows/X64 etiketleri var mı?'],
    ['Variable missing', 'GitHub Actions Variables: IDP_URL ve IDP_PROJECT_ID; Secret: IDP_ARTIFACT_UPLOAD_TOKEN.'],
    ['Script disabled', 'PowerShell’i -ExecutionPolicy Bypass ile yalnız ilgili proses için çalıştır.'],
    ['NSSM not found', 'Agent application.yml deploy.nssm-path alanına mutlak nssm.exe yolunu yaz.'],
    ['Yalnız localhost açılıyor', 'IIS binding, uygulama HOST değeri ve Windows Firewall profilini kontrol et.'],
    ['Health version mismatch', 'Endpoint’in JSON version değeri release VERSION ile tam aynı olmalı.'],
  ],
  bitbucket: [
    ['Pipeline 401/403', 'Bearer access token kapsamlarını veya API token + Atlassian email eşleşmesini kontrol et.'],
    ['Pipeline definition bulunamadı', 'Seçilen branch/tag içindeki bitbucket-pipelines.yml dosyasında pipelines.custom altındaki adı doğrula.'],
    ['Step runner bekliyor', 'Repository runner Online mı; step self.hosted ve windows dahil tüm runner label’larıyla eşleşiyor mu?'],
    ['Variable missing', 'Repository variables: IDP_URL ve IDP_PROJECT_ID; Secured variable: IDP_ARTIFACT_UPLOAD_TOKEN.'],
    ['Upload bağlantı hatası', 'Self-hosted runner’dan IDP_URL adresine LAN/VPN erişimini ve firewall’u test et.'],
    ['Release Ready olmuyor', 'Bitbucket step logunda manifest adı, SHA-256, upload ve finalize sonucunu kontrol et.'],
    ['Apply config sonrası port kapalı', 'Runtime none ise normaldir; ilk deploy ve tek seferlik bootstrap sonrası NSSM/IIS ayarlarını kaydet.'],
  ],
  jenkins: [
    ['Jenkins API 401/403', 'IDP Project Settings içindeki username/API token ve Jenkins kullanıcı izinlerini kontrol et.'],
    ['Job not found', 'Job Name alanını Jenkins’te görünen tam adla yaz; büyük/küçük harf ve klasör yolunu kontrol et.'],
    ['Build queue’da bekliyor', 'Job label’ıyla eşleşen online executor/node var mı ve node disk alanı yeterli mi?'],
    ['VERSION boş', 'Jenkinsfile String Parameter adı ile IDP Version variable değeri birebir aynı olmalı.'],
    ['Upload 401', 'idp-artifact-upload-token Secret text değerini proje için yeniden türet; IDP_PROJECT_ID’yi doğrula.'],
    ['Release Ready olmuyor', 'Jenkins logunda manifest adı, artifact SHA ve upload finalize yanıtını kontrol et.'],
    ['Apply config sonrası port kapalı', 'Component runtime none ise normaldir. Önce release deploy et, tek seferlik bootstrap yap ve runtime’ı NSSM/IIS olarak kaydet.'],
  ],
};

const providerCopy = {
  github: {
    title: 'GitHub’dan immutable artifact üretin; müşteri sunucusuna agent üzerinden güvenli biçimde deploy edin.',
    buildTitle: 'GitHub Actions runner',
    buildDetail: 'Test eder, paketler ve IDP’ye yükler.',
  },
  bitbucket: {
    title: 'Bitbucket custom pipeline’ını IDP’den tetikleyin; immutable artifact’ı müşteri agent’ına deploy edin.',
    buildTitle: 'Bitbucket self-hosted runner',
    buildDetail: 'Custom pipeline’ı çalıştırır, test eder ve IDP’ye yükler.',
  },
  jenkins: {
    title: 'Jenkins job’unu IDP’den tetikleyin; aynı immutable artifact’ı müşteri agent’ına deploy edin.',
    buildTitle: 'Jenkins controller + node',
    buildDetail: 'Parameterized job’u çalıştırır, test eder ve IDP’ye yükler.',
  },
} satisfies Record<GuideProvider, { title: string; buildTitle: string; buildDetail: string }>;

export const DeploymentGuideSheet = ({ isOpen, onOpenChange, onOpenAgentBuilder }: Props) => {
  const [provider, setProvider] = useState<GuideProvider>('github');
  const steps = provider === 'github' ? githubSteps : provider === 'bitbucket' ? bitbucketSteps : jenkinsSteps;
  const diagnostics = diagnosticsByProvider[provider];
  const copy = providerCopy[provider];

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(1120px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="sticky top-0 z-10 border-b border-line-strong bg-bar/95 px-7 py-6 backdrop-blur">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><BookOpenText className="h-5 w-5 text-primary" />Deployment kullanım kılavuzu</SheetTitle>
          <SheetDescription>{copy.title}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            aria-pressed={provider === 'github'}
            onClick={() => setProvider('github')}
            className={provider === 'github'
              ? 'flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary'
              : 'flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted-foreground hover:border-line-strong hover:text-foreground'}
          ><GitBranch className="h-4 w-4" />GitHub</button>
          <button
            type="button"
            aria-pressed={provider === 'bitbucket'}
            onClick={() => setProvider('bitbucket')}
            className={provider === 'bitbucket'
              ? 'flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-400'
              : 'flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted-foreground hover:border-line-strong hover:text-foreground'}
          ><GitBranch className="h-4 w-4" />Bitbucket</button>
          <button
            type="button"
            aria-pressed={provider === 'jenkins'}
            onClick={() => setProvider('jenkins')}
            className={provider === 'jenkins'
              ? 'flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-400'
              : 'flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted-foreground hover:border-line-strong hover:text-foreground'}
          ><Server className="h-4 w-4" />Jenkins</button>
          <button type="button" onClick={onOpenAgentBuilder} className="ml-auto rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">Agent oluştur</button>
        </div>
      </div>

      <div className="space-y-8 p-7">
        <section className="grid gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-5 sm:grid-cols-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Build</p><p className="mt-2 text-sm font-semibold">{copy.buildTitle}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.buildDetail}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Store</p><p className="mt-2 text-sm font-semibold">IDP artifact store</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Manifest ve SHA-256 ile immutable release tutar.</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Deploy</p><p className="mt-2 text-sm font-semibold">Müşteri IDP agent’ı</p><p className="mt-1 text-xs leading-5 text-muted-foreground">İndirir, değiştirir, başlatır ve health kontrol eder.</p></div>
        </section>

        <ol className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return <li key={step.title} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Adım {index + 1}</p>
                  <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.summary}</p>
                  <ul className="mt-4 grid gap-2 text-xs leading-5 text-foreground/90 lg:grid-cols-2">
                    {step.items.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /><span>{item}</span></li>)}
                  </ul>
                  {step.snippets && <div className="mt-4 grid gap-3 lg:grid-cols-2">{step.snippets.map((snippet) => <CodeBlock key={snippet.label} snippet={snippet} />)}</div>}
                  {step.note && <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /><span>{step.note}</span></div>}
                </div>
              </div>
            </li>;
          })}
        </ol>

        <section>
          <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Hızlı tanılama</p><h3 className="mt-1 text-lg font-semibold">En sık takılan noktalar</h3></div>
          <div className="grid gap-3 md:grid-cols-2">
            {diagnostics.map(([title, detail]) => <div key={title} className="rounded-lg border border-line bg-bar p-4"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p></div>)}
          </div>
        </section>
      </div>
    </SheetContent>
  </Sheet>;
};
