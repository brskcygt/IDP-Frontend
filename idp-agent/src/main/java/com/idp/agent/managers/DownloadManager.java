package com.idp.agent.managers;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

import com.idp.agent.ConfigLoader;
import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.logging.AdvancedLogger;

public class DownloadManager {
	private  final AdvancedLogger log = AdvancedLogger.getInstance();
	private final ConfigLoader config = ConfigLoader.getInstance();
	private static DownloadManager instance;
	
	private final String baseUrl = config.getDownloadBaseUrl();
	private final String packagesDownloadUrl = baseUrl + "/package/download"; 
	private final String agentDownloadUrl = baseUrl + "/agent/download"; 

	private final Map<String, Object> packages = config.getDownloadPackages();
	
	// Shared HttpClient instance to prevent resource exhaustion
	private final HttpClient httpClient;

	private DownloadManager() {
		if (baseUrl == null || packages == null) {
			throw new RuntimeException("DownloadManager için Konfigurasyon tanımlanmamış");
		}
		
		// DNS Cache TTL ayarını 30 saniye yapıyoruz.
		java.security.Security.setProperty("networkaddress.cache.ttl", "30");
		// IPv4 önceliği vererek olası IPv6 timeout sorunlarını önlüyoruz
		System.setProperty("java.net.preferIPv4Stack", "true");
		
		// HttpClient'ı bir kez oluşturup tekrar kullanıyoruz (Best Practice)
		this.httpClient = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(30)) // Bağlantı zaman aşımı artırıldı
			.followRedirects(HttpClient.Redirect.NORMAL)
			.executor(Executors.newCachedThreadPool()) // Thread yönetimi için executor
			.build();
	}

	public static synchronized DownloadManager getInstance() {
		if (instance == null) {
			instance = new DownloadManager();
		}
		return instance;
	}

	/**
	 * İşletim sistemine göre backend paketini indirir
	 * @param destinationDir İndirilen dosyanın kaydedileceği dizin
	 * @return İndirilen dosyanın tam yolu veya başarısız olursa null
	 */
	@SuppressWarnings("unchecked")
	public String downloadBackend(String destinationDir) {
		OperatingSystem os = OperatingSystem.detect();
		Map<String, String> backendPackages = (Map<String, String>) packages.get("backend");
		
		String osIdentifier = os.getIdentifier();
		if (backendPackages == null || !backendPackages.containsKey(osIdentifier)) {
			log.error("Backend paketi bu işletim sistemi için tanımlanmamış: " + osIdentifier);
			return null;
		}
		
		String fileName = backendPackages.get(osIdentifier);
		return downloadFile(packagesDownloadUrl, fileName, destinationDir);
	}

	/**
	 * Frontend paketini indirir (tüm platformlar için aynı)
	 * @param destinationDir İndirilen dosyanın kaydedileceği dizin
	 * @return İndirilen dosyanın tam yolu veya başarısız olursa null
	 */
	@SuppressWarnings("unchecked")
	public String downloadFrontend(String destinationDir) {
		Map<String, String> frontendPackages = (Map<String, String>) packages.get("frontend");
		
		if (frontendPackages == null || !frontendPackages.containsKey("all")) {
			log.error("Frontend paketi yapılandırılmamış");
			return null;
		}
		
		String fileName = frontendPackages.get("all");
		return downloadFile(packagesDownloadUrl, fileName, destinationDir);
	}


	/**
	 * İşletim sistemine göre agent paketini indirir
	 * @param destinationDir İndirilen dosyanın kaydedileceği dizin
	 * @return İndirilen dosyanın tam yolu veya başarısız olursa null
	 */
	@SuppressWarnings("unchecked")
	public String downloadAgent(String destinationDir) {
		Map<String, String> agentPackage = (Map<String, String>) packages.get("agent");
		
		if (agentPackage == null || !agentPackage.containsKey("all")) {
			log.error("Agent paketi yapılandırılmamış");
			return null;
		}
		
		String fileName = agentPackage.get("all");
		return downloadFile(agentDownloadUrl, fileName, destinationDir);
	}

	/**
	 * Her iki paketi de indirir (backend + frontend)
	 * @param destinationDir İndirilen dosyaların kaydedileceği dizin
	 * @return İndirilen dosya yollarını içeren dizi [backend, frontend] veya hata durumunda null
	 */
	public String[] downloadAll(String destinationDir) {
		String backendPath = downloadBackend(destinationDir);
		String frontendPath = downloadFrontend(destinationDir);
		
		if (backendPath == null || frontendPath == null) {
			log.error("Tüm paketler indirilemedi");
			return null;
		}
		
		return new String[] { backendPath, frontendPath };
	}

	/**
	 * Belirtilen dosyayı indirir
	 * @param fileName İndirilecek dosya adı
	 * @param destinationDir Hedef dizin
	 * @return İndirilen dosyanın tam yolu veya başarısız olursa null
	 */
	private String downloadFile(String url, String fileName, String destinationDir) {
		String fileUrl = url + '/' + fileName;
		File destDir = new File(destinationDir);
		
		if (!destDir.exists()) {
			destDir.mkdirs();
		}
		
		File destFile = new File(destDir, fileName);
		
		int maxRetries = 3;
		for (int i = 0; i < maxRetries; i++) {
			try {
				log.info("İndirme denemesi " + (i + 1) + " başlatılıyor...");
				
				HttpRequest request = HttpRequest.newBuilder()
					.uri(URI.create(fileUrl))
					.timeout(Duration.ofMinutes(2)) // İstek zaman aşımı 2dk
					.header("accept-language", "tr")
					.GET()
					.build();

				log.debug("HTTP isteği gönderiliyor...");
				HttpResponse<InputStream> response = this.httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
				log.debug("HTTP yanıtı alındı. Durum kodu: " + response.statusCode());
				
				int responseCode = response.statusCode();
				if (responseCode != 200) {
					log.error("İndirme başarısız. HTTP Yanıt Kodu: " + responseCode);
					Map<String, Object> payloadMap = new HashMap<>();
					payloadMap.put("success", false);
					payloadMap.put("command", "download-" + fileName);
					payloadMap.put("output", "İndirme başarısız. HTTP Yanıt Kodu: " + responseCode);
					WebSocketManager.getInstance().sendMessage("download_file_progress", payloadMap);
				}
				
				long fileSize = response.headers().firstValueAsLong("content-length").orElse(-1);
				log.info("Dosya boyutu: " + formatFileSize(fileSize));
				
				try (InputStream in = new BufferedInputStream(response.body());
					FileOutputStream out = new FileOutputStream(destFile)) {
					
					byte[] buffer = new byte[8192];
					int bytesRead;
					long totalBytesRead = 0;
					long lastLogTime = 0;
					
					while ((bytesRead = in.read(buffer)) != -1) {
						out.write(buffer, 0, bytesRead);
						totalBytesRead += bytesRead;
						
						if (fileSize > 0) {
							long currentTime = System.currentTimeMillis();
							if (currentTime - lastLogTime >= 1000) {

								long percent = (totalBytesRead * 100) / fileSize;
								log.info("İndirme ilerlemesi: %" + percent);
								
								sendProgress(fileName, percent);
								lastLogTime = currentTime;
							}
						}
					}
					
					// İndirme bittiğinde %100 gönder
					if (fileSize > 0) {
						sendProgress(fileName, 100);
					}
					
					log.success("İndirme tamamlandı: " + destFile.getAbsolutePath());
					return destFile.getAbsolutePath();
					
				}
			} catch (Exception e) {
				log.error("İndirme denemesi " + (i + 1) + " başarısız: " + e.getMessage());
				Map<String, Object> payloadMap = new HashMap<>();
				payloadMap.put("success", false);
				payloadMap.put("command", "download-" + fileName);
				payloadMap.put("output", "İndirme denemesi " + (i + 1) + " başarısız: " + e.getMessage());
				WebSocketManager.getInstance().sendMessage("download_file_progress", payloadMap);
				
				if (i == maxRetries - 1) {
					log.error("Tüm indirme denemeleri başarısız oldu.");
					payloadMap = new HashMap<>();
					payloadMap.put("success", false);
					payloadMap.put("command", "download-" + fileName);
					payloadMap.put("output", "İndirme başarısız : " + e.getMessage());
					WebSocketManager.getInstance().sendMessage("download_file_progress", payloadMap);
					if (destFile.exists()) {
						destFile.delete();
					}
					return null;
				}
				
				try {
					Thread.sleep(2000);
				} catch (InterruptedException ignored) {}
			}
		}

		log.info("İndirme başlatılıyor: " + fileUrl);
		// Linux/Darwin için öncelikli olarak CURL dene
		if (OperatingSystem.detect() != OperatingSystem.WINDOWS) {
			log.warn("Java HttpClient ile indirme başarısız oldu, Curl ile deneniyor...");
			if (downloadWithCurl(fileUrl, destFile.getAbsolutePath(), fileName)) {
				return destFile.getAbsolutePath();
			}
			return null;
		}

		return null;
	}

	private boolean downloadWithCurl(String url, String destPath, String fileName) {
		try {
			log.info("CURL ile indirme deneniyor: " + url);
			
			// -4: Sadece IPv4 kullan (IPv6 timeout sorunlarını önlemek için)
			// --connect-timeout 20: Bağlantı zaman aşımı
			// --max-time 600: Toplam işlem zaman aşımı (10dk)
			// -L: Redirectleri takip et
			// -f: Hata durumunda fail ol (404 vs)
			ProcessBuilder pb = new ProcessBuilder("curl", "-4", "-L", "-f", "--connect-timeout", "20", "--max-time", "600", "-o", destPath, url);
			
			Process process = pb.start();
			
			// Basit bir ilerleme bildirimi
			sendProgress(fileName, 10);
			
			boolean finished = process.waitFor(10, java.util.concurrent.TimeUnit.MINUTES);
			
			if (!finished) {
				process.destroyForcibly();
				return false;
			}
			
			if (process.exitValue() == 0) {
				sendProgress(fileName, 100);
				log.success("CURL ile indirme tamamlandı: " + destPath);
				return true;
			} else {
				// Hata çıktısını oku
				String error = new String(process.getErrorStream().readAllBytes());
				log.error("Curlİndirme başarısız. Hata:" + error);
				Map<String, Object> payloadMap = new HashMap<>();
				payloadMap.put("success", false);
				payloadMap.put("command", "download-" + fileName);
				payloadMap.put("output", "İndirme başarısız. Hata:" + error);
				WebSocketManager.getInstance().sendMessage("download_file_progress", payloadMap);
				return false;
			}
		} catch (Exception e) {
			log.error("CURL çalıştırma hatası: " + e.getMessage());
		}
		return false;
	}

	private void sendProgress(String fileName, long percent) {
		Map<String, Object> payloadMap = new HashMap<>();
		payloadMap.put("success", true);
		payloadMap.put("command", "download-" + fileName);
		payloadMap.put("output", percent);
		WebSocketManager.getInstance().sendMessage("download_file_progress", payloadMap);
	}

	/**
	 * Dosya boyutunu okunabilir formata çevirir
	 */
	private String formatFileSize(long bytes) {
		if (bytes < 1024) return bytes + " B";
		int exp = (int) (Math.log(bytes) / Math.log(1024));
		char pre = "KMGTPE".charAt(exp - 1);
		return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
	}
}
