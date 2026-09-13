package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.deploy.ArtifactDeployManager;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

/** {@code artifact_rollback}: en son önceki sürüme geri döner (deploy ile aynı kilidi kullanır). */
public class ArtifactRollbackMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      ArtifactDeployManager.getInstance().handleRollback(message.getPayload());
    } catch (RuntimeException ex) {
      log.error("artifact_rollback islenemedi: " + ex.getClass().getSimpleName());
    }
  }
}
