package com.idp.agent;

import com.idp.agent.connection.AgentConnectionConfig;
import com.idp.agent.connection.InvalidConfigException;
import com.idp.agent.deploy.DeployConfig;
import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.WebSocketManager;

public class Starter {

	public static void main(String[] args) {
		// Config dosyası: önce external, yoksa classpath
		String configPath = "/application.yml";
		
		// args'dan config parametresini çek
		for (String arg : args) {
			if (arg.startsWith("--config=")) {
				configPath = arg.substring(9); // "config=" kısmını atla
				break;
			}
		}
		
		ConfigLoader config = ConfigLoader.getInstance(configPath);

		AgentConnectionConfig connection;
		try {
			connection = config.getConnectionConfig();
		} catch (InvalidConfigException e) {
			// Mesaj sır içermez; kurulum/log için anlaşılır tek satır bırakıp çık.
			AdvancedLogger.getInstance().error(e.getMessage());
			System.exit(InvalidConfigException.EXIT_CODE);
			return;
		}

		String serverUrl = connection.getServerUrl();
		String agentId = connection.getAgentId();

		String logLevel = config.getLogLevel();
		String effectiveLog = (logLevel != null ? logLevel : "INFO");
		System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", effectiveLog.toLowerCase());
		
		OperatingSystem os = OperatingSystem.detect();
		AdvancedLogger advancedLogger = AdvancedLogger.getInstance();

		// Tüm thread'ler için varsayılan hata yakalayıcı
		Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
			System.err.println("Kritik Hata! Thread: " + thread.getName());
			advancedLogger.error(throwable.getMessage());
			throwable.printStackTrace();
		});

		advancedLogger.debug("İşletim sistemi: " + os.getIdentifier());
		advancedLogger.debug("Log seviyesi: " + effectiveLog);
		advancedLogger.info("Sunucu URL: " + serverUrl);
		advancedLogger.info("Agent ID: " + agentId);
		// Sır değerleri (agent-secret, CF Access secret) hiçbir seviyede loglanmaz.
		if (connection.hasCfAccess()) {
			advancedLogger.info("Cloudflare Access servis token'i: yapilandirildi");
		}
		if (connection.hasProxy()) {
			advancedLogger.info("Proxy: " + connection.getProxyHost() + ":" + connection.getProxyPort());
		}
		if (!connection.isSecure()) {
			advancedLogger.warn("Sunucu adresi ws:// (sifresiz); internet uzerinden wss:// kullanin.");
		}
		if (connection.isLegacyTokenIgnored()) {
			advancedLogger.warn("server.token artik kullanilmiyor; yok sayildi (server.agent-secret kullaniliyor).");
		}
		DeployConfig deployConfig = config.getDeployConfig();
		if (deployConfig.isConfigured()) {
			advancedLogger.info("Artifact deploy: " + deployConfig.describe());
		} else if (deployConfig.error() != null) {
			advancedLogger.warn("Artifact deploy devre disi: " + deployConfig.notConfiguredError());
		} else {
			advancedLogger.debug("Artifact deploy yapilandirilmadi (deploy.base-path yok).");
		}

		WebSocketManager wsManager = WebSocketManager.getInstance(connection);
		wsManager.connect();
		
		try {
			Thread.currentThread().join();
		} catch (InterruptedException e) {
			advancedLogger.error("Ana iş parçacığı kesintiye uğradı: " + e.getMessage());
		}
	}
}
