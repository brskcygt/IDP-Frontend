package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.deploy.ArtifactDeployManager;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

/** {@code artifact_deploy}: işi ArtifactDeployManager kuyruğuna verir (WS iş parçacığını bloklamaz). */
public class ArtifactDeployMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      ArtifactDeployManager.getInstance().handleDeploy(message.getPayload());
    } catch (RuntimeException ex) {
      log.error("artifact_deploy islenemedi: " + ex.getClass().getSimpleName());
    }
  }
}
