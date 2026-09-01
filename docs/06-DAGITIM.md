# IDP — Masaüstü Dağıtım (Paketleme, İmzalama, Otomatik Güncelleme)

> Son güncelleme: 2026-08-20 · Kapsam: T-95 (`electron-builder` + kod imzalama +
> notarization + `electron-updater` iskeleti)
> İlgili: `docs/03-ELECTRON-MIMARI.md`, `docs/04-TODO.md` → T-95, `desktop/README.md`,
> `desktop/electron-builder.js`, `desktop/build/notarize.js`, `desktop/main/updater.js`

Bu doküman `desktop/` klasöründeki Electron uygulamasının **imzalı, notarize
edilmiş, dağıtılabilir** bir build'e nasıl dönüştürüleceğini anlatır. Hiçbir
gerçek sertifika, parola veya iç URL içermez — yalnızca hangi ortam
değişkeninin ne işe yaradığını ve nereden tedarik edileceğini açıklar.

**Bugünkü durum (bu görev öncesi ve sonrası):** sertifika/kimlik bilgisi
verilmeden `cd desktop && npm run build` çalıştırıldığında **imzasız** bir
`.app` (macOS) / dizin (Windows/Linux) üretilir — bu, T-90/T-91'den beri var
olan davranış, T-95 onu BOZMADI, sadece üstüne env-var tetiklemeli bir
imzalama/notarization/güncelleme katmanı ekledi. Sertifika yoksa hiçbir ek
adım devreye girmez, konsola sadece uyarı basılır.

---

## 1. Neden imzalama + notarization zorunlu (Gatekeeper)

macOS Catalina (10.15) itibarıyla Gatekeeper, **imzasız VEYA imzalı-ama-
notarize-edilmemiş** bir uygulamayı başka bir Mac'te ilk kez açmaya
çalışıldığında engeller ("değiştirilmiş/hasar görmüş" gibi belirsiz bir
hata verir; kullanıcı "Sistem Ayarları > Gizlilik ve Güvenlik"e gidip elle
izin vermedikçe hiç açılmaz). Bu, tek bir geliştirme makinesinde
`npm run build` ile üretilip **başka birine dağıtılacak** her build için
geçerli — kendi makinenizde "sağ tık > Aç" ile atlatabilirsiniz, ama bu bir
kurumsal dağıtım stratejisi değildir (MDM ile sessiz kurulumda kullanıcıya
hiç diyalog gösterilmez, kurulum sessizce başarısız olur).

Windows'ta imzasız `.exe` SmartScreen tarafından "Unknown Publisher" olarak
işaretlenir — engellenmez ama kullanıcıyı "Yine de çalıştır" tıklamaya
zorlar, kurumsal ortamda bu da kabul edilebilir değildir.

**Otomatik güncelleme, imzalama olmadan hiç çalışmaz** — bkz. §4.

---

## 2. Sertifika tedariki — süre uyarısı

⚠️ **Bu adım günler/haftalar sürebilir, projeye erken paralel başlatın.**

### macOS — Apple Developer Program + Developer ID

1. Kurumun bir **Apple Developer Program** üyeliği olmalı (yıllık ücretli,
   kurum adına — kişisel hesap değil). Kurumda zaten yoksa, üyelik onayı
   Apple tarafında **günler** sürebilir.
2. Üyelik onaylandıktan sonra Apple Developer hesabından bir
   **"Developer ID Application"** sertifikası oluşturulur (App Store dışı,
   doğrudan dağıtım için gereken sertifika türü — "Mac App Store" sertifikası
   İLE KARIŞTIRMAYIN, o farklı bir dağıtım kanalı içindir).
3. Sertifika + özel anahtar bir `.p12` dosyası olarak dışa aktarılır
   (Keychain Access → sertifikayı seç → sağ tık → "Export").
4. **App Store Connect'te bir "app-specific password" oluşturun**
   (appleid.apple.com → Sign-In and Security → App-Specific Passwords) —
   normal Apple ID parolanız notarization için KULLANILAMAZ, bu ayrı,
   iptal edilebilir bir parola.
5. Ekibin/kurumun **Team ID**'si Apple Developer hesabının
   "Membership" sayfasında görünür (10 karakterlik alfanumerik kod).

### Windows — Authenticode

1. Bir kod imzalama sertifikası (**OV** — Organization Validation, veya
   tercihen **EV** — Extended Validation, SmartScreen itibarını daha hızlı
   kazandırır) bir CA'dan (DigiCert, Sectigo, vb.) satın alınır. Kurumsal
   kimlik doğrulaması (ticaret sicili, D-U-N-S numarası vb.) gerektirir —
   bu da günler sürebilir. EV sertifikalar genellikle donanım token'ında
   (USB HSM) teslim edilir; bu durumda CI'da otomatik imzalama için ek bir
   imzalama servisi (ör. Azure Trusted Signing, DigiCert KeyLocker) gerekir
   — düz `.pfx` dosyası CI'a taşınamaz.
2. `.pfx`/`.p12` formatında dışa aktarılır (bir parola ile korunur).

---

## 3. Ortam değişkenleri

`desktop/electron-builder.js`, aşağıdaki değişkenlerin varlığına göre
imzalama/notarization/publish davranışını **otomatik** belirler — hiçbiri
zorunlu değildir, hiçbiri koda sabit yazılmaz.

| Değişken | Ne işe yarar | Yoksa ne olur |
|---|---|---|
| `CSC_LINK` | macOS `.p12` sertifika dosyasının yolu (veya base64 içeriği — electron-builder'ın kendi standardı) | `mac.identity: null` — imzasız build (bugünkü davranış) |
| `CSC_KEY_PASSWORD` | `.p12` dosyasının parolası | Yukarıdakiyle aynı |
| `APPLE_ID` | Notarization için Apple ID (kurumun geliştirici hesabı) | Notarization atlanır — build imzalı ama notarize edilmemiş kalır (Gatekeeper yine engeller) |
| `APPLE_APP_SPECIFIC_PASSWORD` | §2'de oluşturulan app-specific password | Yukarıdakiyle aynı |
| `APPLE_TEAM_ID` | Apple Developer Team ID | Yukarıdakiyle aynı |
| `WIN_CSC_LINK` | Windows `.pfx` sertifika dosyasının yolu | İmzasız `.exe` |
| `WIN_CSC_KEY_PASSWORD` | `.pfx` dosyasının parolası | Yukarıdakiyle aynı |
| `IDP_UPDATE_FEED_URL` | Kurum içi güncelleme feed URL'i (§5) | `publish` yapılandırılmaz, `main/updater.js` sessizce devre dışı kalır |

Bu değişkenler build makinesine (yerel veya CI runner) **secret olarak**
enjekte edilir — hiçbir zaman repoya, `.env`'e veya loglara yazılmaz. CI
kullanıyorsanız GitHub Actions'ın "Repository secrets" mekanizmasını
kullanın (`.github/workflows/ci.yml`'deki `desktop` job'ı bilerek paketleme
YAPMIYOR — bkz. §6 — bu yüzden bugün CI'da bu secret'lara ihtiyaç yok; gerçek
imzalı build ayrı bir manuel/release workflow'unda üretilmeli, o workflow bu
tabloyu referans alabilir).

`CSC_LINK`/`CSC_KEY_PASSWORD` ve `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`
ikilileri de facto electron-builder standardıdır (kütüphanenin kendi
belgelerinde aynı isimlerle geçer) — `desktop/electron-builder.js` mac
tarafında bunları electron-builder'ın kendi otomatik keşfine bırakır
(`identity` alanını `null` YAPMAYARAK), Windows tarafında ise şemadaki
gerçek alan adlarına (`cscLink`/`cscKeyPassword`) elle eşler.

---

## 4. Notarization neden zorunlu, imzalama tek başına yetmez

Kod imzalama yalnızca "bu ikili X kişi/kurum tarafından imzalandı ve o
imzadan beri değişmedi" der — Apple'ın kötü amaçlı yazılım taraması bunun
İÇİNDE değildir. **Notarization**, imzalı ikiliyi Apple'ın notary servisine
gönderip otomatik bir kötü amaçlı yazılım taramasından geçirme ve sonucu
uygulamaya "staple" etme sürecidir. macOS 10.15+ Gatekeeper, imzalı ama
notarize edilmemiş bir uygulamayı da varsayılan olarak engeller.

`desktop/build/notarize.js`, electron-builder'ın `afterSign` hook'u olarak
çalışır ve `@electron/notarize` paketini kullanır (electron-builder v24+
notarization'ı kendi içinde otomatik yapmıyor — bu artık projenin kendi
sorumluluğu, resmi öneri de bu). **Hem sertifika HEM DE üç Apple kimlik
bilgisi birlikte yoksa hook tamamen no-op'tur** — konsola tek satır bilgi
mesajı basar, hata fırlatmaz. Bu, imzasız/yerel bir `npm run build`'in T-95
öncesiyle birebir aynı şekilde çalışmaya devam etmesini garantiler (bkz.
görev doğrulaması: `desktop/build/notarize.js` gerçek bir build'de test
edildi, "notarization ATLANIYOR" mesajı doğru şekilde basıldı).

---

## 5. Kurum içi güncelleme feed'i

`electron-updater`, `publish` yapılandırmasında belirtilen bir URL'den
periyodik olarak bir manifest dosyası (`latest.yml` / `latest-mac.yml`)
çeker ve mevcut sürümle karşılaştırır. `desktop/electron-builder.js`
`provider: 'generic'` kullanıyor — yani **kendi barındırdığınız düz bir HTTP(S)
dosya sunucusu** yeterli, GitHub Releases gibi harici bir servise bağımlılık
yok:

1. `IDP_UPDATE_FEED_URL` ortam değişkenini kurum içi bir HTTPS URL'e
   ayarlayın (ör. dahili bir Nexus/Artifactory/S3-uyumlu depo, veya düz bir
   Nginx dizini) — **gerçek URL'i buraya yazmayın**, sadece ortam
   değişkeni olarak build makinesinde tanımlayın.
2. `npm run build` her platform için `latest*.yml` + paket dosyalarını
   `desktop/dist/` altına üretir (bu görevde YAPILMADI — sadece
   yapılandırma hazırlandı, gerçek bir release pipeline'ı bu dosyaları o
   URL'e yükleme adımını içermeli, ör. bir `rsync`/`aws s3 cp` CI adımı).
3. Feed URL'i self-signed sertifika kullanan bir iç sunucudaysa,
   `electron-updater`'ın sertifika doğrulamasını atlamayın — bunun yerine
   kurumun kök CA sertifikasını build/çalıştırma makinelerine (veya
   `NODE_EXTRA_CA_CERTS` ortam değişkeniyle çalışma zamanına) tanıtın.
   Sertifika doğrulamasını devre dışı bırakmak, güncelleme kanalını bir
   MITM saldırısına açık hale getirir — bu asla yapılmamalı.

`desktop/main/updater.js`, `IDP_UPDATE_FEED_URL` build sırasında
tanımlanmadıysa (yani paketlenmiş uygulamada `app-update.yml` hiç yoksa)
`autoUpdater.checkForUpdates()`'in reddettiği promise'i yakalayıp sadece
loglar — kullanıcıya hiçbir hata/diyalog göstermez. Bu modül henüz
`main/index.js`'e bağlanmadı (bu görev boyunca o dosyaya dokunulmadı — bkz.
`desktop/main/updater.js`'in kendi doc yorumundaki tek satırlık entegrasyon
örneği); bağlandığında sıfır ek yapılandırmayla "yoksa sessiz kal" davranışı
otomatik devreye girer.

### İmzasız build'de otomatik güncelleme çalışmaz

`electron-updater`, indirdiği güncellemeyi **çalışan uygulamanın kendi kod
imzasına karşı** doğrular — imzasız bir build üzerinde güncelleme
kontrolü/indirme adımları çalışsa bile son "quit and install" adımı
başarısız olur (bu, electron-updater'da atlanamayan bir platform kısıtı,
bu projenin bir eksiği değil). Otomatik güncellemenin gerçekten işe
yaraması için build'in HEM imzalı HEM notarize edilmiş olması gerekir —
bkz. `desktop/main/updater.js`'in doc yorumundaki 2. madde.

---

## 6. MDM (Jamf/Intune) ile dağıtım notu

- **macOS (Jamf Pro / Jamf Now):** notarize edilmiş bir `.app` (veya ondan
  üretilmiş bir `.pkg`/`.dmg`) Jamf'a bir "Policy" veya "Patch Management"
  paketi olarak yüklenir. Jamf, kurulumu sessizce (kullanıcı etkileşimi
  olmadan) yapabilmek için uygulamanın **notarize edilmiş** olmasını
  fiilen şart koşar — notarize edilmemiş bir paket sessiz kurulumda da
  Gatekeeper tarafından engellenir, MDM bunu atlatamaz.
- **Windows (Intune):** `.exe`/`.msi` bir Win32 app olarak Intune'a
  yüklenir; Authenticode imzası olmayan bir ikili Intune'un kendisini
  engellemez ama SmartScreen kullanıcı tarafında yine uyarı gösterir —
  sessiz/otomatik kurulum senaryolarında (Intune "required" assignment)
  bu genelde sorun yaratmaz (kullanıcı diyalogla etkileşmez), ama ilk
  manuel çalıştırmalarda (ör. pilot test) yine de görünür.
- Her iki platformda da **otomatik güncelleme (§4-5) ile MDM dağıtımı
  birbirini DIŞLAMAZ ama çakışabilir** — MDM zaten periyodik olarak yeni
  sürüm push ediyorsa, `electron-updater`'ın kendi arka plan kontrolünü de
  açık tutmak aynı güncellemeyi iki farklı yoldan tetikleyebilir. Hangi
  kanalın "gerçek kaynak" olacağına (MDM push mu, self-update feed mi)
  dağıtım stratejisi netleşince karar verilmeli — bu görev sadece
  altyapıyı hazırladı, bu kararı vermedi.

---

## 7. Gerçek bir signed+notarized build nasıl üretilir (özet)

```bash
# Sertifikalar/kimlik bilgileri build makinesinde ortam değişkeni olarak
# hazır olmalı (bkz. §3) — gerçek değerler burada YOK, örnek amaçlı boş.
export CSC_LINK=/path/to/developer-id.p12
export CSC_KEY_PASSWORD='...'
export APPLE_ID='...'
export APPLE_APP_SPECIFIC_PASSWORD='...'
export APPLE_TEAM_ID='...'
# Windows tarafı ayrı bir (genelde Windows) build makinesinde:
export WIN_CSC_LINK=/path/to/cert.pfx
export WIN_CSC_KEY_PASSWORD='...'
# Otomatik güncelleme isteniyorsa:
export IDP_UPDATE_FEED_URL='https://updates.internal.example/idp/'

cd backend && npm ci
cd ../frontend && npm ci && npm run build
cd ../desktop && npm ci && npm run build
```

Sertifika/kimlik bilgisi eksikse `npm run build` yine başarıyla biter —
sadece konsola hangi adımın atlandığını açıklayan uyarılar basar (bu görev
sırasında gerçek bir build ile doğrulandı: hiçbir env var tanımlı değilken
`npm run build` başarıyla tamamlandı, üretilen `.app` gerçekten açıldı).

---

## 8. Bu görevde (T-95) YAPILMAYANLAR (bilerek)

- **Gerçek bir sertifika ile uçtan uca imzalı+notarize edilmiş bir build**
  üretilip test edilmedi — kurumun henüz bir sertifikası yok (bkz. §2'deki
  tedarik süresi uyarısı). Yapılandırma şeması electron-builder'ın kendi
  şema doğrulayıcısına karşı (tüm env var'lar simüle edilerek) doğrulandı,
  ama gerçek Apple notary servisine hiç istek atılmadı.
- **Güncelleme dosyalarının (`latest*.yml` + paketler) gerçek bir HTTP(S)
  sunucusuna yüklenmesi** — `publish` yapılandırması hazır, ama bunu bir
  URL'e yükleyen CI/release adımı bu görevin kapsamında değildi.
- **`main/updater.js`'in `main/index.js`'e bağlanması** — bu görevin
  kısıtı gereği `main/index.js`'e dokunulmadı (paralel çalışan başka
  görevler o dosyayı düzenliyor). Tek satırlık bağlantı noktası
  `main/updater.js`'in kendi doc yorumunda hazır.
- **CI'da gerçek paketleme** — `.github/workflows/ci.yml`'deki `desktop`
  job'ı bilerek sadece `check:syntax` çalıştırıyor (bkz. §6/o job'ın kendi
  yorumu) — yavaş ve (sertifika olmadan) imzasız bir artefakt üretir.
