package com.idp.agent.managers;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;

import com.idp.agent.ConfigLoader;
import com.idp.agent.dto.CurrentVersionResponse;
import com.idp.agent.executor.abstracts.CommandExecutor;
import com.idp.agent.executor.factory.ExecutorFactory;
import com.idp.agent.logging.AdvancedLogger;

import javax.net.ssl.SSLContext;
import java.net.ConnectException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

public class AppManager {
  private static AppManager instance;

	private final AdvancedLogger logger;
  private final ConfigLoader config;
  private final CommandExecutor executor;

  private AppManager(){
    this.logger = AdvancedLogger.getInstance();
    this.config = ConfigLoader.getInstance();
    this.executor = ExecutorFactory.getExecutor();
  }
  
  public static synchronized AppManager getInstance(){
    if(instance == null){
			instance = new AppManager();
    }

    return instance;
  }

  public CurrentVersionResponse getCurrentVersion(){
    String appUrl = config.getAppUrl();
    String healthUrl = appUrl + "/health";

    HttpClient httpClient;
    try {
      TrustManager[] trustAllCerts = new TrustManager[]{
          new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return null; }
            public void checkClientTrusted(X509Certificate[] certs, String authType) {}
            public void checkServerTrusted(X509Certificate[] certs, String authType) {}
          }
      };
      SSLContext sc = SSLContext.getInstance("SSL");
      sc.init(null, trustAllCerts, new SecureRandom());
      
      System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true");

      httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .sslContext(sc)
        .build();
    } catch (Exception e) {
        httpClient = HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .build();
    }

    HttpRequest request = HttpRequest.newBuilder(URI.create(healthUrl))
      .GET()
      .build();

    CurrentVersionResponse currentVersionResponseDto = new CurrentVersionResponse();
    currentVersionResponseDto.setType(false);
    currentVersionResponseDto.setVersion("");
    try {
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

      logger.info("Status: " + response.statusCode());
      logger.info("Raw JSON: " + response.body());

      Gson gson = new Gson();
      currentVersionResponseDto = gson.fromJson(response.body(), CurrentVersionResponse.class);

    } catch (ConnectException e) {
      logger.warn("Uygulamaya erişilemedi (Kapalı olabilir): " + e.getMessage());
    } catch (Exception e) {
      logger.error("Güncel versiyonu çekerken hata meydana geldi..." + e);
    }

    return currentVersionResponseDto;
  }

  public List<String> getAppConfig(){
    
    String appPath = config.getAppPath();
    boolean appPathIsExist = Files.exists(Path.of(appPath));
    if(!appPathIsExist){  
      Map<String, Object> payload = new HashMap<>();
			payload.put("success", false);
			payload.put("output", "Uygulama dizini bulunamadı");
			payload.put("command", appPath);
			WebSocketManager.getInstance().sendMessage("command_execution_result", payload);
      return null;
    }

    String appConfigFile = appPath + "/config.ini";
    try{
      List<String> fileContent = Files.readAllLines(Path.of(appConfigFile));
      return fileContent;
    }
    catch(IOException ex){
      return null;
    }
  }

	public void removeBackupFiles(){
		this.removeBackendFiles();
		this.removeFrontendBackupFolders();
  }

	public void removeBackendFiles(){
		String appPath = config.getAppPath();
    String appName = config.getAppName();

		String findPattern = appName + "-*";
		List<String> backendBackupFiles = executor.find(appPath, findPattern);
		for (String backupFile : backendBackupFiles) {
			this.executor.rm(backupFile);
		}
	}

	public void removeFrontendBackupFolders(){
		String appPath = config.getAppPath();

		String frontendBackupFindPattern = "views-*";
		List<String> frontendBackupFolders = executor.find(appPath, frontendBackupFindPattern);
		for (String backupFolder : frontendBackupFolders) {
			this.executor.rmDir(backupFolder);
		}
	}

  public void removeConfigBackupFile(){
		String appPath = config.getAppPath();

		String configBackupFindPattern = "config.ini-*";
		List<String> configBackupFiles = executor.find(appPath, configBackupFindPattern);
		for (String backupFile : configBackupFiles) {
			this.executor.rm(backupFile);
		}
	}

  public void backupCurrentVersion(){
    this.backupBackendCurrentVersion();
    this.backupFrontendCurrentVersion();
  }

  public void backupBackendCurrentVersion(){
    String appPath = config.getAppPath();
    String appName = config.getAppName();

    String currentBackendAppPath = appPath + "/" + appName;
		String currentBackendAppBackupPath =  appPath + "/" + appName + "-backup";
		executor.mv(currentBackendAppPath, currentBackendAppBackupPath);
  }

  public void backupFrontendCurrentVersion(){
    String appPath = config.getAppPath();

		String currentFrontendPath = appPath + "/views";
		String currentFrontendBackupPath = appPath + "/views-backup";
		executor.mv(currentFrontendPath, currentFrontendBackupPath);
  }
  
  public void backupConfigCurrentVersion(){
    String appPath = config.getAppPath();

		String currentConfigPath = appPath + "/config.ini";
		String currentConfigBackupPath = appPath + "/config.ini-backup";
		executor.mv(currentConfigPath, currentConfigBackupPath);
  }

  public void restartApplication() {
    String serviceName = config.getServiceName();
    logger.info("Servis yeniden başlatılıyor: " + serviceName);
    String result = executor.restartService(serviceName);
    logger.info("Servis yeniden başlatma sonucu: " + result);
  }

  public void getLiveLogs() {
    String serviceName = config.getServiceName();
    // Son 100 satırı getir
    String logs = executor.getServiceLogs(serviceName, 50);
    
    Map<String, Object> payload = new HashMap<>();
    payload.put("logs", logs);
    WebSocketManager.getInstance().sendMessage("app_logs", payload);
  }

}
