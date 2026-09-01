package com.idp.agent.logging;

import org.slf4j.LoggerFactory;
import org.slf4j.Logger;

import com.idp.agent.enums.LogLevel;
import com.idp.agent.logging.abstracts.BaseLogger;

public class ConsoleLogger extends BaseLogger {

	private static final String RESET = "\u001B[0m";
	private static final String RED = "\u001B[31m";
	private static final String GREEN = "\u001B[32m";
	private static final String YELLOW = "\u001B[33m";
	private static final String CYAN = "\u001B[36m";

	private final Logger slfLogger = LoggerFactory.getLogger(ConsoleLogger.class);

	@Override
	public void log(LogLevel level, String message) {
		String msg = formatMessage(level, message);

		switch (level) {
			case INFO -> slfLogger.info(RESET + msg + RESET);
			case SUCCESS -> slfLogger.info(GREEN + msg + RESET);
			case DEBUG -> slfLogger.debug(CYAN + msg + RESET);
			case WARN -> slfLogger.warn(YELLOW + msg + RESET);
			case ERROR -> slfLogger.error(RED + msg + RESET);
		}
	}

}
