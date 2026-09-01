package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.AppManager;
import com.idp.agent.managers.WebSocketManager;

import java.util.HashMap;
import java.util.Map;

public class RestartAppMessageHandler implements MessageHandler {
  private final AppManager appManager = AppManager.getInstance();
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    try {
      appManager.restartApplication();
    } catch (Exception ex) {
      Map<String, Object> payload = new HashMap<>();
      payload.put("success", false);
      payload.put("output", "Uygulama yeniden başlatılırken bir hata meydana geldi: " + ex.getMessage());
      WebSocketManager.getInstance().sendMessage("command_execution_result", payload);
      log.error("Uygulama yeniden başlatılırken bir hata meydana geldi: " + ex.getMessage());
    }
  }
}
