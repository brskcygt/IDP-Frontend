package com.idp.agent.deploy;

import com.idp.agent.logging.AdvancedLogger;

/** Artifact deploy loglaması (testlerde yakalanabilir; varsayılan AdvancedLogger). */
public interface DeployLog {
	void info(String message);

	void warn(String message);

	void error(String message);

	static DeployLog advanced() {
		AdvancedLogger logger = AdvancedLogger.getInstance();
		return new DeployLog() {
			@Override
			public void info(String message) {
				logger.info(message);
			}

			@Override
			public void warn(String message) {
				logger.warn(message);
			}

			@Override
			public void error(String message) {
				logger.error(message);
			}
		};
	}
}
