package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.AppManager;

public class GetAppLogsMessageHandler implements MessageHandler {
  private final AppManager appManager = AppManager.getInstance();
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      appManager.getLiveLogs();
    } catch (Exception ex) {
      log.error("Loglar alınırken hata: " + ex.getMessage());
    }
  }
}
