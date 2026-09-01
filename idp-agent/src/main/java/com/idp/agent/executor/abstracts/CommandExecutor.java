package com.idp.agent.executor.abstracts;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.managers.WebSocketManager;

// 1. Abstraction: Temel arayüz veya soyut sınıf
public abstract class CommandExecutor {
	private final AdvancedLogger log = AdvancedLogger.getInstance();

	private Path currentDirectory = Paths.get(System.getProperty("user.dir"));

	protected abstract String[] getShellPrefix();

	public abstract String restartService(String serviceName);

	public abstract String getServiceLogs(String serviceName, int lines);

	public void execute(String command) {
		executeAndReturn(command);
	}

	protected String executeAndReturn(String command) {
		StringBuilder output = new StringBuilder();
		try {
			List<String> fullCommand = new ArrayList<>();
			// Shell prefix ekle (örn: cmd /c veya /bin/bash -c)
			String[] prefix = getShellPrefix();
			for (String s : prefix) {
				fullCommand.add(s);
			}
			fullCommand.add(command);

			ProcessBuilder builder = new ProcessBuilder(fullCommand);
			builder.redirectErrorStream(true); // Hataları da standart çıktıya yönlendir
			builder.directory(currentDirectory.toFile());
			log.info("Komut çalıştırılıyor: " + command);
			Process process = builder.start();

			// Çıktıyı oku (Loglama için)
			try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
				String line;
				while ((line = reader.readLine()) != null) {
					log.debug(line);
					output.append(line).append(System.lineSeparator());
				}
			}

			int exitCode = process.waitFor();
			boolean success = (exitCode == 0);
			if (success) {
				log.success("Komut başarıyla tamamlandı.");
			} else {
				log.error("Komut başarısız oldu. Çıkış kodu: " + exitCode);
			}
			
			String resultOutput = output.toString().trim();
			
			try {
				Map<String, Object> payloadMap = new HashMap<>();
				payloadMap.put("success", success);
				payloadMap.put("command", command);
				payloadMap.put("output", output);
				WebSocketManager.getInstance().sendMessage("command_execution_result", payloadMap);
			} catch (Exception e) {
				log.warn("Socket ile sonuc gonderilemedi: " + e.getMessage());
			} catch (Throwable e) {
				log.error("Socket ile sonuc gonderilirken kritik hata (Olası sürüm uyumsuzluğu): " + e.getMessage());
			}

			return resultOutput;

		} catch (Exception e) {
			log.error("Komut yürütme hatası: " + e.getMessage());
			return "";
		}
	}

	public boolean cd(String path) {
		try {
			Path target = Paths.get(path).toAbsolutePath().normalize();
			if (!Files.exists(target)) {
				log.info("Dizin yok, oluşturuluyor: " + target);
				Files.createDirectories(target);
			}
			if (!Files.isDirectory(target)) {
				log.error("Verilen yol bir dizin değil: " + target);
				return false;
			}
			currentDirectory = target;
			log.success("Çalışma dizini değiştirildi: " + currentDirectory);
			return true;
		} catch (Exception e) {
			log.error("Dizin değiştirme hatası: " + e.getMessage());
			return false;
		}
	}

	public Path pwd() {return currentDirectory;}
	public abstract String ls(String path);
	public abstract String mv(String source, String target);
	public abstract String rename(String sourceFile, String newName);
	public abstract String tar(String tarFilePath, String sourceDir);
	public abstract String unzipTar(String tarFilePath, String destinationDir);
	public abstract String mkDir(String name, String path);
	public abstract String rm(String file);
	public abstract String rmDir(String path);
	public abstract String clearDir(String path);
	public abstract List<String> find(String path, String pattern);

}
