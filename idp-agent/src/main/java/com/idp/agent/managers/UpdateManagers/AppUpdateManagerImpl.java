package com.idp.agent.managers.UpdateManagers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.idp.agent.ConfigLoader;
import com.idp.agent.dto.CurrentVersionResponse;
import com.idp.agent.executor.abstracts.CommandExecutor;
import com.idp.agent.executor.factory.ExecutorFactory;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.AppManager;
import com.idp.agent.managers.DownloadManager;
import com.idp.agent.managers.WebSocketManager;
import com.idp.agent.managers.UpdateManagers.abstracts.UpdateManager;

public class AppUpdateManagerImpl implements UpdateManager {
  private static AppUpdateManagerImpl instance;
	private final CommandExecutor executor;
	private final AdvancedLogger log;
	private final ConfigLoader config;
	private final WebSocketManager webSocket;
	private final AppManager appManager;
	private final DownloadManager downloadManager;

	// Private Constructor (Singleton)
	private AppUpdateManagerImpl() {
		// Factory kullanarak doğru executor'ı seçiyoruz (Loose Coupling)
		this.executor = ExecutorFactory.getExecutor();
		this.log = AdvancedLogger.getInstance();
		this.config = ConfigLoader.getInstance();
		this.webSocket = WebSocketManager.getInstance();
		this.appManager = AppManager.getInstance();
		this.downloadManager = DownloadManager.getInstance();
	}

  public static synchronized AppUpdateManagerImpl getInstance() {
		if (instance == null) {
			instance = new AppUpdateManagerImpl();
		}
		return instance;
	}

  // Bu metod WebSocket thread'inden çağrılacak, o yüzden hemen return etmeli.
	// Asıl işi arka planda yapmalı.
	public void handleUpdateProcessAsync() {
		log.info("Güncelleme isteği alındı, arka plan işlemi başlatılıyor...");

		Thread worker = new Thread(() -> {
			this.handleUpdateProcess();

			try {
				Map<String, Object>  versionControlPayload = new HashMap<>();
				versionControlPayload.put("success", true);
				versionControlPayload.put("output", "Versiyon bilgisi 15sn sonra gelecektir.");
				versionControlPayload.put("command", "curl /api/health");
				webSocket.sendMessage("update_version", versionControlPayload);
				
				Thread.sleep(15000);
				
				CurrentVersionResponse currentVersion = appManager.getCurrentVersion();
				Map<String, Object> payload = new HashMap<>();
				payload.put("success", true);
				payload.put("version", currentVersion.getVersion());
				payload.put("command", "current_version");
				webSocket.sendMessage("current_version", payload);

			} catch (Exception ex) {
				this.prepareSendMessage(false, "Uygulama versiyonu alınırken hata oluştu.", ex.getMessage());
			}

		}, "idp-application-update");
		worker.setDaemon(true);
		worker.start();
	}

	// Gelen güncelleme mesajını işle
	public void handleUpdateProcess() {
		log.info("Güncelleme süreci başlatıldı");

		String appPath = config.getAppPath();
		boolean appPathIsExist = Files.exists(Path.of(appPath));
		if(!appPathIsExist){
			this.prepareSendMessage(false, "Uygulama dizini bulunamadı", appPath);
			return;
		}
		
		String workingDir = System.getProperty("user.dir");
		executor.clearDir(workingDir + "/packages");
		executor.mkDir("packages", workingDir);

		String downloadPath = workingDir + "/packages";

		String backendTarFilePath = downloadManager.downloadBackend(downloadPath);
		String frontendTarFilePath = downloadManager.downloadFrontend(downloadPath);

		if(backendTarFilePath == null || frontendTarFilePath == null){return;}

		// TODO backend ve frontend paketlerinde SHA256 ile dogrulama yap

		String backendTarFileOutputPath = downloadPath + "/output";
		String frontendTarFileOutputPath = downloadPath + "/views";

		executor.unzipTar(backendTarFilePath, backendTarFileOutputPath);
		executor.unzipTar(frontendTarFilePath, frontendTarFileOutputPath);

		String appName = config.getAppName();

		try{
			appManager.removeBackupFiles();
		}catch(Exception ex){
			this.prepareSendMessage(false, "Uygulama yedekleme dosyaları silinirken hata oluştu.", ex.getMessage());
			return;
		}

		try{
			appManager.backupCurrentVersion();
		}
		catch(Exception ex){
			this.prepareSendMessage(false, "Uygulama versiyonu yedeklerken hata oluştu.", ex.getMessage());
			return;
		}
		
		String newBackendApp = backendTarFileOutputPath + "/" + appName;
		String currentBackendAppPath = appPath + "/" + appName;
		executor.mv(newBackendApp, currentBackendAppPath);

		String currentFrontendPath = appPath + "/views";
		executor.mv(frontendTarFileOutputPath, currentFrontendPath);

		try{
			appManager.restartApplication();
		}
		catch(Exception ex){
			log.error("Uygulama yeniden başlatılırken bir hata meydana geldi:  " + ex.getMessage());
			this.prepareSendMessage(false, "Uygulama yeniden başlatılırken bir hata meydana geldi.", ex.getMessage());
		}

	}

	public void handleUpdateConfigProcessAsync(List<String> configLines) {
		log.info("Güncelleme isteği alındı, arka plan işlemi başlatılıyor...");

		Thread worker = new Thread(() -> handleUpdateConfigProcess(configLines), "idp-application-config-update");
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
