package com.idp.agent;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Map;

import org.yaml.snakeyaml.Yaml;

public class ConfigLoader {
	private final Map<String, Object> config;
	private static ConfigLoader instance;

	private ConfigLoader(String yamlPath) {
		InputStream in = null;
		try {
			// Önce external dosyayı kontrol et
			File externalFile = new File(yamlPath);
			if (externalFile.exists()) {
				in = new FileInputStream(externalFile);
			} else {
				// External yoksa classpath'ten oku
				in = ConfigLoader.class.getResourceAsStream(yamlPath);
			}
			
			if (in == null) {
				throw new RuntimeException("Config file not found: " + yamlPath);
			}

			Yaml yaml = new Yaml();
			this.config = yaml.load(in);

		} catch (Exception e) {
			throw new RuntimeException("Failed to load config", e);
		} finally {
			if (in != null) {
				try {
					in.close();
				} catch (Exception ignored) {}
			}
		}
	}

	public static synchronized ConfigLoader getInstance(String yamlPath){
		if(instance == null){
			instance = new ConfigLoader(yamlPath);
		}

		return instance;
	}

	public static synchronized ConfigLoader getInstance(){
		if(instance == null){
			throw new RuntimeException("ConfigLoader'a önce .env verilmeli");
		}

		return instance;
	}

	public String getServerUrl() {
		return (String) ((Map<?, ?>) config.get("server")).get("url");
	}

	public String getServerToken() {
		Object token = ((Map<?, ?>) config.get("server")).get("token");
		return token == null ? "" : token.toString();
	}

	public String getAgentId() {
		return (String) ((Map<?, ?>) config.get("agent")).get("id");
	}

	public String getAgentVersion() {
		return (String) ((Map<?, ?>) config.get("agent")).get("version");
	}

	public String getAgentServiceName() {
		return (String) ((Map<?, ?>) config.get("agent")).get("service-name");
	}

	public String getLogLevel() {
		return (String) ((Map<?, ?>) config.get("logging")).get("level");
	}

	public String getDownloadBaseUrl() {
		return (String) ((Map<?, ?>) config.get("download")).get("base-url");
	}

	public String getAppUrl() {
		return (String) ((Map<?, ?>) config.get("application")).get("base-url");
	}

	public String getAppApiPrefix() {
		return resolveApiPrefix((Map<?, ?>) config.get("application"));
	}

	/**
	 * Dil dosyası yüklemesinin hedef adresine eklenecek mod önekini çözer.
	 * Yalnızca LanguageUploadManager kullanır; sürüm kontrolü ve diğer işler
	 * base-url'i çıplak kullanmaya devam eder.
	 *
	 * Anahtar hiç yazılmamışsa müşteri kurulumu varsayılır: idp uygulaması
	 * config.ini ile çalışırken route'larını /api altına bağlıyor. Öneksiz
	 * çalışan kurulumlar (geliştirme / SaaS modu) api-prefix: "" yazarak
	 * kapatır. Anahtarın varlığına bakılır, değerine değil — böylece
	 * "hiç yazmadım" ile "boş yazdım" ayrışır.
	 */
	static String resolveApiPrefix(Map<?, ?> application) {
		if (application == null || !application.containsKey("api-prefix")) {
			return "/api";
		}

		Object prefix = application.get("api-prefix");

		return prefix == null ? "" : prefix.toString();
	}

	public String getAppPath() {
		return (String) ((Map<?, ?>) config.get("application")).get("working-directory");
	}

	public String getAppName() {
		return (String) ((Map<?, ?>) config.get("application")).get("name");
	}

	public String getServiceName() {
		return (String) ((Map<?, ?>) config.get("application")).get("service-name");
	}

	@SuppressWarnings("unchecked")
	public Map<String, Object> getDownloadPackages() {
		Object downloadObj = config.get("download");
		if (downloadObj instanceof Map<?, ?> download) {
			return (Map<String, Object>) ((Map<String, Object>) download).get("packages");
		}
		return null;
	}
}
