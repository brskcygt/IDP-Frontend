package com.idp.agent.managers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.idp.agent.ConfigLoader;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.UpdateManagers.AppUpdateManagerImpl;

public class UpdaterManager {
	private static UpdaterManager instance;
	private final AdvancedLogger log;
	private final ConfigLoader config;
	private final WebSocketManager webSocket;
	private final AppManager appManager;

	// Private Constructor (Singleton)
	private UpdaterManager() {
		this.log = AdvancedLogger.getInstance();
		this.config = ConfigLoader.getInstance();
		this.webSocket = WebSocketManager.getInstance();
		this.appManager = AppManager.getInstance();
	}

	public static synchronized UpdaterManager getInstance() {
		if (instance == null) {
			instance = new UpdaterManager();
		}
		return instance;
	}

	// Uygulama güncellemesi AppUpdateManagerImpl'e devredilir: tek bir (SHA-256 doğrulamalı,
	// fail-closed) kurulum yolu kalsın. Bu sınıftaki eski kopya doğrulamasız indirip kuruyordu.
	public void handleUpdateProcessAsync(Object payload) {
		AppUpdateManagerImpl.getInstance().handleUpdateProcessAsync(payload);
	}

	// Gelen güncelleme mesajını işle
	public boolean handleUpdateProcess(Object payload) {
		return AppUpdateManagerImpl.getInstance().handleUpdateProcess(payload);
	}

	public void handleUpdateConfigProcessAsync(List<String> configLines) {
		log.info("Güncelleme isteği alındı, arka plan işlemi başlatılıyor...");

		Thread worker = new Thread(() -> handleUpdateConfigProcess(configLines), "idp-config-update");
		worker.setDaemon(true);
		worker.start();
	}

	public void handleUpdateConfigProcess(List<String> newConfigLines){
		String appPath = config.getAppPath();
		boolean appPathIsExist = Files.exists(Path.of(appPath));
		if(!appPathIsExist){
			this.prepareSendMessage(false, "Uygulama dizini bulunamadı", appPath);
			return;
		}

		try {
			appManager.removeConfigBackupFile();			
		} catch (Exception ex) {
			this.prepareSendMessage(false, "Config yedek dosyası silinirken hata meydana geldi.", ex.getMessage());
			return;
		}

		try {
			appManager.backupConfigCurrentVersion();
		} catch (Exception ex) {
			this.prepareSendMessage(false, "Config dosyası yedeklenirken hata meydana geldi.", ex.getMessage());
			return;
		}

		try{
			String configFilePath = appPath + "/config.ini";
			Files.write(Path.of(configFilePath), newConfigLines);
			this.prepareSendMessage(true, "Config dosyası başarıyla güncellendi.", configFilePath);
		} catch(Exception ex){
			this.prepareSendMessage(false, "Config dosyası güncellenirken hata meydana geldi.", ex.getMessage());
			return;
		}


	}

	public void prepareSendMessage(boolean success, String output, String command){
		Map<String, Object> payload = new HashMap<>();
		payload.put("success", success);
		payload.put("output", output);
		payload.put("command", command);
		webSocket.sendMessage("command_execution_result", payload);
	}

}
