package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;

public class PongMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    log.info("Pong alındı (sunucu aktif)");
  }
}
