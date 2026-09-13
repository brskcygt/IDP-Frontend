# idp-agent — Artifact deploy (agent tarafı)

> Son güncelleme: 2026-09-11 · Kod: `idp-agent/src/main/java/com/idp/agent/deploy/`,
> işleyiciler `handlers/MessageHandlers/Artifact*MessageHandler.java`
> Sözleşme, backend, build ve manifest: `docs/ARTIFACT-DEPLOY.md` (bu belge yalnız agent davranışını anlatır).
> Testler: `idp-agent/src/test/java/com/idp/agent/deploy/` (`mvn -B test`, macOS/Linux'ta çalışır).

## 1. Özet

Agent `artifact_deploy` mesajını alınca her bileşenin `.tar.gz`'ini **IDP backend'inden** indirir, sha256'yı
doğrular, taze bir staging dizinine güvenli açar, sunucuya özel dosyaları korur, `config.js` yazar; sonra
bileşenleri sırayla durdurur → yer değiştirir → preStart hook'larını çalıştırır → başlatır → health-check
yapar. Herhangi bir hata, iptal ya da zaman aşımında o ana kadar dokunulan **tüm** bileşenler geri alınır.
Her `deployId` için **tam olarak bir** terminal `deploy_result` gönderilir.

- Kilit: tek iş parçacıklı yürütücü. Bir deploy/rollback sürerken gelen ikinci istek hemen
  `deploy_result {success:false, error:"busy"}` alır (event üretmez).
- Aynı `deployId` ikinci kez gelirse yok sayılır (sonuç tekrarlanmaz). `deployId` opak ama dosya adında
  kullanıldığı için `^[A-Za-z0-9_-]{1,64}$` olmalı (backend: `dep_` + 24 hex).
- Eski `update` / `run_deploy` / `update_agent` akışları değişmedi; artifact deploy bunlarla kod paylaşmaz
  (`CommandExecutor` kullanılmaz, `command_execution_result` üretilmez).

## 2. Yerel yapılandırma (`application.yml`)

```yaml
deploy:
  base-path: "C:\\inetpub\\wwwroot\\jetsrm"   # ZORUNLU; yoksa artifact deploy kapalı (not_configured)
  keep-releases: 3                            # opsiyonel, 1-20, varsayılan 3
  allowed-runtimes: [nssm, iis-static]        # opsiyonel, varsayılan hepsi
  allowed-hook-commands: [node, npm, npx]     # opsiyonel, varsayılan [node, npm, npx]; [] = hook yok
  nssm-path: "C:\\tools\\nssm\\win64\\nssm.exe"  # opsiyonel, varsayılan PATH'teki "nssm"
```

| Alan | Kural |
|---|---|
| `base-path` | Mutlak yol, kök dizin değil, `..` yok. Tüm deploy yollarının **izin kökü**; backend başka yol veremez. Deploy anında var olmalı. |
| `keep-releases` | Bileşen başına saklanan önceki sürüm dizini sayısı (geri alma derinliği). |
| `allowed-runtimes` | Listede olmayan `runtime.type` → `runtime_not_allowed:<type>` (indirme öncesi). |
| `allowed-hook-commands` | Yalın komut adları (`^[A-Za-z0-9._-]{1,64}$`). Listede olmayan hook → `hook_not_allowed:<hook adı>` (indirme öncesi). |
| `nssm-path` | NSSM PATH'te değilse ya da agent başladıktan sonra kurulduysa mutlak yol verin. |

Hatalı değer agent'ı durdurmaz: yalnız artifact deploy `not_configured: <neden>` ile reddedilir; açılışta logda
`Artifact deploy: base-path=…` ya da `Artifact deploy devre disi: …` satırı görünür.

IDP masaüstü **agent paketi oluşturucu** (`desktop/main/agentBuilder.js`) `deploy.base-path` (mutlak Windows
sürücü yolu ya da POSIX yolu; UNC, kök ve `..` reddedilir) ve `deploy.keep-releases` (1-20) alanlarını yazar;
taban yol boşsa `deploy:` bölümü hiç yazılmaz. Kurulum betiği zamanlanmış görevi `-WorkingDirectory
%ProgramData%\IDP\Agent\<id>` ile kaydeder (agent `logs\` klasörünü çalışma dizinine göre açar; aksi halde
SYSTEM görevi `C:\Windows\System32` içinde başlar).

## 3. Klasör düzeni

```
C:\inetpub\wwwroot\<proje>\            (= deploy.base-path; Linux: /var/www/<proje>/)
├── backend\                           canlı backend (NSSM AppDirectory burası)
├── frontend\                          canlı frontend (IIS sitesinin fiziksel yolu)
├── agent\                             (opsiyonel) agent JAR + config; IIS göstermez, ACL'li (bkz. §9)
└── .releases\                         agent'a ait
    ├── _downloads\<deployId>-<bileşen>.tar.gz     indirme (açıldıktan sonra silinir)
    ├── <sürüm>\<bileşen>\                         staging (swap'ta canlıya taşınır)
    ├── prev\<bileşen>-<eskiSürüm|unknown>-<UTC zaman>\   önceki sürümler (keep-releases kadar)
    └── state.json
```

- Bileşen `subdir`'i tek bir güvenli klasör adıdır; `.releases` ve `agent` **ayrılmıştır** (reddedilir). Agent'ın
  kendi JAR'ı ya da çalışma dizini bir bileşen dizininin içindeyse deploy `unsafe_path` ile reddedilir.
- Tüm taşımalar aynı birimde yeniden adlandırmadır (hepsi base-path altında): kopya yok, atomik.
- Bugünkü Windows kurulum betiği agent'ı `%ProgramData%\IDP\Agent\<id>` altına kurar (IIS yollarının dışında);
  `agent\` klasörü yalnız agent'ı proje yanına koymak isteyenler için bir seçenektir.

## 4. Mesajlar ve hata kodları

Sunucu → agent: `artifact_deploy`, `artifact_rollback`, `artifact_cancel`, `artifact_status`.
Agent → sunucu: `deploy_event`, `deploy_result`, `artifact_status_result` (null alanlar `null` olarak yazılır:
`component`, `progress`, `error`, `previousVersion`). Biçimler için `docs/ARTIFACT-DEPLOY.md` §2.2.

`deploy_result.error` değerleri:

| Hata | Anlamı |
|---|---|
| `busy` | Başka bir deploy/rollback sürüyor |
| `invalid_payload: …` | Payload doğrulaması (alan yolu yazılır, değer yankılanmaz) |
| `not_configured` / `not_configured: …` | `deploy.base-path` yok / hatalı / dizin yok |
| `runtime_not_allowed:<type>` | `deploy.allowed-runtimes` dışında |
| `runtime_not_supported:<type>` | Platform uyumsuz (nssm/windows-service/iis-static yalnız Windows, systemd yalnız Linux) |
| `hook_not_allowed:<hook>` | Hook komutu `deploy.allowed-hook-commands` dışında |
| `hook_command_not_found:<hook>` | Komut PATH'te yok / güvenli çözülemedi (ayrıntı agent logunda) |
| `unsafe_path: …` | Canlı dizin ya da `.releases` symlink/junction, taban dışına çıkıyor, ya da dosya |
| `cancelled` / `timeout` | `artifact_cancel` / global `timeoutSec` aşıldı (ikisinde de geri alma yapılır) |
| `no_previous_release[:<bileşen>]`, `unknown_component:<bileşen>`, `missing_previous_release:<bileşen>`, `invalid_state:<bileşen>` | `artifact_rollback` reddi |
| `<bileşen>: <neden>` | Aşama hatası (ör. `frontend: health check 5 sn icinde basarili olmadi: HTTP 503`) |

## 5. Aşamalar

Agent iki fazda çalışır. **Faz 1** tüm bileşenleri hazırlar; hiçbir şeyi durdurmaz. **Faz 2** bileşenleri
sırayla etkinleştirir. Böylece ör. frontend indirmesi başarısız olursa backend hiç durdurulmaz.

| Faz | `stage` | Ne yapılır |
|---|---|---|
| — | `accepted` | Doğrulama geçti (reddedilen istek event üretmez, yalnız `deploy_result`). |
| 1 | `downloading` | JDK HttpClient, `Authorization: Bearer <token>` + `X-IDP-Agent-Id: <agent.id>` (backend başlığı zorunlu tutar ve token'ı agent'a bağlar). Yalnız **HTTP 200**; yönlendirme izlenmez. Ağ hatası / 5xx / 408 / 429 için toplam 3 deneme; 401/403 (token iptal edilmiş, süresi dolmuş ya da başka agent'a ait) ve diğer 4xx **tekrar denenmez**, deploy açık bir hatayla biter. Content-Length ve akış sonu `size` ile karşılaştırılır; hatada dosya silinir. İlerleme en fazla saniyede bir (`progress` 0-100). `server.proxy` varsa onu kullanır. |
| 1 | `verifying` | `security/Sha256Verifier` (fail-closed; uyuşmazsa dosya silinir). |
| 1 | `extracting` | commons-compress ile taze staging'e. Red: mutlak yol, sürücü harfi, `..`, `:` (NTFS ADS), Windows'ta geçersiz adlar (`CON`, sonda nokta…), symlink, hardlink, aygıt, FIFO. Sınırlar: toplam 4 GB açılan veri, 200.000 girdi. Unix'te çalıştırma biti korunur. |
| 1 | `preserving` | Canlı dizinden staging'e kopya, **canlı kazanır**. Desen: `*` segment içi, `?`, `**` her derinlik; dizini seçen desen (`uploads`, `config/**`) tüm alt ağacı alır. Symlink/junction kopyalanmaz (atlanır, mesajda yazılır). Windows'ta büyük/küçük harf duyarsız. İlk kurulumda `skipped`. |
| 1 | `configuring` | `runtimeConfig` varsa bileşen köküne `config.js` = `window.__ENV__ = <JSON>;` (anahtarlar sıralı, `^[A-Z][A-Z0-9_]*$`, HTML-güvenli kaçış). Preserve'den **sonra** yazılır (IDP yönetir, korunan dosyayı ezer). |
| 2 | `stopping` | `RuntimeController.stop` (iis-static/none: `skipped`). |
| 2 | `switching` | `<base>\<subdir>` → `.releases\prev\<bileşen>-<eski>-<ts>`, staging → `<base>\<subdir>`. Windows kilitleri için ~30 sn artan beklemeyle yeniden deneme. İkinci taşıma olmazsa eski dizin geri konur. |
| 2 | `pre_start` | preStart hook'ları (bkz. §7); hook yoksa `skipped`. |
| 2 | `starting` | `RuntimeController.start` (iis-static: `appPool` varsa geri dönüşüm, yoksa `skipped`). |
| 2 | `health_check` | `health.url` 200 dönene kadar (ve `expectVersionPath` verildiyse o JSON yolundaki değer bileşen sürümüne eşit olana kadar) `timeoutSec` boyunca 2 sn arayla yoklama. Proxy kullanılmaz. `health: null` → `skipped`. |
| — | `rolling_back` | Hata/iptal/zaman aşımında dokunulan bileşenler ters sırayla (bkz. §8). |
| — | `cleanup` | İndirmeler ve staging silinir; başarıda `keep-releases` fazlası önceki sürüm dizinleri silinir. |

Başarıda `state.json` atomik yazılır (geçici dosya + rename), sonra `cleanup`, en son `deploy_result`.
`state.json` yazılamazsa deploy başarısız sayılır ve geri alınır (state her zaman canlıyı anlatır).

## 6. Runtime türleri

Tüm komutlar `ProcessBuilder` **argüman listesiyle** çalışır (kabuk metni yok), 120 sn komut zaman aşımı ve
çıkış kodu/durum denetimi vardır; durum beklemesi en fazla 90 sn.

| `type` | Durdurma | Başlatma | Not |
|---|---|---|---|
| `nssm` | `nssm stop <svc>` + `nssm status <svc>` → `SERVICE_STOPPED` | `nssm start <svc>` + `SERVICE_RUNNING` | Çalışmayan servisi durdurmak hata değil; `nssm status` başarısızsa (servis yok) hemen hata. UTF-16 çıktı okunur. |
| `windows-service` | `%SystemRoot%\System32\sc.exe stop <svc>` (1062 = zaten durmuş, kabul) + `sc.exe query` durum kodu 1 | `sc.exe start <svc>` (1056 kabul) + durum kodu 4 | Durum sayısal koddan okunur (yerelleştirilmiş Windows'ta da çalışır). |
| `iis-static` | — | `appPool` varsa `%SystemRoot%\System32\inetsrv\appcmd.exe recycle apppool /apppool.name:<pool>` | `/apppool.name:<pool>` **tek argüman** (ad boşluk içerebilir). |
| `systemd` | `systemctl stop <svc>` + `is-active` ≠ active | `systemctl start <svc>` + `is-active` = active (`failed` → hata) | Linux. |
| `none` | — | — | Yalnız dosya değişimi. |

Servis adı `^[A-Za-z0-9._@-]{1,128}$`; IIS app pool adı `^[A-Za-z0-9._-][A-Za-z0-9 ._-]{0,127}$`
(boş metin = app pool yok).

## 7. preStart hook'ları

Swap'tan **sonra**, servis başlamadan **önce**, canlı bileşen kökünde (`<base>\<subdir>`) sırayla çalışır
(ör. veritabanı migration'ı). Hook'lar yalnız proje ayarından gelir (backend deploy parametresinden kabul etmez).

- **İzin listesi:** `deploy.allowed-hook-commands` (varsayılan `node`, `npm`, `npx`). Listede olmayan komut
  indirmeden önce `hook_not_allowed:<hook>` ile reddedilir.
- **Komut çözümü:** yalın ad PATH'te **mutlak yola** çözülür; süreç asla yalın adla başlatılmaz. PATH'teki
  göreli girdiler atlanır; `base-path` altındaki adaylar reddedilir (artifact kendi `node.exe`'sini sokamaz).
  Windows'ta PATH, `run_deploy`'daki gibi kayıt defterinden (Machine + User) tazelenir ve hook'a da bu PATH
  verilir; `.exe` ve `.cmd` kabul edilir.
- **`.cmd` kararı:** `npm.cmd` / `npx.cmd` için `cmd.exe` **kullanılmaz**: yanındaki `node.exe` ile
  `node_modules\npm\bin\npm-cli.js` / `npx-cli.js` doğrudan çalıştırılır. Diğer `.cmd` dosyaları yalnız yol
  `C:\…` biçiminde boşluksuz ve **tüm** argümanlar `[A-Za-z0-9._:/\=@+-]` ise `cmd.exe /d /v:off /c` ile
  çalışır; aksi halde reddedilir (cmd.exe meta karakter enjeksiyonu). Önerilen biçim her zaman
  `node` + script yolu (aşağıdaki JetSRM örneği).
- **Ortam:** agent ortamı + hook `env` (+ Windows'ta tazelenmiş `Path`). Argümanlar liste olarak geçer; `"` ve
  kontrol karakteri reddedilir.
- **Zaman aşımı:** `timeoutSec` (varsayılan 600); aşılırsa süreç ağacı (alt süreçler dahil) öldürülür. İptal ve
  global zaman aşımı da hook'u öldürür.
- **Olaylar ve çıktı:** `pre_start` olaylarında `message` **yalnız hook adıdır** (`started`, `done`, `failed`).
  Hook çıktısı event'e girmez; maskelenmiş olarak (ilk 200 satır, satır başı 500 karakter) **yerel agent
  loguna** yazılır ve başarısızlıkta son 5 satır `deploy_result` hatasına eklenir. Hook env değerleri,
  indirme token'ları ve runtimeConfig değerleri her metinde `***` ile maskelenir.
- **Hata:** sıfır olmayan çıkış kodu ya da zaman aşımı → aşama hatası → hepsi-ya-da-hiçbiri geri alma.
- Geri almada (otomatik ya da `artifact_rollback`) hook'lar **çalıştırılmaz**.

> **Uyarı — migration sonrası geri alma:** migration başarılı olduktan sonra başlatma ya da health-check
> düşerse agent **eski kodu yeni şemanın üstüne** geri koyar; IDP şemayı geri almaz (`db:migrate:undo`
> çalıştırılmaz). Bu yalnız migration'lar **geriye uyumluysa** güvenlidir (expand/contract: önce kolon ekle,
> kodu geçir, eski kolonu sonraki sürümde sil). Değilse riskli sürümleri ayırın (önce yalnız migration içeren
> sürüm, sonra kod).

## 8. Geri alma

**Otomatik (deploy içinde):** Faz 2'de bir hata olursa dokunulan bileşenler ters sırayla: durdur → canlı
dizini staging'e geri taşı, önceki sürümü canlıya al → başlat → health (`expectVersionPath` varsa önceki
sürümü bekler). İlk kurulumda (önceki sürüm yoktu) yeni dizin kaldırılır, servis başlatılmaz. Sonuçta
`rolledBack:true`, bileşenlerde `rolledBack` ve `error` (asıl hata ya da "baska bir bilesen basarisiz oldugu
icin geri alindi"). Geri alma adımlarının kendi sorunları `error` içine `geri alma sorunu: …` olarak eklenir.

**İptal (`artifact_cancel`):** işbirlikçi bayrak adımlar arasında denetlenir. Faz 1'de: süren indirme hemen
kesilir, canlıya dokunulmaz, `error:"cancelled"`, `rolledBack:false`. Faz 2'de: süren durdurma/yeniden
adlandırma yarıda kesilmez, hook süreci öldürülür, health yoklaması durur; ardından tüm dokunulan bileşenler
geri alınır. Son bileşenin health'i geçtikten sonra gelen iptalin etkisi yoktur.

**Zaman aşımı:** payload `timeoutSec` dolunca iptal ile aynı yol, `error:"timeout"`.

**`artifact_rollback`:** `state.json`'dan her bileşenin en son önceki sürümü canlıya alınır (`components:
null` = önceki sürümü olan tüm bileşenler). Önce canlıdaki korunan dosyalar (preserve desenleri state'ten)
önceki sürüm dizinine kopyalanır, sonra durdur → swap → başlat → health (önceki sürümü bekler). Başarıda
yığının tepesi düşer ve geri alınan (kötü) sürümün dizini silinir; tekrar `artifact_rollback` bir öncekine
gider. Başarısızsa bileşenler bulundukları sürüme döndürülür. Sonuç: `version` = geri dönülen ortak sürüm,
bileşen `previousVersion` = geri almadan önceki sürüm.

`state.json` (sözleşme alanları + geri alma meta verisi; token, runtimeConfig ve hook yazılmaz):

```json
{ "schema": 1, "components": { "backend": {
  "version": "2.5.0", "deployedAt": "2026-09-11T10:00:00Z", "deployId": "dep_…", "subdir": "backend",
  "runtimeType": "nssm", "serviceName": "jetsrm-backend", "appPool": null,
  "healthUrl": "http://127.0.0.1:3000/health", "healthExpectVersionPath": null, "healthTimeoutSec": 90,
  "preserve": [".env", "certificates/**", "uploads/**"],
  "previousVersions": ["2.4.0"],
  "previousReleases": [ { "version": "2.4.0", "dir": "backend-2.4.0-20260911T095900123Z", "archivedAt": "…" } ] } } }
```

Bozuk `state.json` deploy sırasında `state.json.corrupt-<ms>` olarak kenara alınır ve boş durumla devam
edilir; `prev\` içindeki izlenmeyen dizinler otomatik silinmez (elle temizlenir).

## 9. Güvenlik notları

- **Yol hapsi:** tüm yollar `base-path`'in gerçek yolu altında. Canlı dizin ve `.releases` symlink/junction
  olamaz, gerçek yolu doğrudan tabanın altında olmalı; tar girdileri ve preserve desenleri kaçamaz;
  `prev`/`state.json`'dan okunan adlar tek güvenli segment olarak yeniden doğrulanır.
- **Kabuk yok:** tüm süreçler argüman listesiyle; servis/app pool adları katı düzenli ifadeyle. Windows komut
  yolları mutlak (`%SystemRoot%\System32\…`).
- **Token:** yalnız `Authorization` başlığında gider; loglanmaz, event'e/sonuca girmez, `toString`'de `***`.
  Yönlendirme izlenmez (token başka hosta gitmez). `X-IDP-Agent-Id` başlığı backend'in token'ı agent'a
  bağlamasını sağlar. Üretimde indirme URL'i `https://` olmalı (`IDP_PUBLIC_URL`); `http://` yalnız test içindir.
- **Değerler:** runtimeConfig değerleri yalnız `config.js`'e yazılır (state/log/event'e değil); hook env
  değerleri hiçbir yere yazılmaz, süreç çıktısında yankılanırsa maskelenir. Yine de sırları hook env'ine değil
  sunucudaki `.env`'e (preserve) koyun.
- **Hook'lar agent'ın kimliğiyle (Windows'ta SYSTEM) çalışır.** Bu yüzden izin listesi, PATH çözümü ve
  base-path dışı zorunluluğu vardır; hook tanımı yalnız proje yöneticisindedir.
- **Klasör ACL'leri (Windows):**
  - IIS siteleri **`<base>\backend` / `<base>\frontend`'i gösterir, tabanı değil.** Taban bir IIS sitesinin
    kökü olursa `.releases\` (eski `.env` kopyaları, `state.json`) web'e açılır.
  - Agent klasörü (`%ProgramData%\IDP\Agent\<id>` ya da `<base>\agent`) IIS site yollarının **dışında** kalmalı;
    yalnız SYSTEM + Administrators, kalıtım kesik:
    `icacls "C:\inetpub\wwwroot\jetsrm\agent" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"`
  - `.releases\` içindeki önceki sürümler korunan `.env` / sertifika kopyalarını içerir; aynı ACL'i
    `.releases` için de uygulayın (agent SYSTEM olarak yazar; servis ve IIS hesaplarının erişimi gerekmez).
- **Boyut sınırları:** artifact ≤ 16 GB (payload), açılan veri ≤ 4 GB, ≤ 200.000 girdi.

## 10. JetSRM notları

- **Backend (Node.js, NSSM):** servisin `AppDirectory`'si backend kökü olmalı
  (`nssm set jetsrm-backend AppDirectory C:\inetpub\wwwroot\jetsrm\backend`): `.env` ve locale dosyaları
  çalışma dizinine göre okunur. Swap aynı yola yeni dizini koyduğu için AppDirectory değişmeden doğru kalır.
- **Swap öncesi durdurma şart:** `bcrypt`'in native `.node` dosyası çalışan süreç tarafından kilitlenir;
  runtime `nssm` olmalı (`none` değil) ki agent yeniden adlandırmadan önce servisi durdursun.
- **Preserve:** `.env`, `certificates/**`, `uploads/**` (loglar backend içindeyse `logs/**`).
- **Health:** `/health` `{ "type": true, … }` döner, sürüm içermez → `expectVersionPath` vermeyin (düz 200).
- **Migration:** uygulama açılışta migrate etmez; preStart hook:
  `{ "name": "migrate", "command": "node", "args": ["node_modules/sequelize-cli/lib/sequelize", "db:migrate"],
  "env": { "NODE_ENV": "prod" } }`. `node` makine PATH'inde olmalı (agent PATH'i kayıt defterinden tazeler).
  §7'deki geri alma uyarısı geçerlidir.
- **Frontend (IIS statik):** `iis-static`, preserve `web.config`, `runtimeConfig` → `config.js`; `appPool`
  verilirse swap sonrası geri dönüştürülür.

## 11. Bilinen sınırlar / macOS'ta doğrulanamayanlar

- Gerçek NSSM / `sc.exe` / `appcmd.exe` davranışı, Windows dosya kilitleri altında yeniden adlandırma,
  junction tespiti, boşluklu app pool adının appcmd'ye tırnaklanması ve Windows ACL'leri yalnız sahte
  çalıştırıcılarla test edildi; ilk Windows kurulumunda uçtan uca doğrulanmalı.
- `deploy_result` gönderilirken WebSocket kopuksa sonuç kaybolur (tamponlanmaz); backend `timeoutSec + 60 sn`
  sonra deploy'u başarısız sayar. Gerçek durum için `artifact_status` (state.json) kullanılabilir.
- Preserve durdurmadan **önce** yapılır (kesinti kısa kalsın diye): o arada korunan yollara yazılan dosyalar
  önceki sürüm dizininde kalır. Büyük ve sürekli yazılan veriyi (uploads) bileşen dizini dışında tutmak en iyisi.
- Agent kapanıp açılırsa süren deploy yarım kalabilir (staging/prev dizinleri durur); bir sonraki deploy
  staging'i temizler, gerekirse `artifact_rollback` kullanılır.

## 12. Testler

`mvn -B test` (JUnit 5; macOS/Linux'ta Windows komutları sahte `ProcessRunner`/`RuntimeController` ile):
`DeployConfigTest`, `DeployPayloadsTest`, `DeployLayoutTest` (symlink kaçışı), `ArtifactExtractorTest`
(traversal/mutlak/sürücü/symlink/hardlink/aygıt/sınırlar, fixture'lar testte üretilir), `ArtifactDownloaderTest`
(yerel `HttpServer`: 200-dışı, 302, yeniden deneme, boyut, iptal), `PreserveCopierTest`,
`RuntimeConfigWriterTest`, `SystemRuntimeControllerTest` (argüman listeleri, durum bekleme),
`SystemProcessRunnerTest` (süreç ağacı öldürme), `HttpHealthCheckerTest`, `DirectorySwapperTest`,
`CommandResolverTest` (Windows npm.cmd → node + npm-cli.js), `ArtifactDeployManagerTest` (uçtan uca: iki
bileşen, health hatasında hepsini geri alma, sha uyuşmazlığı, meşgul kilit, indirmede/switch sonrası iptal,
zaman aşımı, keep-releases temizliği, `artifact_rollback`, `artifact_status`, hook başarı/hata/zaman
aşımı/izin listesi, tek terminal sonuç, sır sızıntısı yok).
