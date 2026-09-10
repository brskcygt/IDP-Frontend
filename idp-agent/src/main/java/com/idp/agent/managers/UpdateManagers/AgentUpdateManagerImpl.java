package com.idp.agent.managers.UpdateManagers;

import java.nio.file.Path;
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
import com.idp.agent.security.Sha256Verifier;

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
  public void handleUpdateProcessAsync(Object payload) {
		logger.info("Agent güncelleme isteği alındı, arka plan işlemi başlatılıyor...");

		Thread worker = new Thread(() -> {
			this.handleUpdateProcess(payload);

    }, "idp-agent-update");
		worker.setDaemon(true);
		worker.start();

  }

  @Override
  public boolean handleUpdateProcess(Object payload) {
    logger.info("Agent güncelleme süreci başlatıldı");

    // Fail-closed: SYSTEM olarak koşacak JAR, beklenen özet olmadan indirilmez/kurulmaz.
    String expectedSha = Sha256Verifier.expectedChecksum(payload, Sha256Verifier.KEY_AGENT);
    Sha256Verifier.Result present = Sha256Verifier.checkPresent(Sha256Verifier.KEY_AGENT, expectedSha);
    if (!present.ok()) {
      logger.error(present.message());
      this.prepareSendMessage(false, present.message(), "update_agent");
      return false;
    }

    String workingDir = System.getProperty("user.dir");

    logger.info("workingDir -->" + workingDir);

		String downloadPath = workingDir + "/packages";
		String agentJarFilePath = downloadManager.downloadAgent(downloadPath);
		if(agentJarFilePath == null){return false;}

		Sha256Verifier.Result verified = Sha256Verifier.verifyFile(
			Path.of(agentJarFilePath), Sha256Verifier.KEY_AGENT, expectedSha);
		if (!verified.ok()) {
			logger.error(verified.message());
			this.prepareSendMessage(false, verified.message(), "update_agent");
			return false;
		}
		logger.info(verified.message());


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

		// Doğrulanan dosyanın kendisi taşınır (eskiden sabit "idp-agent.jar" adı taşınıyordu;
		// paket adı farklıysa doğrulanmamış/yanlış dosya taşınabilirdi).
		String currentAppPath = workingDir + "/" + "idp-agent.next.jar";
		executor.mv(agentJarFilePath, currentAppPath);

		try{
			agentManager.signalRestartApplication();
		}
		catch(Exception ex){
			logger.error("Uygulama yeniden başlatılırken bir hata meydana geldi:  " + ex.getMessage());
			this.prepareSendMessage(false, "Uygulama yeniden başlatılırken bir hata meydana geldi.", ex.getMessage());
		}

		return true;
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
