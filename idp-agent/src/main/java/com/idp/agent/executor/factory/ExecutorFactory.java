package com.idp.agent.executor.factory;

import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.executor.DarwinExecutor;
import com.idp.agent.executor.LinuxExecutor;
import com.idp.agent.executor.WindowsExecutor;
import com.idp.agent.executor.abstracts.CommandExecutor;
import com.idp.agent.logging.AdvancedLogger;

public class ExecutorFactory {
	private static final AdvancedLogger log = AdvancedLogger.getInstance();

	public ExecutorFactory() {
		log.debug("İşletim sistemi algılandı: " + System.getProperty("os.name"));
	}

	public static CommandExecutor getExecutor() {
		OperatingSystem os = OperatingSystem.detect();

		return switch (os) {
			case WINDOWS -> {
				log.info("Komut yürütücü seçildi: Windows");
				yield new WindowsExecutor();
			}
			case LINUX -> {
				log.info("Komut yürütücü seçildi: Linux");
				yield new LinuxExecutor();
			}
			case DARWIN -> {
				log.info("Komut yürütücü seçildi: Darwin");
				yield new DarwinExecutor();
			}
		};
	}
}
