package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import com.idp.agent.enums.OperatingSystem;

/**
 * preStart hook komutunu (yalın ad, ör. {@code node}) PATH üzerinden MUTLAK bir çalıştırılabilir
 * yola çözer; süreç hiçbir zaman yalın adla başlatılmaz (Windows'un önce çalışma dizinine bakması
 * ve deploy edilen artifact'ın kendi {@code node.exe}'sini sokması engellenir).
 *
 * <ul>
 *   <li>PATH'teki göreli girdiler atlanır; taban dizin (base-path) altındaki adaylar reddedilir.</li>
 *   <li>Windows: PATH, RunDeployMessageHandler'daki gibi kayıt defterinden (Machine + User) tazelenir;
 *       {@code .exe} ve {@code .cmd} kabul edilir.</li>
 *   <li>{@code npm.cmd}/{@code npx.cmd}: cmd.exe kullanılmaz; yanındaki {@code node.exe} ile
 *       {@code node_modules\npm\bin\npm-cli.js}/{@code npx-cli.js} doğrudan çalıştırılır.</li>
 *   <li>Diğer {@code .cmd}: yalnızca yol ve TÜM argümanlar katı bir karakter kümesine uyuyorsa
 *       {@code cmd.exe /d /v:off /c}; aksi halde reddedilir (cmd.exe meta karakter enjeksiyonu).</li>
 * </ul>
 */
final class CommandResolver {
	/** cmd.exe için güvenli: boşluk, tırnak ve {@code & | < > ^ % ! ( ) ,} yok. */
	static final Pattern CMD_SAFE_ARG = Pattern.compile("^[A-Za-z0-9._:/\\\\=@+-]{1,256}$");
	static final Pattern CMD_SAFE_PATH = Pattern.compile("^[A-Za-z]:\\\\[A-Za-z0-9._\\\\-]{1,240}$");

	/** Çözümlenmiş komut önü ve Windows'ta hook sürecine verilecek tazelenmiş PATH. */
	record Resolved(List<String> prefix, String effectivePath) {}

	private final OperatingSystem os;
	private final Supplier<String> pathSupplier;

	CommandResolver(OperatingSystem os, Supplier<String> pathSupplier) {
		this.os = os;
		this.pathSupplier = pathSupplier;
	}

	static CommandResolver system(ProcessRunner runner, OperatingSystem os) {
		if (os == OperatingSystem.WINDOWS) {
			return new CommandResolver(os, () -> refreshedWindowsPath(runner));
		}
		return new CommandResolver(os, () -> System.getenv("PATH"));
	}

	Resolved resolve(String command, List<String> args, Path forbiddenRoot) throws DeployException {
		String path = pathSupplier.get();
		if (path == null || path.isBlank()) {
			throw new DeployException("PATH bos; '" + command + "' bulunamadi");
		}
		boolean windows = os == OperatingSystem.WINDOWS;
		String separator = windows ? ";" : ":";
		for (String entry : path.split(Pattern.quote(separator))) {
			String trimmed = entry.trim();
			if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
				trimmed = trimmed.substring(1, trimmed.length() - 1);
			}
			if (trimmed.isEmpty()) {
				continue;
			}
			Path dir;
			try {
				dir = Paths.get(trimmed);
			} catch (InvalidPathException ex) {
				continue;
			}
			if (!dir.isAbsolute()) {
				continue;
			}
			for (String candidate : candidates(command)) {
				Path file = dir.resolve(candidate);
				if (!Files.isRegularFile(file) || (!windows && !Files.isExecutable(file))) {
					continue;
				}
				Path real;
				try {
					real = file.toRealPath();
				} catch (IOException ex) {
					continue;
				}
				if (forbiddenRoot != null && real.startsWith(forbiddenRoot)) {
					continue;
				}
				return new Resolved(build(real, args), windows ? path : null);
			}
		}
		throw new DeployException("'" + command + "' PATH'te bulunamadi");
	}

	private List<String> candidates(String command) {
		if (os != OperatingSystem.WINDOWS) {
			return List.of(command);
		}
		String lower = command.toLowerCase(Locale.ROOT);
		if (lower.endsWith(".exe") || lower.endsWith(".cmd")) {
			return List.of(command);
		}
		return List.of(command + ".exe", command + ".cmd");
	}

	private List<String> build(Path real, List<String> args) throws DeployException {
		String fileName = real.getFileName().toString();
		String lower = fileName.toLowerCase(Locale.ROOT);
		if (os != OperatingSystem.WINDOWS || !lower.endsWith(".cmd")) {
			return List.of(real.toString());
		}
		String base = lower.substring(0, lower.length() - 4);
		if (base.equals("npm") || base.equals("npx")) {
			Path dir = real.getParent();
			Path node = dir.resolve("node.exe");
			Path cli = dir.resolve("node_modules").resolve("npm").resolve("bin").resolve(base + "-cli.js");
			if (Files.isRegularFile(node) && Files.isRegularFile(cli)) {
				return List.of(node.toString(), cli.toString());
			}
			throw new DeployException(fileName + " bulundu ama yaninda node.exe / " + base + "-cli.js yok");
		}
		if (!CMD_SAFE_PATH.matcher(real.toString()).matches()) {
			throw new DeployException(fileName + " yolu cmd.exe icin guvenli degil (bosluk/ozel karakter); .exe ya da node + script kullanin");
		}
		for (String arg : args) {
			if (!CMD_SAFE_ARG.matcher(arg).matches()) {
				throw new DeployException(fileName + " cmd.exe ile calisir; argumanlar yalnizca [A-Za-z0-9._:/\\=@+-] icerebilir");
			}
		}
		List<String> prefix = new ArrayList<>();
		prefix.add(SystemRuntimeController.systemRoot() + "\\System32\\cmd.exe");
		prefix.add("/d");
		prefix.add("/v:off");
		prefix.add("/c");
		prefix.add(real.toString());
		return prefix;
	}

	/**
	 * Agent başladıktan sonra kurulan araçlar (node, npm) yeniden başlatma gerekmeden bulunsun diye
	 * PATH'i kayıt defterinden okur. Başarısızsa süreç ortamındaki PATH'e düşer.
	 */
	static String refreshedWindowsPath(ProcessRunner runner) {
		String script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n"
			+ "Write-Output ([Environment]::GetEnvironmentVariable('Path','Machine') + ';' + "
			+ "[Environment]::GetEnvironmentVariable('Path','User'))\n";
		String encoded = Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE));
		String powershell = SystemRuntimeController.systemRoot() + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
		try {
			ProcessRunner.Result result = runner.run(List.of(powershell, "-NoProfile", "-NonInteractive",
				"-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded), Duration.ofSeconds(30));
			String value = result.output().trim();
			if (result.exitCode() == 0 && !value.isEmpty() && !value.equals(";")) {
				return value.lines().reduce((first, second) -> second).orElse(value).trim();
			}
		} catch (DeployException ignored) {
			// Ortam PATH'ine düş.
		}
		String fallback = System.getenv("Path");
		return fallback != null ? fallback : System.getenv("PATH");
	}
}
