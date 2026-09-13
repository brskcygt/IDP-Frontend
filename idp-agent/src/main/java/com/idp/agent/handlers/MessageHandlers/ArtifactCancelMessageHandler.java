package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.deploy.ArtifactDeployManager;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

/** {@code artifact_cancel}: süren deploy'a işbirlikçi iptal bayrağı koyar. */
public class ArtifactCancelMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      ArtifactDeployManager.getInstance().handleCancel(message.getPayload());
    } catch (RuntimeException ex) {
      log.error("artifact_cancel islenemedi: " + ex.getClass().getSimpleName());
    }
  }
}
