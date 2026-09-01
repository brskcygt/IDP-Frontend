package com.idp.agent.managers;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.idp.agent.ConfigLoader;
import com.idp.agent.dto.LanguageUploadPayload;
import com.idp.agent.dto.PostResult;
import com.idp.agent.interfaces.HttpPoster;
import com.idp.agent.logging.AdvancedLogger;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public class LanguageUploadManager {

  public interface ResultSink {
    void accept(Map<String, Object> result);
  }

  private static LanguageUploadManager instance;

  private final AdvancedLogger log = AdvancedLogger.getInstance();
  private final Gson gson = new Gson();
  private final ExecutorService queue = Executors.newSingleThreadExecutor();
  private final HttpPoster poster;
  private final ResultSink sink;
  private final String baseUrl;
  private final String apiPrefix;

  private LanguageUploadManager(HttpPoster poster, ResultSink sink, String baseUrl, String apiPrefix) {
    this.poster = poster;
    this.sink = sink;
    this.baseUrl = baseUrl;
    this.apiPrefix = apiPrefix;
  }

  public static synchronized LanguageUploadManager getInstance() {
    if (instance == null) {
      HttpClient httpClient = buildHttpClient();

      HttpPoster defaultPoster = (url, body) -> {
        HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(url))
          .header("Content-Type", "application/json; charset=utf-8")
          .timeout(Duration.ofSeconds(60))
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();

        HttpResponse<String> response = httpClient.send(
          request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

        return new PostResult(response.statusCode(), response.body());
      };

      ResultSink defaultSink = (result) ->
        WebSocketManager.getInstance().sendMessage("command_execution_result", result);

      instance = new LanguageUploadManager(
        defaultPoster, defaultSink,
        ConfigLoader.getInstance().getAppUrl(), ConfigLoader.getInstance().getAppApiPrefix());
    }

    return instance;
  }

  public static LanguageUploadManager forTesting(HttpPoster poster, ResultSink sink, String baseUrl) {
    return forTesting(poster, sink, baseUrl, "");
  }

  public static LanguageUploadManager forTesting(
      HttpPoster poster, ResultSink sink, String baseUrl, String apiPrefix) {
    return new LanguageUploadManager(poster, sink, baseUrl, apiPrefix);
  }

  /**
   * Sertifika doğrulamasını kabul eden bir HttpClient üretir. Hedef, agent'ın kendi
   * makinesinde loopback üzerinden erişilen uygulamadır; müşteri kurulumları genellikle
   * kendinden imzalı (self-signed) sertifika kullanır, bu yüzden sertifika doğrulaması
   * burada kasıtlı olarak devre dışı bırakılıyor (bkz. AppManager.getCurrentVersion()'daki
   * benzer yaklaşım).
   *
   * Hostname doğrulaması da kapatılıyor. Sertifika zincirini yok saymak tek başına
   * yetmiyor: sunucular sık sık base-url'deki düz HTTP adresini HTTPS'e yönlendiriyor
   * ve varılan sertifikanın SAN listesinde "localhost" gibi bir ad bulunmuyor. Kardemir
   * test kurulumunda ölçüldü (2026-08-06):
   *
   *   base-url: http://localhost:80  ->  302  ->  https://localhost
   *   "No subject alternative DNS name matching localhost found"
   *
   * Sürüm kontrolü aynı yönlendirmeden geçtiği halde çalışıyordu, çünkü AppManager bu
   * sistem özelliğini zaten set ediyor. Onu burada da set etmek davranışı sürüm
   * kontrolüyle eşitliyor ve sıralamaya bağımlılığı ortadan kaldırıyor: özellik JDK'nın
   * HTTP/SSL iç yapısı ilk kez yüklendiğinde okunuyor, dolayısıyla hangi çağrının önce
   * geldiğine güvenmek yerine kendi istemcimizi kurmadan önce garantiye alıyoruz.
   */
  private static HttpClient buildHttpClient() {
    try {
      System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true");

      TrustManager[] trustAllCerts = new TrustManager[]{
        new X509TrustManager() {
          public X509Certificate[] getAcceptedIssuers() { return null; }
          public void checkClientTrusted(X509Certificate[] certs, String authType) {}
          public void checkServerTrusted(X509Certificate[] certs, String authType) {}
        }
      };
      SSLContext sc = SSLContext.getInstance("SSL");
      sc.init(null, trustAllCerts, new SecureRandom());

      return HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .sslContext(sc)
        .build();
    } catch (Exception ex) {
      return HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
    }
  }

  /**
   * baseUrl'i (isteğe bağlı) apiPrefix ve path ile birleştirir. baseUrl, prefix ve
   * path'in baştaki/sondaki '/' fazlalıkları/eksikleri normalize edilir; prefix boş
   * veya null ise sonuç sadece baseUrl + path olur.
   */
  static String buildTargetUrl(String baseUrl, String apiPrefix, String path) {
    String prefix = apiPrefix == null ? "" : apiPrefix.trim();

    if (prefix.endsWith("/")) {
      prefix = prefix.substring(0, prefix.length() - 1);
    }

    if (!prefix.isEmpty() && !prefix.startsWith("/")) {
      prefix = "/" + prefix;
    }

    String normalizedPath = path == null ? "" : path;

    if (!normalizedPath.isEmpty() && !normalizedPath.startsWith("/")) {
      normalizedPath = "/" + normalizedPath;
    }

    String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;

    return base + prefix + normalizedPath;
  }

  public void enqueue(LanguageUploadPayload payload) {
    queue.submit(() -> process(payload));
  }

  private void process(LanguageUploadPayload payload) {
    long startedAt = System.currentTimeMillis();
    boolean success = false;
    String output = "Dil dosyası yüklenirken beklenmeyen bir hata oluştu";

    try {
      String targetUrl = buildTargetUrl(baseUrl, apiPrefix, payload.getPath());
      PostResult result = poster.post(targetUrl, payload.getTexts());
      output = evaluate(result);
      success = output == null;

      if (success) {
        output = "ok";
      }
    } catch (HttpTimeoutException ex) {
      output = "Uygulamaya istek zaman aşımına uğradı";
    } catch (SSLException ex) {
      output = "Uygulamanın TLS sertifikası doğrulanamadı: " + describe(ex);
    } catch (ConnectException ex) {
      output = "Uygulamaya bağlanılamadı: " + describe(ex);
    } catch (Throwable ex) {
      output = "Dil dosyası yüklenirken hata oluştu: " + describe(ex);
    } finally {
      // Sonuç, yukarıdaki denemenin nasıl sonuçlandığından bağımsız olarak her zaman
      // yayınlanmalı: aksi halde dashboard'daki satır süresiz "gönderiliyor" durumunda
      // kalır. Loglama ve sink.accept ayrı ayrı korunuyor ki biri başarısız olsa bile
      // diğeri (özellikle sonucu ileten sink.accept) çalışmaya devam etsin.
      long duration = System.currentTimeMillis() - startedAt;

      try {
        if (success) {
          log.info("Dil yüklendi: " + payload.getPlatform() + "/" + payload.getLang()
            + " (" + duration + " ms)");
        } else {
          log.error("Dil yüklenemedi: " + payload.getPlatform() + "/" + payload.getLang()
            + " — " + output);
        }
      } catch (Throwable logEx) {
        // Loglama başarısız olsa bile sonuç yayınlanmalı; kasıtlı olarak yutuluyor.
      }

      Map<String, Object> message = new HashMap<>();
      message.put("process", "upload_languages");
      message.put("platform", payload.getPlatform());
      message.put("lang", payload.getLang());
      message.put("success", success);
      message.put("output", output);
      message.put("duration_ms", duration);

      try {
        sink.accept(message);
      } catch (Throwable sinkEx) {
        log.error("Dil yükleme sonucu iletilemedi: " + payload.getPlatform() + "/"
          + payload.getLang() + " — " + sinkEx.getMessage());
      }
    }
  }

  /**
   * Bir exception'ın operatöre gösterilecek kısa açıklamasını döner. Mesaj null veya
   * boşsa (örn. ConnectException.getMessage() bazı durumlarda null döner), operatöre
   * literal "null" göstermek yerine exception'ın sınıf adına düşülür.
   */
  private static String describe(Throwable ex) {
    String message = ex.getMessage();

    return message == null || message.isBlank()
      ? ex.getClass().getSimpleName()
      : message;
  }

  /**
   * Başarılıysa null, aksi halde hata mesajı döner.
   */
  private String evaluate(PostResult result) {
    if (result.getStatusCode() == 404) {
      return "Çeviri servisine ulaşılamadı (HTTP 404)";
    }

    if (result.getStatusCode() < 200 || result.getStatusCode() >= 300) {
      return "Uygulama HTTP " + result.getStatusCode() + " döndürdü";
    }

    try {
      JsonObject body = gson.fromJson(result.getBody(), JsonObject.class);

      if (body != null && body.has("type") && !body.get("type").getAsBoolean()) {
        return body.has("message") && !body.get("message").isJsonNull()
          ? body.get("message").getAsString()
          : "Uygulama işlemi reddetti";
      }
    } catch (Exception ex) {
      return "Uygulamanın yanıtı çözümlenemedi: " + ex.getMessage();
    }

    return null;
  }
}
