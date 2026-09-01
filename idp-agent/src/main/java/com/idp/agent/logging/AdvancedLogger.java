package com.idp.agent.logging;

import java.util.ArrayList;
import java.util.List;

import com.idp.agent.enums.LogLevel;

public class AdvancedLogger {
	private static AdvancedLogger instance;
	private final List<Logger> loggers = new ArrayList<>();

	private AdvancedLogger() {
		loggers.add(new ConsoleLogger());
		loggers.add(new FileLogger());
	}

	public static AdvancedLogger getInstance() {
		if (instance == null) {
			synchronized (AdvancedLogger.class) {
				if (instance == null) {
					instance = new AdvancedLogger();
				}
			}
		}
		return instance;
	}

	public void addLogger(Logger logger) {
		loggers.add(logger);
	}

	public void log(LogLevel level, String message) {
		for (Logger logger : loggers) {
			logger.log(level, message);
		}
	}

	public void info(String message) { log(LogLevel.INFO, message); }
	public void success(String message) { log(LogLevel.SUCCESS, message); }
	public void error(String message) { log(LogLevel.ERROR, message); }
	public void warn(String message) { log(LogLevel.WARN, message); }
	public void debug(String message) { log(LogLevel.DEBUG, message); }
}
