package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.deploy.ArtifactDeployManager;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

/** {@code artifact_config_apply}: sürümü değiştirmeden runtime config uygular. */
public final class ArtifactConfigApplyMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      ArtifactDeployManager.getInstance().handleConfigApply(message.getPayload());
    } catch (RuntimeException ex) {
      log.error("artifact_config_apply islenemedi: " + ex.getClass().getSimpleName());
    }
  }
}
