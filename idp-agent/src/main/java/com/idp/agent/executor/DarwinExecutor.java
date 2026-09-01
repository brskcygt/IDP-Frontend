package com.idp.agent.executor;

import com.idp.agent.executor.abstracts.CommandExecutor;

public class DarwinExecutor extends CommandExecutor {

	@Override
	protected String[] getShellPrefix() {
		// Darwin komutları genelde bash veya sh üzerinden çalıştırılır
		return new String[] { "/bin/bash", "-c" };
	}

	@Override
	public String restartService(String serviceName) {
		// MacOS için launchctl kullanıyoruz
		String command = "launchctl stop " + serviceName + " && launchctl start " + serviceName;
		return executeAndReturn(command);
	}

	@Override
	public String getServiceLogs(String serviceName, int lines) {
		// Launchctl ile yönetilen servislerin log konumu plist dosyasındaki StandardOutPath anahtarında tutulur.
		String command = "plist=$(grep -l \"" + serviceName + "\" ~/Library/LaunchAgents/*.plist /Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist 2>/dev/null | head -n 1); " +
				"if [ -n \"$plist\" ]; then " +
				"logfile=$(/usr/libexec/PlistBuddy -c \"Print :StandardOutPath\" \"$plist\" 2>/dev/null); " +
				"if [ -f \"$logfile\" ]; then tail -n " + lines + " \"$logfile\"; " +
				"else echo \"Log file not found: $logfile\"; fi; " +
				"else echo \"Service plist not found for " + serviceName + "\"; fi";
		return executeAndReturn(command);
	}

	@Override
	public String mv(String source, String target) {
		String command = "mv '" + source + "' '" + target + "'";
		return executeAndReturn(command);
	}

	@Override
	public String rename(String sourceFile, String newName) {
		String command = "mv '" + sourceFile + "' '" + newName + "'";
		return executeAndReturn(command);
	}

	@Override
	public String tar(String tarFilePath, String sourceDir) {
		String command = "tar -czf '" + tarFilePath + "' -C '" + sourceDir + "' .";
		return executeAndReturn(command);
	}

	@Override
	public String unzipTar(String tarFilePath, String destinationDir) {
		String command = "mkdir -p '" + destinationDir + "' && tar -xf '" + tarFilePath + "' -C '" + destinationDir + "'";
		return executeAndReturn(command);
	}

	@Override
	public String ls(String path) {
		String command = "ls -la '" + path + "'";
		return executeAndReturn(command);
	}

	@Override
	public String mkDir(String name, String path) {
		String command = "mkdir -p '" + path + "/" + name + "'";
		return executeAndReturn(command);
	}

	@Override
	public String rm(String file) {
		String command = "rm -f '" + file + "'";
		return executeAndReturn(command);
	}

	@Override
	public String rmDir(String path) {
		String command = "rm -rf '" + path + "'";
		return executeAndReturn(command);
	}

	@Override
	public String clearDir(String path) {
		String command = "rm -rf '" + path + "'/* '" + path + "'/.[!.]* '" + path + "'/..?* 2>/dev/null || true";
		return executeAndReturn(command);
	}

	@Override
	public java.util.List<String> find(String path, String pattern) {
		String command = "find '" + path + "' -name '" + pattern + "'";
		String output = executeAndReturn(command);
		if (output == null || output.trim().isEmpty()) {
			return new java.util.ArrayList<>();
		}
		return java.util.Arrays.asList(output.split("\\n"));
	}

}
