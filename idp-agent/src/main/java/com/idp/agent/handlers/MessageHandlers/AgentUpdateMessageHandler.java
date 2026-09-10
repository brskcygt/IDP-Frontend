package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.UpdateManagers.AgentUpdateManagerImpl;

public class AgentUpdateMessageHandler implements MessageHandler {
  private final AdvancedLogger log = AdvancedLogger.getInstance();

  @Override
  public void handle(Message message) {
    log.info("Güncelleme komutu alındı; işlem başlatılıyor");
    try {
      // Payload beklenen SHA-256 özetini taşır (sha256.agent); yoksa reddedilir.
      AgentUpdateManagerImpl.getInstance().handleUpdateProcessAsync(message.getPayload());
    } catch (Exception ex) {
      log.error("Güncellenirken bir hata meydana geldi: " + ex.getMessage());
    }
  }
}
