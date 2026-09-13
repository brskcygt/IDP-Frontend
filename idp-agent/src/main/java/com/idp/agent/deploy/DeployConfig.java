package com.idp.agent.deploy;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Artifact deploy için agent tarafı yerel ayarlar (application.yml):
 *
 * <pre>
 * deploy:
 *   base-path: "C:\\inetpub\\wwwroot\\jetsrm"   # ZORUNLU; tüm deploy yolları bunun içinde kalır
 *   keep-releases: 3                            # opsiyonel (1-20), saklanan önceki sürüm sayısı
 *   allowed-runtimes: [nssm, iis-static]        # opsiyonel, varsayılan hepsi
 *   allowed-hook-commands: [node, npm, npx]     # opsiyonel, preStart hook komut izin listesi
 *   nssm-path: "C:\\tools\\nssm.exe"            # opsiyonel, varsayılan PATH'teki "nssm"
 * </pre>
 *
 * Bölüm yoksa ya da {@code base-path} boşsa artifact deploy kapalıdır ({@code not_configured}).
 * Hatalı değerler agent'ı durdurmaz; yalnızca artifact deploy'u {@code not_configured: <neden>} ile
 * reddettirir (eski update/run_deploy akışları etkilenmez).
 */
public final class DeployConfig {
	public static final int DEFAULT_KEEP_RELEASES = 3;
	public static final int MAX_KEEP_RELEASES = 20;
	public static final List<String> DEFAULT_HOOK_COMMANDS = List.of("node", "npm", "npx");
	public static final String DEFAULT_NSSM = "nssm";

	static final Pattern COMMAND = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");

	private final Path basePath;
	private final String error;
	private final int keepReleases;
	private final Set<RuntimeType> allowedRuntimes;
	private final Set<String> allowedHookCommands;
	private final String nssmPath;

	private DeployConfig(Path basePath, String error, int keepReleases, Set<RuntimeType> allowedRuntimes,
			Set<String> allowedHookCommands, String nssmPath) {
		this.basePath = basePath;
		this.error = error;
		this.keepReleases = keepReleases;
		this.allowedRuntimes = Collections.unmodifiableSet(allowedRuntimes);
		this.allowedHookCommands = Collections.unmodifiableSet(allowedHookCommands);
		this.nssmPath = nssmPath;
	}

	/** Testler ve programatik kurulum için. */
	public static DeployConfig of(Path basePath, int keepReleases, Set<RuntimeType> allowedRuntimes,
			Set<String> allowedHookCommands) {
		Set<String> hooks = new LinkedHashSet<>();
		for (String command : allowedHookCommands) {
			hooks.add(normalizeCommand(command));
		}
		return new DeployConfig(basePath, null, keepReleases,
			allowedRuntimes.isEmpty() ? EnumSet.noneOf(RuntimeType.class) : EnumSet.copyOf(allowedRuntimes),
			hooks, DEFAULT_NSSM);
	}

	public static DeployConfig notConfigured(String reason) {
		return new DeployConfig(null, reason, DEFAULT_KEEP_RELEASES, EnumSet.noneOf(RuntimeType.class),
			new LinkedHashSet<>(), DEFAULT_NSSM);
	}

	public static DeployConfig fromYaml(Map<?, ?> root) {
		Object section = root == null ? null : root.get("deploy");
		if (section == null) {
			return notConfigured(null);
		}
		if (!(section instanceof Map<?, ?> deploy)) {
			return notConfigured("deploy bolumu gecersiz");
		}
		try {
			Path base = parseBasePath(deploy.get("base-path"));
			if (base == null) {
				return notConfigured(null);
			}
			return new DeployConfig(base, null,
				parseKeep(deploy.get("keep-releases")),
				parseRuntimes(deploy.get("allowed-runtimes")),
				parseHookCommands(deploy.get("allowed-hook-commands")),
				parseNssm(deploy.get("nssm-path")));
		} catch (IllegalArgumentException ex) {
			return notConfigured(ex.getMessage());
		}
	}

	private static Path parseBasePath(Object value) {
		if (value == null) {
			return null;
		}
		String text = value.toString().trim();
		if (text.isEmpty()) {
			return null;
		}
		if (SafeNames.containsControl(text)) {
			throw new IllegalArgumentException("deploy.base-path kontrol karakteri iceremez");
		}
		for (String segment : text.split("[/\\\\]")) {
			if (segment.equals("..")) {
				throw new IllegalArgumentException("deploy.base-path '..' iceremez");
			}
		}
		Path path;
		try {
			path = Paths.get(text);
		} catch (InvalidPathException ex) {
			throw new IllegalArgumentException("deploy.base-path gecerli bir yol degil");
		}
		if (!path.isAbsolute()) {
			throw new IllegalArgumentException("deploy.base-path mutlak yol olmali");
		}
		path = path.normalize();
		if (path.getNameCount() == 0) {
			throw new IllegalArgumentException("deploy.base-path kok dizin olamaz");
		}
		return path;
	}

	private static int parseKeep(Object value) {
		if (value == null) {
			return DEFAULT_KEEP_RELEASES;
		}
		int keep;
		if (value instanceof Number number) {
			if (number.doubleValue() != Math.rint(number.doubleValue())) {
				throw new IllegalArgumentException("deploy.keep-releases tam sayi olmali");
			}
			keep = number.intValue();
		} else {
			try {
				keep = Integer.parseInt(value.toString().trim());
			} catch (NumberFormatException ex) {
				throw new IllegalArgumentException("deploy.keep-releases tam sayi olmali");
			}
		}
		if (keep < 1 || keep > MAX_KEEP_RELEASES) {
			throw new IllegalArgumentException("deploy.keep-releases 1-" + MAX_KEEP_RELEASES + " arasinda olmali");
		}
		return keep;
	}

	private static Set<RuntimeType> parseRuntimes(Object value) {
		if (value == null) {
			return EnumSet.allOf(RuntimeType.class);
		}
		if (!(value instanceof List<?> list)) {
			throw new IllegalArgumentException("deploy.allowed-runtimes liste olmali");
		}
		Set<RuntimeType> result = EnumSet.noneOf(RuntimeType.class);
		for (Object item : list) {
			RuntimeType type = RuntimeType.fromWire(item == null ? null : item.toString().trim());
			if (type == null) {
				throw new IllegalArgumentException("deploy.allowed-runtimes bilinmeyen deger: "
					+ SafeNames.printable(String.valueOf(item), 40));
			}
			result.add(type);
		}
		return result;
	}

	private static Set<String> parseHookCommands(Object value) {
		Set<String> result = new LinkedHashSet<>();
		if (value == null) {
			result.addAll(DEFAULT_HOOK_COMMANDS);
			return result;
		}
		if (!(value instanceof List<?> list)) {
			throw new IllegalArgumentException("deploy.allowed-hook-commands liste olmali");
		}
		for (Object item : list) {
			String command = item == null ? "" : item.toString().trim();
			if (!COMMAND.matcher(command).matches() || command.equals(".") || command.equals("..")) {
				throw new IllegalArgumentException("deploy.allowed-hook-commands yalnizca yalin komut adi icerebilir: "
					+ SafeNames.printable(command, 40));
			}
			result.add(normalizeCommand(command));
		}
		return result;
	}

	private static String parseNssm(Object value) {
		if (value == null || value.toString().isBlank()) {
			return DEFAULT_NSSM;
		}
		String text = value.toString().trim();
		if (SafeNames.containsControl(text) || text.contains("\"")) {
			throw new IllegalArgumentException("deploy.nssm-path gecersiz karakter iceriyor");
		}
		return text;
	}

	/** Komut adını izin listesi karşılaştırması için sadeleştirir: küçük harf, .exe/.cmd uzantısız. */
	static String normalizeCommand(String command) {
		String lower = command.trim().toLowerCase(Locale.ROOT);
		if (lower.endsWith(".exe") || lower.endsWith(".cmd")) {
			lower = lower.substring(0, lower.length() - 4);
		}
		return lower;
	}

	public boolean isConfigured() {
		return basePath != null && error == null;
	}

	/** Sonuçtaki hata metni: {@code not_configured} ya da {@code not_configured: <neden>}. */
	public String notConfiguredError() {
		return error == null ? "not_configured" : "not_configured: " + error;
	}

	public Path basePath() {
		return basePath;
	}

	public String error() {
		return error;
	}

	public int keepReleases() {
		return keepReleases;
	}

	public Set<RuntimeType> allowedRuntimes() {
		return allowedRuntimes;
	}

	public boolean isRuntimeAllowed(RuntimeType type) {
		return allowedRuntimes.contains(type);
	}

	public Set<String> allowedHookCommands() {
		return allowedHookCommands;
	}

	public boolean isHookCommandAllowed(String command) {
		return command != null && allowedHookCommands.contains(normalizeCommand(command));
	}

	public String nssmPath() {
		return nssmPath;
	}

	/** Log için özet (sır içermez). */
	public String describe() {
		if (!isConfigured()) {
			return notConfiguredError();
		}
		return "base-path=" + basePath + ", keep-releases=" + keepReleases
			+ ", allowed-runtimes=" + allowedRuntimes.stream().map(RuntimeType::wire).toList()
			+ ", allowed-hook-commands=" + allowedHookCommands;
	}
}
