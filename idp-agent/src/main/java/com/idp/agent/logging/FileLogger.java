package com.idp.agent.logging;

import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;

import com.idp.agent.enums.LogLevel;
import com.idp.agent.logging.abstracts.BaseLogger;

public class FileLogger extends BaseLogger {
	private final Path logDir = Paths.get("logs");

	public FileLogger() {
		try {
			if (!Files.exists(logDir)) {
				Files.createDirectories(logDir);
			}
		} catch (IOException e) {
			throw new RuntimeException("Log klasörü oluşturulamadı!", e);
		}
	}

	@Override
	public void log(LogLevel level, String message) {
		String fileName = "logs-" + LocalDate.now() + ".txt";
		Path filePath = logDir.resolve(fileName);

		try (FileWriter writer = new FileWriter(filePath.toFile(), true)) {
			writer.write(formatMessage(level, message) + "\n");
		} catch (IOException e) {
			throw new RuntimeException("Dosyaya log yazılamadı!", e);
		}
	}
}
