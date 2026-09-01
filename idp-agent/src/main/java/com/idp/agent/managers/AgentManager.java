package com.idp.agent.managers;

import java.util.List;

import com.idp.agent.ConfigLoader;
import com.idp.agent.Starter;
import com.idp.agent.executor.abstracts.CommandExecutor;
import com.idp.agent.executor.factory.ExecutorFactory;
import com.idp.agent.logging.AdvancedLogger;

public class AgentManager {
  private final ConfigLoader config;
	private final AdvancedLogger logger;
  private static AgentManager instance;
  private final CommandExecutor executor;

  public AgentManager() {
    this.config = ConfigLoader.getInstance();
		this.logger = AdvancedLogger.getInstance();
    this.executor = ExecutorFactory.getExecutor();
  }

  public static synchronized AgentManager getInstance(){
    if(instance == null){
			instance = new AgentManager();
    }

    return instance;
  }

  public String getVersion(){
    String version = Starter.class.getPackage().getImplementationVersion();
    System.out.println("version -->" + version);
    if(version == null){
      version = config.getAgentVersion();
    }
    
    return (version != null) ? version : "Versiyon bilgisi bulunamadi";
  }

  public void removeBackupFiles(){
		this.removeAgentFiles();
  }

  public void removeAgentFiles(){
    String appPath = System.getProperty("user.dir");
    String appName = "idp-agent.jar";

		String findPattern = appName + "-*";
		List<String> backupFiles = executor.find(appPath, findPattern);
		for (String backupFile : backupFiles) {
			this.executor.rm(backupFile);
		}
  }

  public void backupCurrentVersion(){
    this.backupCurrentVersionFile();
  }

  public void backupCurrentVersionFile(){
    String appPath = System.getProperty("user.dir");
    String appName = "idp-agent.jar";

    String currentBackendAppPath = appPath + "/" + appName;
		String currentBackendAppBackupPath =  appPath + "/" + appName + "-backup";
		executor.mv(currentBackendAppPath, currentBackendAppBackupPath);
  }

  public void signalRestartApplication() {
    logger.info("Servis yeniden başlatılıyor");
    System.exit(42); // launcher bunu dinliyor
    // String serviceName = config.getAgentServiceName();
    // String result = executor.restartService(serviceName);
    // logger.info("Servis yeniden başlatma sonucu: " + result);
  }

}
