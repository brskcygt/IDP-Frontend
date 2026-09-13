# IDP Desktop (Electron) — T-91

Bu klasör IDP portalının Electron masaüstü kabuğudur. `docs/03-ELECTRON-MIMARI.md`
§2'de tarif edilen **seçenek B (IPC-native)** burada uygulandı: Express artık
Electron içinde hiç çalışmıyor — `backend/src/core/**` (T-58, zaten Express'ten
bağımsız) doğrudan bu sürecin içine `require()` ediliyor, renderer'a
`ipcMain.handle(...)` üzerinden IPC ile sunuluyor. T-90'ın "gömülü HTTP sunucu"
aşaması (`main/backend.js`, `child_process.fork()`, `127.0.0.1:<port>`) tamamen
kalktı.

**Express kalkmadı — sadece bu üründe kullanılmıyor.** `backend/src/server.js`
hâlâ duruyor ve tarayıcı üzerinden erişim için birebir eskisi gibi çalışıyor
(bkz. altta "Tarayıcı sürümü" bölümü). `backend/src/core/**` iki adaptörü de
(HTTP ve IPC) aynı anda besliyor — bu T-91'in kapsam değişikliği kararıydı,
bkz. `docs/03-ELECTRON-MIMARI.md` §2 dipnotu.

`backend/` ve `frontend/` bu klasörle **kardeş** — kök seviyede monorepo
`package.json`'ı yok, `desktop/` kendi bağımlılıklarını kendi
`package.json`'ında yönetiyor.

## Çalıştırma

### Agent kurulum paketinin yerleşimi

`IDP Agent oluştur` akışında deploy taban dizini zorunludur. Agent merkezi bir
`ProgramData/IDP` dizinine değil, ilgili projenin yanında kurulur:

- Windows: `C:\inetpub\wwwroot\<proje>\agent`
- Linux: `/var/www/<proje>/agent`

ZIP; config içermeyen JAR, dış `application.yml` ve hedef yola göre bir kurucu
taşır (`.ps1` veya `.sh`). JAR, config, launcher ve log bu `agent/` dizininde
kalır; Windows Scheduled Task veya Linux systemd servisi de buradan çalışır.
Girilen proje kökü hedefte mevcut değilse kurucu onu otomatik oluşturur; ZIP'in
önceden proje dizinine taşınması veya operatörün webroot altında elle klasör açması
gerekmez. Yol bir dosyaya ya da reparse point/sembolik bağa denk gelirse kurulum
güvenli biçimde durur.

Windows kurucusu webroot altındaki agent dosyalarının IIS tarafından statik
sunulmasını iki katmanda engeller: `web.config` bütün HTTP erişimini reddeder;
NTFS kalıtımını kesip dizini yalnız SYSTEM ve Administrators'a açar. Bu ACL,
agent kimliğini taşıyan `application.yml` ile logları da korur. Linux kurucusu
aynı amaçla dizini `0700`, config/JAR/log dosyalarını `0600` yapar ve servisi
root altında çalıştırır.

### Geliştirme modu

```bash
# 1. terminal — frontend'i Vite dev sunucusuyla ayrı başlat (bu paket
#    kendisi Vite'ı başlatmaz):
cd frontend && npm run dev     # http://localhost:5173

# 2. terminal — Electron'u başlat:
cd desktop && npm install      # ilk seferinde; Electron indirmesi büyük/yavaş olabilir
cd desktop && npm run dev
```

`npm run dev`, `IDP_DESKTOP_ENV=development` ile `electron .` çalıştırır.
Pencere `http://localhost:5173`'ü yükler ve DevTools'u ayrı bir pencerede açar.
Backend HTTP sunucusu **başlatılmaz** — `main/index.js`, `backend/src/core/**`'u
doğrudan bu süreç içine yükler (bkz. altta "Backend nasıl çalışıyor").

### Üretim modu (paketlenmemiş, yerel test)

```bash
cd frontend && npm run build   # frontend/dist/ üretir
cd desktop && npm start        # frontend/dist/index.html'i yükler
```

### Paketleme (T-95 öncesi — imzasız)

```bash
cd desktop && npm run build    # electron-builder, dist/ altına imzasız çıktı üretir
```

`desktop/package.json`'daki `build` bölümü **imzalama/notarization yapmaz**
(`mac.identity: null`, hedef `"dir"` — kurulum paketi değil, sadece açık
klasör). Sertifika tedariki ve imzalama T-95'te ele alınacak.

⚠️ **Bilinen paketleme açığı (T-91'de fark edildi, düzeltilmedi):**
`desktop/package.json`'ın `extraResources` filtresi `"!node_modules{,/**/*}"`
ile backend'in `node_modules`'ını paketten hariç tutuyor. T-90'da bu zararsızdı
(fork edilen backend süreci gerçekte hiç paketlenmiş halde denenmemişti);
T-91'de artık backend modülleri **bu sürecin içine `require()` ediliyor**, yani
paketlenmiş bir build'de `backend/node_modules` da paketin içinde olmalı, yoksa
`require('node-ssh')` vb. üretimde patlar. Bu görevin kapsamı sadece dev-mode
doğrulama (`npm run dev` / `npm start`) olduğundan bu satır düzeltilmedi —
paketleme T-95'in konusu, orada ele alınmalı.

## Backend nasıl çalışıyor (T-91 — artık HTTP değil, IPC)

`main/backendPaths.js`'in `resolveBackendRoot()`'u backend kaynak kökünü bulur
(dev: `../../backend`, paketli: `resourcesPath/backend`). `main/ipc/backendModules.js`
bu kökten ihtiyaç duyulan her modülü **bir kere** `require()` eder
(`core/bootstrap`, `core` barrel'ı, `auth/userStore`, `auth/permissions`,
`services/AuditLogger`, `services/DeploymentManager`, `store/deploymentRepository`,
`store/hostKeyRepository`, `services/vault/PmpService`, `api/projectSerialization`,
`validation/**`, ve `config.js`'in `loadConfig()` sonucu).

`backend/src/core/**`'un her modülü kendi veri dosyalarını (`idp.db`,
`secrets.enc.json`, `users.json`, ...) **kendi dosya konumuna göre**
(`path.join(__dirname, ...)`) çözüyor (bkz. `backend/src/store/db.js`), bu
yüzden main process'ten `require()` edilseler de veri hâlâ `backend/src/`
altında — hiçbir dosya taşınmadı, hiçbir yeni ortam değişkeni gerekmedi.

`core/bootstrap.js`'in `bootstrapCore()`'u (yeni, bu görevde eklendi) Express'ten
bağımsız açılış sırasını (DB migrasyonu, `Deploying`→`Idle` kurtarma,
`DeploymentManager` reconciliation, secret store çözümü) hem `server.js`
(HTTP) hem `main/index.js` (IPC) için TEK yerden çalıştırıyor — ikisi arasında
kod tekrarı yok, ikisi de aynı sırayı izliyor.

`backend/src/secrets/index.js`'in `createSecretStore()`'u Electron içinde
çalıştığını `electron.safeStorage`'ın varlığından otomatik anlıyor ve
`SafeStorageSecretStore`'a (OS Keychain/DPAPI/libsecret — T-92, bu görevden
önce zaten yazılmış) geçiyor; düz Node'da (backend HTTP sunucusu) aynı fabrika
`FileSecretStore`'a (AES-256-GCM + `IDP_SECRET_KEY`) düşüyor. Bu görev
sırasında elle test edilirken ikisi de gözlemlendi (bkz. altta "Gerçekten
çalıştırıp doğrulandı mı?").

**Native modül notu:** `ssh2` (node-ssh'ın altındaki paket) bir native crypto
eklentisi (`sshcrypto.node`) taşıyor, sistem Node'un ABI'sine göre derlenmiş —
Electron'un kendi Node ABI'siyle uyuşmayabilir. `ssh2`'nin kendi kodu bu
`require()`'ı `try/catch` ile sarmalıyor (`lib/protocol/crypto.js`) ve
başarısız olursa sessizce saf JS crypto'ya düşüyor — bu görev sırasında gerçek
bir SSH bağlantı denemesiyle doğrulandı (aşağıya bakın), native modülü
yeniden derlemeye (`electron-rebuild`) gerek kalmadı.

## `desktop/main/ipc/` — IPC köprüsü

Her `Transport` metodu (bkz. `frontend/src/services/transport/types.ts`) için
tam olarak bir `ipcMain.handle` kanalı var:

| Modül | Kanallar |
|---|---|
| `ipc/auth.js` | `idp:auth:login`, `idp:auth:logout`, `idp:auth:me` |
| `ipc/projects.js` | `idp:projects:list/get/create/updateConfig/remove/environments/telemetry/testConnection` |
| `ipc/deploy.js` | `idp:deploy:trigger/abort/submitMfa/sessions/history/logsArchive/subscribeLogs/unsubscribeLogs` |
| `ipc/vpn.js` | `idp:vpn:sessions/clearProjectSession/forceDisconnect` |
| `ipc/hostKeys.js` | `idp:hostKeys:list/forget` |
| `ipc/users.js` | `idp:users:list/create/update/remove` |
| `ipc/audit.js` | `idp:audit:list` |
| `ipc/pmp.js` | `idp:pmp:testConnection` |

Canlı deploy logları ayrı bir push kanalından akıyor: `idp:deploy:log-event`
(main → renderer, `webContents.send`), `ipc/deployLogBridge.js` tarafından
üretiliyor.

### Yetkilendirme

`main/ipc/session.js` masaüstü "oturumunu" tutuyor — HTTP dünyasındaki
`req.session.user`'ın karşılığı, ama cookie/express-session yerine main
process'te bellekte tutulan tek bir `currentUser` (tek pencereli, tek
operatörlü bir araç, `req` diye bir şey yok). `main/ipc/helpers.js`'in
`ipcHandler(action, handler)` sarmalayıcısı her kanal için:

1. `action` verilmişse: `session.getCurrentRole()` ile oturum var mı kontrol
   eder (yoksa "Unauthorized"), sonra `backend/src/auth/permissions.js`'in
   **aynı** `can(role, action)` fonksiyonuyla izni kontrol eder (HTTP'deki
   `requirePermission(action)` middleware'iyle birebir aynı tablo).
   `AUTHENTICATED_ONLY` sentinel'i, HTTP'nin çıplak `requireAuth`'una denk
   düşüyor (herhangi bir rol, sadece giriş yapılmış olması yeterli —
   `idp:pmp:testConnection` gibi).
2. Handler'ı çalıştırır, sonucu döndürür.

Kontrol **atlanmadı** — her IPC handler'da var, HTTP route'larıyla birebir
aynı `Action`/minimum-rol tablosunu kullanıyor.

### Girdi doğrulaması

Renderer güvenilmez kabul edildi. `backend/src/validation/schema.js` /
`projectSchemas.js`'teki **aynı** şemalar (`createProjectSchema`,
`validateProjectConfig`, `deployTriggerSchema`, `userSchema`,
`userUpdateSchema`) HTTP route'larındaki gibi burada da çalıştırılıyor —
geçersiz girdi `ValidationError` olarak (detaylarla birlikte) fırlatılıyor.

### Hata serialization

Electron'un `ipcMain.handle` → `ipcRenderer.invoke` yolu, fırlatılan bir
`Error`'ın sadece `.message`'ını taşıyor — özel alanlar (`.kind`, `.details`)
kayboluyor. Bunun yerine `main/ipc/helpers.js`'in `serializeError()`'ı
`core/errors.js`'in tipli hatalarını (`NotFoundError`/`ValidationError`/
`ConflictError`/`PermissionError`) şu şekle çeviriyor:

```js
{ __idpError: true, kind: 'NotFoundError' | 'ValidationError' | 'ConflictError' | 'PermissionError' | 'Error', message, details? }
```

ve bunu `JSON.stringify` edip `new Error(...)`'un mesajı olarak fırlatıyor.
`frontend/src/services/transport/ipcTransport.ts`'in `parseIpcError()`'u
Electron'un sardığı önekini (`"Error invoking remote method '<channel>': Error: "`)
soyup bu JSON'u geri ayrıştırıyor ve `.kind`/`.details` taşıyan bir
`IpcTransportError` üretiyor — renderer artık hatayı `err.kind` ile ayırt
edebiliyor, sadece `.message` string'iyle değil.

`backend/src/auth/userStore.js`'in `.code`'lu düz hataları (`USERNAME_TAKEN`,
`LAST_ADMIN`, `NOT_FOUND`, `INVALID_*`) `normalizeUserStoreError()` ile aynı
`core/errors.js` taksonomisine eşleniyor — ikinci bir hata sınıflandırması
gerekmedi.

### Late-join replay (canlı log akışı)

`ipc/deployLogBridge.js`, SSE route'unun (`backend/src/routes/deploy.js`)
`Last-Event-ID` davranışının birebir IPC karşılığı:

1. Renderer (`ipcTransport.ts`) bir `subscriptionId` üretir, ÖNCE
   `window.idp.deploy.onLogEvent(...)` ile dinleyicisini kaydeder, SONRA
   `window.idp.deploy.subscribeLogs(deploymentId, subscriptionId, fromIndex)`
   çağırır — dinleyici kayıttan önce hiçbir olay kaçırılamaz.
2. Main process, `fromIndex`'ten (ilk abonelikte `0`) itibaren
   `deploymentManager`'ın buffer'ındaki her satırı **senkron olarak**
   `idp:deploy:log-event` ile gönderir (Faz 1: replay) — SSE route'unun
   `Last-Event-ID`'den sonrasını tekrar oynatmasıyla birebir aynı.
3. Sonra `deploymentManager.subscribe()` ile canlı akışa geçer (Faz 2),
   index sırası buffer'ın bıraktığı yerden devam eder (`DeploymentManager`
   sayacı sahibi — ayrı bir yerel sayaç yok, drift riski yok).
4. Terminal bir status (`succeeded`/`failed`/`aborted`) aboneliği otomatik
   kapatır (`end` olayı gönderilir).

Bu mantık `desktop/main/ipc/deployLogBridge.js`'te **Electron'a hiç
bağımlı değil** (`require('electron')` yok) — `desktop/main/ipc/deployLogBridge.test.js`
altı testte gerçek `backend/src/services/DeploymentManager`'a karşı (sahte
değil) düz Node'da doğrulandı: `node --test desktop/main/ipc/deployLogBridge.test.js`.
Late-join replay, non-zero `fromIndex` resume, bilinmeyen deployment,
terminal-status'ta otomatik kapanma, aynı `subscriptionId` ile yeniden abone
olma, ve `unsubscribeAll()` — hepsi ayrı test.

## `desktop/preload/index.js`

`window.idp` artık HTTP döneminin iki senkron metodunun (`getApiBaseUrl`,
`getVersion`) yerine, `Transport` arayüzündeki her operasyon için bir metot
taşıyan tam IPC köprüsü. Her metot **sabit** bir kanal adına `ipcRenderer.invoke`
çağırıyor — renderer keyfi bir kanal adı gönderemez, sadece bu whitelist'teki
sabit metotları çağırabilir. `ipcRenderer`'ın kendisi hiç expose edilmiyor;
`deploy.onLogEvent(callback)` bile `ipcRenderer.on`/`removeListener`'ı sarmalayıp
bir unsubscribe fonksiyonu döndürüyor.

## `frontend/src/services/transport/ipcTransport.ts`

`Transport` arayüzünü birebir implemente ediyor, `window.idp.*`'a delegasyon
yapıyor. `getTransport()` (`services/transport/index.ts`) artık `window.idp`
varsa `ipcTransport`'u döndürüyor (`httpTransport`/`createHttpTransport`
tarayıcı sürümü için hâlâ orada duruyor, ama Electron'da hiç kullanılmıyor).

**Hook'ların/bileşenlerin dışarıya verdiği API değişmedi** — `useDeploymentLogStream`
birebir aynı, sadece altındaki `transport.deploy.subscribeLogs()` artık IPC'ye
gidiyor. `frontend/src/components/**`'e hiç dokunulmadı.

## Tarayıcı sürümü — hiç değişmedi mi?

`backend/src/server.js` (315 satırdan biraz uzadı — `bootstrapCore()` çağrısı
eklendi, davranış birebir aynı), `routes/**`, `middleware/**` dokunulmadan
duruyor. `frontend/src/services/transport/httpTransport.ts` de hiç
değişmedi — `getTransport()`'un `window.idp` yokken döndürdüğü tek şey o.

Bu görev sırasında elle doğrulandı: `cd backend && npm start` (gerçek
`idp.db`/`secrets.enc.json`'a karşı, port 3001) + `cd frontend && npm run dev`
(port 5173) ile `curl http://localhost:3001/api/auth/me` → `401`,
`curl -X POST http://localhost:5173/api/auth/login` (Vite proxy üzerinden) →
`401` (geçersiz kimlik bilgisiyle, beklenen), `curl http://localhost:5173/src/main.tsx`
→ `200`. Backend'in kendi `npm test`'i (343 → **360** test, T-91'in eklediği
`bootstrap.test.js`'in 3 testi dahil) ve kök `./verify.sh` (7/7) bu görev
boyunca sürekli yeşil kaldı.

## Gerçekten çalıştırıp doğrulandı mı?

Evet — gerçek bir Electron süreciyle (bu makinede, macOS), üretim modunda
(`frontend/dist` + gerçek sandboxed preload + gerçek CSP), `window.idp.*`
üzerinden **gerçek IPC çağrılarıyla** uçtan uca doğrulandı (izole bir geçici
SQLite'a karşı — `IDP_DB_PATH`; gerçek `users.json`/`secrets.enc.json` test
öncesi yedeklenip test sonrası aynen geri yüklendi, hiçbir gerçek veri
kaybolmadı/değişmedi):

- **Giriş:** `auth.login('admin', ...)` başarılı; yanlış parola doğru şekilde
  `Invalid credentials` ile reddedildi (typed error IPC sınırını aşıp
  renderer'a ulaştı).
- **Yetkilendirme gerçekten uygulanıyor:** `deployer` rolüyle giriş yapıp
  `users.list()` (admin-only, `user:manage`) çağrıldığında **gerçekten**
  `PermissionError` ile reddedildi — kod var demek yetmiyordu, çalıştığı
  kanıtlandı.
- **Proje listesi:** `projects.list()` gerçek (migrate edilmiş) proje
  verisini döndürdü.
- **Ayarlar kaydetme:** yeni oluşturulan bir test projesine
  `projects.updateConfig(id, { host, port, username, password, ... })`
  başarıyla uygulandı.
- **Bağlantı testi:** `projects.testConnection(id)` erişilemeyen bir host'a
  karşı doğru şekilde `{ ok: false, checks: [...] }` döndürdü (TCP
  reachability check "Connection ... was refused").
- **Canlı log akışı:** `deploy.trigger(...)` gerçek bir SSH bağlantı denemesi
  başlattı (ssh2, native crypto binding'i Electron ABI'siyle uyuşmadığı için
  saf JS'e düştü — bkz. yukarıdaki native modül notu), hedef erişilemez
  olduğu için başarısız oldu, ve **bu başarısızlığın her adımı** —
  `[SSH] Initiating...`, private key fallback uyarısı, `status: running`,
  `[System] ✗ Deployment failed: ...`, `status: failed`, `end` — gerçek
  `idp:deploy:log-event` kanalından, gerçek `subscribeLogs`/late-join-replay
  yoluyla renderer'a ulaştı.
- **Deploy history / audit log:** başarısız deployment `deploy.history()`'de
  (`status: 'failed'`, hata mesajıyla) ve `audit.list()`'te
  (`DEPLOY_FAILED`) doğru şekilde göründü.
- **Çıkış:** `auth.logout()` sonrası `auth.me()` → `null`.
- **Görsel doğrulama:** `win.capturePage()` ile gerçek bir ekran görüntüsü
  alındı (T-90'da bu ortamda mümkün değildi) — giriş ekranı fontlarıyla,
  renkleriyle, layout'uyla eksiksiz render edildi. İlk denemede Google Fonts
  stylesheet'i CSP'nin `style-src`'i tarafından engellendiği tespit edildi
  (`https://fonts.googleapis.com` eksikti — T-90'dan kalma, bu görevde
  keşfedildi) ve `main/security.js`'e `style-src`/`font-src`'e Google Fonts
  origin'leri eklenerek düzeltildi.
- **Ayrı bir hata da bu şekilde bulunup düzeltildi:** üretim modunda
  (`win.loadFile('frontend/dist/index.html')`, yani `file://`) Vite'ın
  varsayılan `base: '/'`'i `<script src="/assets/...">` üretiyordu — bu,
  `file://` altında dosya sistemi KÖKÜNE çözülüyor (index.html'e göre değil),
  yani üretim modunda pencere **hep boş beyaz** açılıyordu (React hiç mount
  olmuyordu — T-90'ın kendi doğrulaması bunu fark edememişti, çünkü o zaman
  ekran görüntüsü alınamamıştı). `frontend/vite.config.ts`'e `base: './'`
  eklenerek düzeltildi; Vite dev sunucusu (tarayıcı + Electron dev modu)
  etkilenmedi (ayrıca doğrulandı).
- Metodoloji notu: doğrulama gerçek UI'da elle tıklanarak değil,
  `webContents.executeJavaScript()` ile sayfaya enjekte edilen bir script'in
  gerçek `window.idp.*` köprüsünü (yani gerçek preload + gerçek
  `ipcMain.handle` zincirini) çağırmasıyla yapıldı — bu ortamda GUI tıklama
  otomasyonu yoktu. Test scripti repoya dahil değil (`/tmp` altında,
  geçiciydi).

## Bu görevde (T-91) YAPILMAYANLAR (bilerek)

- **Paketlenmiş (electron-builder) build'in gerçekten çalıştırılması** —
  sadece dev-mode (`npm run dev` / `npm start`) doğrulandı.
- **Kod imzalama / notarization / auto-update** — T-95.
- **CI entegrasyonu** — `verify.sh` ve `.github/workflows/**`'e dokunulmadı
  (görev kısıtı).
- **IPC kanalları için ayrı bir rate-limiting katmanı** — HTTP tarafında
  `deploy:trigger`/`test-connection`/login için vardı
  (`middleware/rateLimit.js`); IPC tarafında eklenmedi.
- **Ayrıcalıklı VPN/sudo işlemleri, SAML BrowserWindow** — bunlar T-93/94.
  (`safeStorage`/T-92 bu görevden ÖNCE zaten tamamlanmıştı — bkz. yukarıdaki
  "Backend nasıl çalışıyor" bölümü.)

> **Not (sonraki görevler bu boşlukları kapattı):** T-91b, IPC login/deploy
> kanallarına HTTP ile aynı çekirdeği (`backend/src/core/rateLimiter.js`)
> kullanan bir rate-limit katmanı ekledi (bkz. `main/ipc/helpers.js`'in
> `ipcHandler(action, handler, { rateLimit })`'i). T-95, gerçek paketlemeyi
> (`npm run build`) çalıştırıp doğruladı, üstüne env-var tetiklemeli kod
> imzalama/notarization/auto-update iskeleti ve CI/`verify.sh` entegrasyonu
> ekledi — bkz. `docs/06-DAGITIM.md`. `node_modules` paketleme açığı zaten bu
> görevden önce `build/afterPack.js` ile çözülmüştü (yukarı bakın).
