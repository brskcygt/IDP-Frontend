package com.idp.agent.executor;

import com.idp.agent.executor.abstracts.CommandExecutor;

public class WindowsExecutor extends CommandExecutor {

	@Override
	protected String[] getShellPrefix() {
		// Windows komutları "cmd.exe /c" üzerinden çalıştırılmalıdır
		return new String[]{"cmd.exe", "/c"};
	}

	@Override
	public String restartService(String serviceName) {
		String command = "nssm restart " + serviceName;
		return executeAndReturn(command);
	}

@Override
public String getServiceLogs(String serviceName, int lines) {
    if (!serviceName.matches("^[a-zA-Z0-9_-]+$")) {
      throw new IllegalArgumentException("Invalid service name");
    }
    int safeLines = Math.min(Math.max(lines, 1), 500);

    // --- ADIM 1: nssm'den AppStdout yolunu al ---
    // cmd /c ile nssm'in çıktısının direkt string olarak yakalanmasını garanti ediyoruz.
    String nssmCommand = "cmd /c nssm get " + serviceName + " AppStdout";
    String logPathOutput = executeAndReturn(nssmCommand);

    // Çıktıyı temizle: ANSI, kontrol karakterleri ve trim
    String logPath = logPathOutput
        .replaceAll("\u001B\\[[;\\d]*m", "") // ANSI temizliği
        .replaceAll("[\\x00-\\x1F]", "")   // Kontrol karakterleri
        .trim();

    // --- ADIM 2: Log yolunu doğrula ---
    if (!logPath.matches("^[A-Za-z]:\\\\.+")) {
        // Eğer nssm komutundan AppStdout not configured vs. gibi bir hata geldiyse
        return "AppStdout path is invalid or not configured: " + logPath;
    }

    // --- ADIM 3: Log içeriğini oku ---
    // Log yolu zaten elimizde olduğu için sadece powershell ile dosyayı oku ve varlığını kontrol et.
    String psScript =
        "if (-not (Test-Path -LiteralPath '" + logPath + "' -PathType Leaf)) {" +
        "    'Log file not found: " + logPath + "';" +
        "} else {" +
        "    Get-Content -LiteralPath '" + logPath + "' -Tail " + safeLines + ";" +
        "}";

    String command = "powershell -NoProfile -Command \"" + psScript + "\"";

    String output = executeAndReturn(command);

    return output.replaceAll("\u001B\\[[;\\d]*m", ""); // Final ANSI temizliği
}

	@Override
	public String mv(String source, String target) {
		// Windows move komutu dizinler için farklı davranabilir; tırnak ekle
		String command = "move \"" + normalizePath(source) + "\" \"" + normalizePath(target) + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String rename(String sourceFile, String newName) {
		String command = "ren \"" + normalizePath(sourceFile) + "\" \"" + newName + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String tar(String tarFilePath, String sourceDir) {
		String command = "tar -czf \"" + normalizePath(tarFilePath) + "\" -C \"" + normalizePath(sourceDir) + "\" .";
		return executeAndReturn(command);
	}

	@Override
	public String unzipTar(String tarFilePath, String destinationDir) {
		// Modern Windows (10+) bsdtar içerir; yoksa kullanıcıya alternatif gerekebilir
		String normDest = normalizePath(destinationDir);
		String normTar = normalizePath(tarFilePath);
		String command = "if not exist \"" + normDest + "\" mkdir \"" + normDest + "\" && tar -xf \"" + normTar + "\" -C \"" + normDest + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String ls(String path) {
		String command = "dir \"" + normalizePath(path) + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String mkDir(String name, String path) {
		String sep = "\\";
		String normPath = normalizePath(path);
		String full = normPath.endsWith("\\") ? normPath + name : normPath + sep + name;
		String command = "if not exist \"" + full + "\" mkdir \"" + full + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String rm(String file) {
		String command = "del /f /q \"" + normalizePath(file) + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String rmDir(String path) {
		String normPath = normalizePath(path);
		String command = "if exist \"" + normPath + "\" rd /s /q \"" + normPath + "\"";
		return executeAndReturn(command);
	}

	@Override
	public String clearDir(String path) {
		String normPath = normalizePath(path);
		String command = "if exist \"" + normPath + "\" (del /f /s /q \"" + normPath + "\\*\" >nul 2>&1 & for /d %x in (\"" + normPath + "\\*\") do @rd /s /q \"%x\" >nul 2>&1)";
		return executeAndReturn(command);
	}

	@Override
	public java.util.List<String> find(String path, String pattern) {
		String winPath = normalizePath(path);
		if (winPath.endsWith("\\")) {
			winPath = winPath.substring(0, winPath.length() - 1);
		}
		String command = "dir /b /s \"" + winPath + "\\" + pattern + "\" 2>nul";
		String output = executeAndReturn(command);

		if (output == null || output.trim().isEmpty()) {
			return new java.util.ArrayList<>();
		}

		String[] lines = output.split("\\r?\\n");
		return java.util.Arrays.asList(lines);
	}

	private String normalizePath(String path) {
		if (path == null) return null;
		return path.replace("/", "\\");
	}
}
