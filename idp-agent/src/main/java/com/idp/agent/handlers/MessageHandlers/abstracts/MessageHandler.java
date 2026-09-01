package com.idp.agent.handlers.MessageHandlers.abstracts;

import com.idp.agent.dto.Message;

public interface MessageHandler {
  void handle(Message message);
}
