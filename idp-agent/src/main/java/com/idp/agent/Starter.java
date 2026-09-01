package com.idp.agent;

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

		String serverUrl = config.getServerUrl();
		String serverToken = config.getServerToken();
		String agentId = config.getAgentId();

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

		
		
		WebSocketManager wsManager = WebSocketManager.getInstance(serverUrl, serverToken, agentId);
		wsManager.connect();
		
		try {
			Thread.currentThread().join();
		} catch (InterruptedException e) {
			advancedLogger.error("Ana iş parçacığı kesintiye uğradı: " + e.getMessage());
		}
	}
}
