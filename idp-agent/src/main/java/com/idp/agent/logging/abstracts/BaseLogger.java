package com.idp.agent.logging.abstracts;

import com.idp.agent.enums.LogLevel;
import com.idp.agent.logging.Logger;

public abstract class BaseLogger implements Logger {
	protected String formatMessage(LogLevel level, String message) {
		String timestamp = java.time.LocalDateTime.now()
			.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
		return "[" + timestamp + "] [" + level + "] " + message;
	}
}
