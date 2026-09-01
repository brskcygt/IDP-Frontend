# IDP — Electron / Masaüstü Mimarisi

> Hedef: portalın masaüstü uygulamasına dönüşmesi.
> Bu doküman **hangi kararların bugünden alınması gerektiğini** tanımlar; Electron'a geçiş
> ancak aşağıdaki hazırlıklar yapılırsa ucuz olur, yapılmazsa baştan yazım gerektirir.

---

## 1. Neden Electron aslında doğru karar

Bu uygulamanın işi doğası gereği **yerel**:

| İş | Nerede çalışmalı |
|---|---|
| VPN tüneli açmak | Kullanıcının makinesinde (route tablosunu değiştirir) |
| SSH/WinRM bağlantısı | VPN'in açık olduğu makinede |
| MFA (telefon onayı, Authenticator) | Kullanıcının yanında |
| SAML/Azure AD login penceresi | Gerçek bir tarayıcı penceresi |

Bugün bunlar **sunucuda** çalışıyor — yani sunucu, kullanıcının VPN kimliğiyle
kullanıcı adına bağlanıyor. Bu hem güvenlik sorunu (SEC-01/06), hem de mimari
uyumsuzluk: VPN küresel bir kaynakken proje bazlı yönetiliyor, iki eşzamanlı deploy
birbirinin route tablosunu bozuyor.

**Masaüstüne geçince bu sorunlar kendiliğinden çözülür.** Electron burada bir "paketleme
tercihi" değil, **mimari düzeltme**.

---

## 2. Ana karar: HTTP değil, IPC

İki seçenek var:

**A) Gömülü sunucu** — Express'i main process içinde başlat, renderer `127.0.0.1:<port>`e bağlansın.
- ✅ Neredeyse hiç kod değişikliği yok
- ❌ Localhost portu açık kalır (makinedeki her uygulama erişebilir)
- ❌ CORS, session cookie, CSRF yüzeyi boşuna taşınır
- ❌ Port çakışması, firewall uyarıları

**B) IPC-native** — renderer, HTTP yerine `ipcMain.handle` ile servis çağırır.
- ✅ Masaüstünde ağ yüzeyi **sıfır** → SEC-04, SEC-13, SEC-14'ün büyük kısmı konusuz kalır
- ✅ Session/cookie/CORS katmanı silinir
- ❌ Route handler'ların servis fonksiyonlarına ayrılması gerekir

**Karar: B — ama Express SİLİNMİYOR.**

### Kararın revizyonu (2026-08-20)

Bu bölüm başta "Express tamamen kalkar" diyordu. T-58 tamamlandıktan sonra bu
gereksiz hale geldi: `backend/src/core/` artık taşımadan tamamen bağımsız ve
Express'ten hiçbir şey bilmiyor (`check-core-boundaries.js` bunu CI'da zorluyor).

Yani HTTP ve IPC **aynı çekirdeğin iki adaptörü**. Express'i silmek tarayıcı
erişimini öldürürdü; korumak tek kod tabanıyla iki dağıtım şekli demek:

```
                  ┌─────────────────────┐
   Tarayıcı ──────► Express (server.js) ─┤
                  │                      ├──► core/  (iş mantığı)
   Electron ──────► IPC (main/ipc/)    ──┤
                  └─────────────────────┘
```

Maliyeti düşük — `server.js` zaten 315 satırlık ince bir kabuk. Kazancı yüksek:
masaüstüne geçiş, web sürümünü kaybetmeden yapılıyor ve iki yol da aynı testlerle
korunuyor.

Geçiş yine **A üzerinden aşamalı** (bkz. §7): önce gömülü sunucu (T-90 ✅),
sonra IPC (T-91).

---

## 3. Hedef proje yapısı

```
idp/
├── packages/
│   └── core/                     # Transport-agnostik çekirdek — Electron ve web ortak
│       ├── adapters/             # Jenkins, Ssh, Windows, Pmp
│       ├── services/             # DeploymentManager, VpnManager, PmpService, Telemetry
│       ├── store/                # SQLite repository (projects, deployments, audit)
│       ├── secrets/              # SecretStore arayüzü (§5)
│       └── index.js              # Saf fonksiyonlar — HTTP/IPC bilmez
├── apps/
│   ├── desktop/
│   │   ├── main/                 # Electron main: pencere, IPC, tray, updater
│   │   ├── preload/              # contextBridge whitelist API
│   │   └── build/                # electron-builder yapılandırması, imza
│   └── web/                      # Mevcut Vite/React renderer (ortak)
└── docs/
```

**Kritik kural:** `packages/core` içinde `express`, `req`, `res`, `socket.io` geçmeyecek.
Bu kural bugünden uygulanırsa Electron geçişi mekanik bir işe döner.

---

## 4. Transport soyutlaması (frontend tarafı)

Frontend iki hedefi de desteklemeli. Tek bir arayüz:

```ts
// frontend/src/services/transport/index.ts
export interface Transport {
  projects: { list(): Promise<Project[]>; save(id, cfg): Promise<Project>; ... }
  deploy: {
    trigger(projectId, params): Promise<{ deploymentId: string }>
    onLog(deploymentId, cb: (line: string) => void): () => void   // unsubscribe döner
    onStatus(deploymentId, cb: (s: Status) => void): () => void
    abort(deploymentId): Promise<void>
    submitMfa(deploymentId, code): Promise<void>
  }
}
```

- `transport/http.ts` → bugünkü `fetch` + `EventSource`
- `transport/ipc.ts`  → `window.idp.*` (preload) + `ipcRenderer.on('deploy:log')`

`useDeploymentLogStream` bu arayüzü kullanacak; **hook'un dışarıya verdiği API değişmeyecek.**
Bu yapılırsa Electron geçişinde React tarafında neredeyse hiçbir şey değişmez.

**Not:** SSE'nin bugünkü "late-join replay" davranışı IPC'de de korunmalı —
`deploy:subscribe` çağrısı önce buffer'ı, sonra canlı akışı vermeli.

---

## 5. Secret yönetimi — Electron'un en büyük kazancı

`safeStorage` OS anahtar deposunu kullanır:

| Platform | Arka uç |
|---|---|
| macOS | Keychain |
| Windows | DPAPI |
| Linux | libsecret / kwallet |

```js
// packages/core/secrets/SecretStore.js  — arayüz
interface SecretStore {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}
// apps/desktop → safeStorage tabanlı implementasyon
// web/dev      → .env anahtarıyla AES-GCM dosya implementasyonu
```

**Sonuç:** `projects.json` artık **hiç secret tutmaz**; sadece `passwordRef: "proj_123.ssh"`
gibi referanslar tutar. SEC-01 kökünden çözülür, `GET /api/projects` sızıntısı da biter.

Bu soyutlama **bugün** yazılmalı (T-10) — Electron'u beklemeye gerek yok.

### Gerçekleşen tasarım (2026-08-20, T-10 tamamlandı)

Arayüz `backend/src/secrets/SecretStore.js` içinde soyut sınıf olarak duruyor:

```
get(key) → string | null      // bulunamazsa null, ASLA throw etmez
set(key, value) → void
delete(key) → boolean
has(key) → boolean
listKeys() → string[]         // değer sızdırmaz
```

Bugünkü implementasyon `FileSecretStore` — AES-256-GCM, `set` başına rastgele 12
baytlık IV, atomik yazma (`tmp` + `rename`), dosya izni `0600`, anahtar
`IDP_SECRET_KEY` ortam değişkeninden.

**Electron'da yapılacak tek şey:** aynı arayüzü `safeStorage` ile implemente edip
`createSecretStore()` factory'sine eklemek. Çağıran hiçbir kod değişmeyecek —
`projectSecrets.js` köprüsü (`persistProjectSecrets` / `resolveProjectSecrets` /
`deleteProjectSecrets`) store'un ne olduğunu bilmiyor.

```js
// apps/desktop/main/SafeStorageSecretStore.js — gelecek
const { safeStorage } = require('electron');
class SafeStorageSecretStore extends SecretStore {
  async set(key, value) {
    const buf = safeStorage.encryptString(value);   // Keychain / DPAPI / libsecret
    await this.db.put(key, buf);
  }
  async get(key) {
    const buf = await this.db.get(key);
    return buf ? safeStorage.decryptString(buf) : null;
  }
}
```

Bu geçişte `IDP_SECRET_KEY` ortam değişkenine gerek kalmaz — anahtar yönetimini
işletim sistemi devralır ve "anahtarı kaybedersen her şey gider" riski ortadan kalkar.

**Açık kalan konu:** secret'lar yalnızca bilinen config alanlarında değil,
serbest metin `scriptContent` gövdelerinin içinde de bulunabiliyor (canlı veride
gömülü bir GitHub PAT'i bu şekilde bulduk). Migrasyon script'i bunları tespit edip
raporluyor ama otomatik taşımıyor. Electron'a geçmeden önce `scriptContent` için
`${secret:AD}` gibi bir enjeksiyon mekanizması tasarlanmalı.

---

## 6. Ayrıcalıklı işlemler (VPN / sudo)

`POST /api/vpn/grant-permissions` (SEC-02) tamamen kalkacak. Yerine:

- **macOS:** `sudo-prompt` veya Authorization Services → işletim sisteminin kendi
  yetki diyaloğu. Parola uygulamaya **hiç girmez**. Kalıcı çözüm için privileged helper
  (`SMJobBless`) — kurumsal dağıtımda tercih edilmeli.
- **Windows:** UAC elevation ile ayrı helper process.
- **Linux:** `pkexec` / polkit policy.

Ayrıca VPN artık **uygulama seviyesinde tekil kaynak** olarak yönetilecek:
tek bir `VpnSupervisor`, kuyruk + referans sayacı + "şu an X projesi tünel tutuyor"
göstergesi. Bu, bugünkü `forceClearAll` (SEC-17) yaklaşımının yerine geçer.

---

## 7. SAML / MFA — Playwright'ı at, Electron penceresi kullan

Bugün `AzureAdMfaHandler` headless Chromium açıp Microsoft login sayfasında
**sabit selector'larla** (`input[type=email]`, `#richDisplaySignId`) form dolduruyor.
Bu yaklaşım kırılgan (Microsoft UI'ı değiştiğinde çöker), riskli
(`rejectUnauthorized:false`) ve kullanıcı parolasını uygulamaya girmeyi zorunlu kılıyor.

**Electron'da doğrusu:**

```js
const authWin = new BrowserWindow({ width: 520, height: 700,
  webPreferences: { partition: 'persist:vpn-auth', sandbox: true } })
await authWin.loadURL(samlUrl)
// kullanıcı kendi kimliğiyle, gerçek pencerede login olur
const cookies = await authWin.webContents.session.cookies.get({ name: 'portal-userauthcookie' })
```

Kazançlar:
- Microsoft'un login akışı değişse bile çalışır (selector bağımlılığı yok)
- Kullanıcı parolası uygulamaya hiç girmez
- Sertifika doğrulaması normal şekilde açık kalır
- **Playwright bağımlılığı (~300 MB Chromium) tamamen kalkar** → paket boyutu

`SamlBrowserAuth.js` zaten ölü kod; `AzureAdMfaHandler` bu yaklaşımla yeniden yazılacak.

> **Güncelleme (credential-driven fork):** `fetchHeadlessCookie()`'deki yol seçimi
> artık platforma değil **kaydedilmiş credential'a** bağlı. Projede VPN kullanıcı adı +
> parola kayıtlıysa headless Playwright otomasyonu desktop'ta da çalışır: e-posta ve
> parola otomatik doldurulur, geriye yalnızca telefondaki Authenticator numara
> eşleşmesi kalır (numara `MFA_NUMBER_MATCHING` event'i ile UI'da gösterilir).
> Otomasyon desktop'ta başarısız olursa interaktif pencereye geri düşülür.
> Credential kayıtlı değilse bu bölümdeki interaktif BrowserWindow yolu aynen
> geçerlidir — parola sürece hiç girmez.

---

## 8. PMP web adapter'ının geleceği

Playwright kalkarsa PMP adapter'ı da yeniden düşünülmeli:
- **Tercih 1:** Hedef portalın API'si varsa adapter tamamen gereksiz — HTTP çağrısına dönsün.
- **Tercih 2:** Gerekiyorsa Electron'un kendi `BrowserWindow`'u ile, `new Function` yerine
  **deklaratif adım listesi** çalıştıran bir yorumlayıcı (SEC-03 çözümü).
- **Tercih 3:** Playwright kalacaksa opsiyonel eklenti olarak, ilk kullanımda indirilsin.

---

## 9. Electron güvenlik temel ayarları (pazarlık konusu değil)

```js
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // zorunlu
    nodeIntegration: false,      // zorunlu
    sandbox: true,
    preload: path.join(__dirname, 'preload.js'),
  }
})
```

- Preload'da **whitelist'li** API; `ipcRenderer`'ı ham haliyle expose etme
- Renderer'a CSP uygula; `webSecurity` açık kalsın
- `will-navigate` ve `setWindowOpenHandler` ile dış navigasyonu engelle,
  harici linkleri `shell.openExternal` ile aç
- IPC handler'larında **girdi doğrulaması** (zod) — renderer güvenilmez kabul edilecek
- `app.setAsDefaultProtocolClient` kullanılacaksa deep-link girdileri doğrulanmalı

---

## 10. Paketleme, imzalama, güncelleme

| Konu | Karar |
|---|---|
| Paketleyici | `electron-builder` |
| macOS | Developer ID imzası + **notarization** (yoksa Gatekeeper açtırmaz) |
| Windows | Authenticode imzası (yoksa SmartScreen uyarısı) |
| Auto-update | `electron-updater` + **kurum içi imzalı release feed** |
| Native modüller | `ssh2`/`node-ssh` için `electron-rebuild`; `nodejs-winrm` saf JS (sorun yok) |
| Dağıtım | Kurumsal MDM (Jamf/Intune) veya iç indirme sayfası |

**Uyarı:** Kod imzalama sertifikaları tedarik süresi uzundur (özellikle EV). Electron'a
geçiş kararı netleşir netleşmez **sertifika süreci paralel başlatılmalı.**

---

## 11. Çok kullanıcılı denetim — hibrit model

Masaüstünde denetim kaydı kullanıcının kendi makinesinde tutulamaz (kullanıcı silebilir).
Kurumsal denetim gerekiyorsa:

```
Desktop (VPN + SSH + deploy — yerel)
   └── audit event ──► Merkezi Audit/Policy servisi (HTTP)
                        ├─ kim, ne zaman, hangi projeye, sonuç
                        ├─ prod deploy onay akışı
                        └─ merkezi proje/policy dağıtımı
```

Bunu **bugünden hazırlamanın yolu:** `AuditLogger`'ı pluggable yapmak
(`FileAuditSink` + `HttpAuditSink`). T-32'de bu var.

---

## 12. Geçiş yol haritası

| Aşama | İş | Durum | Electron gerekli mi? |
|---|---|---|---|
| **E0** | `packages/core` ayrıştırması — Express'ten bağımsız servis katmanı | ⏳ T-58 | Hayır |
| **E1** | `SecretStore` soyutlaması + secret'ları config'den çıkarma | ✅ **BİTTİ** | Hayır |
| **E2** | Frontend `Transport` soyutlaması (HTTP implementasyonu) | ⏳ T-59 | Hayır |
| **E3** | SQLite'a geçiş (dosya JSON yerine) | ⏳ T-53 | Hayır |
| **E4** | Electron iskeleti: main + preload + gömülü mod (A) ile çalıştır | ⏳ T-90 | Evet |
| **E5** | IPC transport implementasyonu (B) — Express **kaldırılmadı**, tarayıcı için ayrı adaptör olarak kalıyor (bkz. §2 revizyonu) | ✅ **BİTTİ** (T-91) | Evet |
| **E6** | `safeStorage`, OS yetki diyaloğu, BrowserWindow SAML | ⏳ T-92/93/94 | Evet |
| **E7** | İmzalama, notarization, auto-update, MDM dağıtımı | ⏳ T-95 | Evet |

**E0–E3 zaten TODO listesindeki işler.** Yani Electron için ekstra iş yapılmıyor —
sadece bu işler **Electron'u düşünerek** yapılıyor. Kritik olan tek şey:
> `packages/core` içine HTTP sızmasın.
