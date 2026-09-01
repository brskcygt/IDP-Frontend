package com.idp.agent.handlers.MessageHandlers;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.UpdaterManager;
import com.idp.agent.managers.WebSocketManager;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class UpdateAppConfigMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();
  private final Gson gson = new Gson();

  @Override
  public void handle(Message message) {
    log.info("Config güncelleme komutu alındı; işlem başlatılıyor");
    try {
      Map<String, Object> configLines = gson.fromJson(
        gson.toJson(message.getPayload()), new TypeToken<Map<String, Object>>() {}.getType()
      );
      List<String> newConfig = gson.fromJson(
        gson.toJson(configLines.get("config")), new TypeToken<List<String>>() {}.getType()
      );
      UpdaterManager.getInstance().handleUpdateConfigProcessAsync(newConfig);
    } catch (Exception ex) {
      Map<String, Object> payload = new HashMap<>();
      payload.put("success", false);
      payload.put("output", "Güncellenirken bir hata meydana geldi: " + ex.getMessage());
      WebSocketManager.getInstance().sendMessage("command_execution_result", payload);

      log.error("Güncellenirken bir hata meydana geldi: " + ex.getMessage());
    }
  }
}
