package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.deploy.ArtifactDeployManager;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

/** {@code artifact_status}: state.json'u okuyup {@code artifact_status_result} döner. */
public class ArtifactStatusMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      ArtifactDeployManager.getInstance().handleStatus(message.getPayload());
    } catch (RuntimeException ex) {
      log.error("artifact_status islenemedi: " + ex.getClass().getSimpleName());
    }
  }
}
