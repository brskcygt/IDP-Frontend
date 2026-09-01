package com.idp.agent.handlers.MessageHandlers;

import com.google.gson.Gson;
import com.idp.agent.dto.LanguageUploadPayload;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.LanguageUploadManager;
import com.idp.agent.managers.WebSocketManager;

import java.util.HashMap;
import java.util.Map;

public class UploadLanguagesMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();
  private final Gson gson = new Gson();

  @Override
  public void handle(Message message) {
    try {
      LanguageUploadPayload payload = gson.fromJson(
        gson.toJson(message.getPayload()), LanguageUploadPayload.class);

      if (payload == null || !payload.isValid()) {
        String platform = payload == null ? null : payload.getPlatform();
        String lang = payload == null ? null : payload.getLang();
        sendFailure(orUnknown(platform), orUnknown(lang), "Dil yükleme mesajı eksik alan içeriyor");
        return;
      }

      log.info("Dil yükleme komutu alındı: " + payload.getPlatform() + "/" + payload.getLang());
      LanguageUploadManager.getInstance().enqueue(payload);
    } catch (Exception ex) {
      sendFailure("bilinmiyor", "bilinmiyor", "Dil yükleme komutu işlenemedi: " + ex.getMessage());
      log.error("Dil yükleme komutu işlenemedi: " + ex.getMessage());
    }
  }

  private String orUnknown(String value) {
    return (value == null || value.isEmpty()) ? "bilinmiyor" : value;
  }

  private void sendFailure(String platform, String lang, String output) {
    Map<String, Object> payload = new HashMap<>();
    payload.put("process", "upload_languages");
    payload.put("platform", platform);
    payload.put("lang", lang);
    payload.put("success", false);
    payload.put("output", output);
    payload.put("duration_ms", 0);
    WebSocketManager.getInstance().sendMessage("command_execution_result", payload);
  }
}
