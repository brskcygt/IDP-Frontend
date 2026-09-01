package com.idp.agent.logging;

import com.idp.agent.enums.LogLevel;

public interface Logger {
	void log(LogLevel level, String message);
}
