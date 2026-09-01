package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.managers.AppManager;
import com.idp.agent.managers.WebSocketManager;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GetAppConfigMessageHandler implements MessageHandler {
  private final AppManager appManager = AppManager.getInstance();

  @Override
  public void handle(Message message) {
    List<String> config = appManager.getAppConfig();
    if (config == null || config.isEmpty()) {
      Map<String, Object> payload = new HashMap<>();
      payload.put("success", false);
      payload.put("output", "Uygulama config'i bulunamadı");
      WebSocketManager.getInstance().sendMessage("get_app_config", payload);
    }

    Map<String, Object> payload = new HashMap<>();
    payload.put("success", true);
    payload.put("output", config);
    payload.put("command", "Uygulama config'i getirildi");
    WebSocketManager.getInstance().sendMessage("get_app_config", payload);
  }
}
