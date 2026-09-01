package com.idp.agent.managers.UpdateManagers;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.idp.agent.executor.abstracts.CommandExecutor;
import com.idp.agent.executor.factory.ExecutorFactory;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.AgentManager;
import com.idp.agent.managers.DownloadManager;
import com.idp.agent.managers.WebSocketManager;
import com.idp.agent.managers.UpdateManagers.abstracts.UpdateManager;

public class AgentUpdateManagerImpl implements UpdateManager {

  private static AgentUpdateManagerImpl instance;
	private final AdvancedLogger logger;
	private final CommandExecutor executor;
	private final AgentManager agentManager;
	private final WebSocketManager webSocket;
  private final DownloadManager downloadManager;


  private AgentUpdateManagerImpl() {
		// Factory kullanarak doğru executor'ı seçiyoruz (Loose Coupling)
		this.logger = AdvancedLogger.getInstance();
		this.executor = ExecutorFactory.getExecutor();
    this.agentManager = AgentManager.getInstance();
		this.webSocket = WebSocketManager.getInstance();
    this.downloadManager = DownloadManager.getInstance();
	}

  public static synchronized AgentUpdateManagerImpl getInstance() {
		if (instance == null) {
			instance = new AgentUpdateManagerImpl();
		}
		return instance;
	}


  @Override
  public void handleUpdateProcessAsync() {
		logger.info("Agent güncelleme isteği alındı, arka plan işlemi başlatılıyor...");
    
		Thread worker = new Thread(() -> {
			this.handleUpdateProcess();

    }, "idp-agent-update");
		worker.setDaemon(true);
		worker.start();
    
  }

  @Override
  public void handleUpdateProcess() {
    logger.info("Agent güncelleme süreci başlatıldı");

    String workingDir = System.getProperty("user.dir");

    logger.info("workingDir -->" + workingDir);

		String downloadPath = workingDir + "/packages";
		String agentJarFilePath = downloadManager.downloadAgent(downloadPath);
		if(agentJarFilePath == null){return;}


		// try{
		// 	agentManager.removeBackupFiles();
		// }catch(Exception ex){
		// 	this.prepareSendMessage(false, "Agent yedekleme dosyaları silinirken hata oluştu.", ex.getMessage());
		// 	return;
		// }

    // try{
		// 	agentManager.backupCurrentVersion();
		// }
		// catch(Exception ex){
		// 	this.prepareSendMessage(false, "Agent versiyonu yedeklerken hata oluştu.", ex.getMessage());
		// 	return;
		// }

		String newApp = downloadPath + "/" + "idp-agent.jar";
		String currentAppPath = workingDir + "/" + "idp-agent.next.jar";
		executor.mv(newApp, currentAppPath);

		try{
			agentManager.signalRestartApplication();
		}
		catch(Exception ex){
			logger.error("Uygulama yeniden başlatılırken bir hata meydana geldi:  " + ex.getMessage());
			this.prepareSendMessage(false, "Uygulama yeniden başlatılırken bir hata meydana geldi.", ex.getMessage());
		}

  }

  @Override
  public void handleUpdateConfigProcessAsync(List<String> configLines) {
    // TODO Auto-generated method stub
    throw new UnsupportedOperationException("Unimplemented method 'handleUpdateConfigProcessAsync'");
  }

  @Override
  public void handleUpdateConfigProcess(List<String> configLines) {
    // TODO Auto-generated method stub
    throw new UnsupportedOperationException("Unimplemented method 'handleUpdateConfigProcess'");
  }

  public void prepareSendMessage(boolean success, String output, String command){
		Map<String, Object> payload = new HashMap<>();
		payload.put("success", success);
		payload.put("output", output);
		payload.put("command", command);
		webSocket.sendMessage("command_execution_result", payload);
	}

}
