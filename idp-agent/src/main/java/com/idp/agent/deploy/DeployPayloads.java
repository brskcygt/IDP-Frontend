package com.idp.agent.deploy;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

/**
 * Sunucudan gelen {@code artifact_*} payload'larının (sözleşme 1.2) tipli modeli ve katı doğrulaması.
 * Hata mesajları alan yolunu söyler ama değeri (token, config/env değeri) asla yankılamaz.
 */
public final class DeployPayloads {
	/** deployId opak bir metindir (backend: {@code dep_} + 24 hex) ama dosya adında kullanıldığı için dar küme. */
	static final Pattern DEPLOY_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
	static final Pattern REQUEST_ID = Pattern.compile("^[A-Za-z0-9_.-]{1,128}$");
	static final Pattern VERSION = Pattern.compile("^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$");
	static final Pattern COMPONENT = Pattern.compile("^[a-z][a-z0-9-]{0,31}$");
	static final Pattern SUBDIR = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");
	static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");
	static final Pattern SERVICE = Pattern.compile("^[A-Za-z0-9._@-]{1,128}$");
	/** IIS app pool adı iç boşluk içerebilir ("JetSRM Frontend Pool"); appcmd'ye TEK argüman olarak gider. */
	static final Pattern APP_POOL = Pattern.compile("^[A-Za-z0-9._-][A-Za-z0-9 ._-]{0,127}$");
	static final Pattern CONFIG_KEY = Pattern.compile("^[A-Z][A-Z0-9_]{0,127}$");
	static final Pattern ENV_KEY = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,127}$");
	static final Pattern VERSION_PATH = Pattern.compile("^[A-Za-z0-9_$-]{1,64}(\\.[A-Za-z0-9_$-]{1,64}){0,15}$");

	/** Taban dizinde agent'ın kendisine ayrılmış adlar: bileşen buralara yerleştirilemez. */
	static final Set<String> RESERVED_SUBDIRS = Set.of(".releases", "agent");
	/** .releases altında agent'ın kullandığı adlarla çakışan sürüm adları. */
	static final Set<String> RESERVED_VERSIONS = Set.of("prev", "_downloads", "state.json", "state.json.tmp");

	static final int MAX_COMPONENTS = 10;
	static final int MAX_PRESERVE = 50;
	static final int MAX_CONFIG_KEYS = 200;
	static final int MAX_VALUE_LENGTH = 8192;
	static final int MAX_HOOKS = 10;
	static final int MAX_HOOK_ARGS = 64;
	static final int MAX_HOOK_ENV = 50;
	static final long MAX_ARTIFACT_SIZE = 16L * 1024 * 1024 * 1024;
	static final int DEFAULT_TIMEOUT_SEC = 1800;
	static final int DEFAULT_HEALTH_TIMEOUT_SEC = 60;
	static final int DEFAULT_HOOK_TIMEOUT_SEC = 600;

	private static final Gson GSON = new Gson();

	private DeployPayloads() {}

	public record DownloadSpec(URI url, String token, String sha256, long size) {
		@Override
		public String toString() {
			return "DownloadSpec[host=" + url.getHost() + ", sha256=" + sha256 + ", size=" + size + ", token=***]";
		}
	}

	public record RuntimeSpec(RuntimeType type, String serviceName, String appPool) {}

	public record HealthSpec(URI url, String expectVersionPath, int timeoutSec) {}

	public enum RuntimeConfigFormat {
		FRONTEND_CONFIG_JS("frontend-config-js", "config.js"),
		ENV_FILE("env-file", ".env");

		private final String wire;
		private final String fileName;

		RuntimeConfigFormat(String wire, String fileName) {
			this.wire = wire;
			this.fileName = fileName;
		}

		public String wire() { return wire; }
		public String fileName() { return fileName; }

		static RuntimeConfigFormat fromWire(String value) {
			for (RuntimeConfigFormat format : values()) {
				if (format.wire.equals(value)) return format;
			}
			return null;
		}
	}

	public record RuntimeConfigSpec(RuntimeConfigFormat format, Map<String, String> values) {
		@Override
		public String toString() {
			return "RuntimeConfigSpec[format=" + format.wire() + ", keys=" + values.keySet() + "]";
		}
	}

	public record HookSpec(String name, String command, List<String> args, Map<String, String> env, int timeoutSec) {
		@Override
		public String toString() {
			return "HookSpec[name=" + name + ", command=" + command + ", args=" + args.size()
				+ ", envKeys=" + env.keySet() + ", timeoutSec=" + timeoutSec + "]";
		}
	}

	public record ComponentSpec(String name, String subdir, String version, DownloadSpec download,
			RuntimeSpec runtime, List<String> preserve, HealthSpec health, RuntimeConfigSpec runtimeConfigSpec,
			List<HookSpec> preStartHooks) {
		/** Sözleşme 1.2 kullanan çağıranlar için değer görünümü. */
		public Map<String, String> runtimeConfig() {
			return runtimeConfigSpec == null ? null : runtimeConfigSpec.values();
		}

		public RuntimeConfigFormat runtimeConfigFormat() {
			return runtimeConfigSpec == null ? null : runtimeConfigSpec.format();
		}

		@Override
		public String toString() {
			return "ComponentSpec[name=" + name + ", subdir=" + subdir + ", version=" + version
				+ ", runtime=" + runtime + ", preserve=" + preserve.size()
				+ ", runtimeConfig=" + runtimeConfigSpec
				+ ", preStartHooks=" + preStartHooks.size() + ", download=" + download + "]";
		}
	}

	public record DeployRequest(String deployId, String project, String version, int timeoutSec,
			List<ComponentSpec> components) {}

	public record RollbackRequest(String deployId, List<String> components) {}

	/**
	 * {@code artifact_config_apply} bileşeni. Wire biçimi:
	 * {@code {name, runtimeConfig:{format:"frontend-config-js"|"env-file", values:{KEY:"value"}}}}.
	 * Dosya adı istemciden alınmaz; format sırasıyla {@code config.js} ve {@code .env} seçer.
	 */
	public record ConfigComponent(String name, RuntimeConfigSpec runtimeConfig) {}

	/** Sonuç {@code artifact_config_result}, ara olaylar {@code artifact_config_event} kanalındadır. */
	public record ConfigApplyRequest(String deployId, int timeoutSec, List<ConfigComponent> components) {}

	// ------------------------------------------------------------------ yardımcı okuma

	/** deployId / requestId'yi, payload geçersiz olsa bile sonuç mesajında kullanmak için okur. */
	public static String rawId(Object payload, String field) {
		JsonElement tree = tree(payload);
		if (tree == null || !tree.isJsonObject()) {
			return null;
		}
		JsonElement value = tree.getAsJsonObject().get(field);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
			return null;
		}
		String text = value.getAsString();
		return text.isEmpty() ? null : SafeNames.printable(text, 128);
	}

	public static boolean isValidDeployId(String id) {
		return id != null && DEPLOY_ID.matcher(id).matches();
	}

	public static boolean isValidRequestId(String id) {
		return id != null && REQUEST_ID.matcher(id).matches();
	}

	/** Reddedilen isteğin sonucuna yazılacak sürüm (geçerliyse). */
	public static String versionHint(Object payload) {
		String version = rawId(payload, "version");
		return version != null && VERSION.matcher(version).matches() ? version : null;
	}

	private static JsonElement tree(Object payload) {
		if (payload == null) {
			return null;
		}
		if (payload instanceof JsonElement element) {
			return element;
		}
		try {
			return GSON.toJsonTree(payload);
		} catch (RuntimeException ex) {
			return null;
		}
	}

	private static JsonObject root(Object payload) throws DeployException {
		JsonElement tree = tree(payload);
		if (tree == null || !tree.isJsonObject()) {
			throw DeployException.invalidPayload("payload nesne olmali");
		}
		return tree.getAsJsonObject();
	}

	// ------------------------------------------------------------------ artifact_deploy

	public static DeployRequest parseDeploy(Object payload) throws DeployException {
		JsonObject root = root(payload);
		String deployId = id(root, "deployId");
		String project = optionalText(root, "project", "project", 128);
		String version = version(requiredString(root, "version", "version"), "version");
		int timeoutSec = integer(root, "timeoutSec", "timeoutSec", 1, 86_400, DEFAULT_TIMEOUT_SEC);

		JsonArray array = requiredArray(root, "components", "components");
		if (array.isEmpty() || array.size() > MAX_COMPONENTS) {
			throw DeployException.invalidPayload("components 1-" + MAX_COMPONENTS + " eleman olmali");
		}
		List<ComponentSpec> components = new ArrayList<>();
		Set<String> names = new HashSet<>();
		Set<String> subdirs = new HashSet<>();
		for (int i = 0; i < array.size(); i++) {
			String path = "components[" + i + "]";
			JsonElement element = array.get(i);
			if (element == null || !element.isJsonObject()) {
				throw DeployException.invalidPayload(path + " nesne olmali");
			}
			ComponentSpec component = parseComponent(element.getAsJsonObject(), path, version);
			if (!names.add(component.name())) {
				throw DeployException.invalidPayload(path + ".name tekrar ediyor");
			}
			if (!subdirs.add(component.subdir().toLowerCase(Locale.ROOT))) {
				throw DeployException.invalidPayload(path + ".subdir tekrar ediyor");
			}
			components.add(component);
		}
		return new DeployRequest(deployId, project, version, timeoutSec, Collections.unmodifiableList(components));
	}

	private static ComponentSpec parseComponent(JsonObject object, String path, String defaultVersion)
			throws DeployException {
		String name = requiredString(object, "name", path + ".name");
		if (!COMPONENT.matcher(name).matches()) {
			throw DeployException.invalidPayload(path + ".name gecersiz (^[a-z][a-z0-9-]{0,31}$)");
		}
		String subdir = requiredString(object, "subdir", path + ".subdir");
		if (!SUBDIR.matcher(subdir).matches() || !SafeNames.isSafeSegment(subdir)) {
			throw DeployException.invalidPayload(path + ".subdir guvenli bir klasor adi olmali");
		}
		if (RESERVED_SUBDIRS.contains(subdir.toLowerCase(Locale.ROOT))) {
			throw DeployException.invalidPayload(path + ".subdir agent'a ayrilmis bir ad (" + subdir + ")");
		}
		String componentVersion = optionalString(object, "version", path + ".version");
		String version = componentVersion == null ? defaultVersion : version(componentVersion, path + ".version");

		DownloadSpec download = parseDownload(requiredObject(object, "download", path + ".download"), path + ".download");
		RuntimeSpec runtime = parseRuntime(requiredObject(object, "runtime", path + ".runtime"), path + ".runtime");
		List<String> preserve = parsePreserve(optionalArray(object, "preserve", path + ".preserve"), path + ".preserve");
		JsonObject healthObject = optionalObject(object, "health", path + ".health");
		HealthSpec health = healthObject == null ? null : parseHealth(healthObject, path + ".health");
		JsonObject configObject = optionalObject(object, "runtimeConfig", path + ".runtimeConfig");
		RuntimeConfigSpec runtimeConfig = configObject == null ? null : parseRuntimeConfigSpec(configObject,
			path + ".runtimeConfig", true);
		JsonObject hooksObject = optionalObject(object, "hooks", path + ".hooks");
		List<HookSpec> hooks = hooksObject == null ? List.of() : parseHooks(hooksObject, path + ".hooks");

		return new ComponentSpec(name, subdir, version, download, runtime, preserve, health, runtimeConfig, hooks);
	}

	private static DownloadSpec parseDownload(JsonObject object, String path) throws DeployException {
		URI url = httpUrl(requiredString(object, "url", path + ".url"), path + ".url");
		String token = requiredString(object, "token", path + ".token");
		if (token.isEmpty() || token.length() > 4096 || token.chars().anyMatch(c -> c <= 0x20 || c == 0x7f)) {
			throw DeployException.invalidPayload(path + ".token gecersiz");
		}
		String sha = requiredString(object, "sha256", path + ".sha256");
		if (!SHA256.matcher(sha).matches()) {
			throw DeployException.invalidPayload(path + ".sha256 64 karakter hex olmali");
		}
		long size = longValue(object, "size", path + ".size", 1, MAX_ARTIFACT_SIZE);
		return new DownloadSpec(url, token, sha.toLowerCase(Locale.ROOT), size);
	}

	private static RuntimeSpec parseRuntime(JsonObject object, String path) throws DeployException {
		String typeText = requiredString(object, "type", path + ".type");
		RuntimeType type = RuntimeType.fromWire(typeText);
		if (type == null) {
			throw DeployException.invalidPayload(path + ".type bilinmiyor (nssm|windows-service|iis-static|systemd|none)");
		}
		String serviceName = null;
		String appPool = null;
		if (type.requiresServiceName()) {
			serviceName = requiredString(object, "serviceName", path + ".serviceName");
			if (!SERVICE.matcher(serviceName).matches()) {
				throw DeployException.invalidPayload(path + ".serviceName gecersiz (^[A-Za-z0-9._@-]{1,128}$)");
			}
		}
		// Backend runtime'da her zaman serviceName ve appPool'u (kullanılmayan null) gönderir; ilgisiz alan yok sayılır.
		if (type == RuntimeType.IIS_STATIC) {
			appPool = optionalString(object, "appPool", path + ".appPool");
			if (appPool != null && appPool.isEmpty()) {
				appPool = null; // proje ayarında boş bırakılmış app pool = geri dönüşüm yok
			}
			if (appPool != null && !APP_POOL.matcher(appPool).matches()) {
				throw DeployException.invalidPayload(path + ".appPool gecersiz (^[A-Za-z0-9._-][A-Za-z0-9 ._-]{0,127}$)");
			}
		}
		return new RuntimeSpec(type, serviceName, appPool);
	}

	static List<String> parsePreserve(JsonArray array, String path) throws DeployException {
		if (array == null) {
			return List.of();
		}
		if (array.size() > MAX_PRESERVE) {
			throw DeployException.invalidPayload(path + " en fazla " + MAX_PRESERVE + " desen olabilir");
		}
		List<String> result = new ArrayList<>();
		for (int i = 0; i < array.size(); i++) {
			String itemPath = path + "[" + i + "]";
			JsonElement element = array.get(i);
			if (!isString(element)) {
				throw DeployException.invalidPayload(itemPath + " metin olmali");
			}
			result.add(normalizePreservePattern(element.getAsString(), itemPath));
		}
		return Collections.unmodifiableList(result);
	}

	/** Göreli desen: '..' yok, '/' ya da '\' ile başlamaz, sürücü harfi / ':' yok. '\' → '/'. */
	static String normalizePreservePattern(String raw, String path) throws DeployException {
		String pattern = raw.trim().replace('\\', '/');
		if (pattern.isEmpty() || pattern.length() > 256 || SafeNames.containsControl(pattern)) {
			throw DeployException.invalidPayload(path + " gecersiz");
		}
		if (pattern.startsWith("/")) {
			throw DeployException.invalidPayload(path + " goreli olmali ('/' ile baslayamaz)");
		}
		if (pattern.indexOf(':') >= 0) {
			throw DeployException.invalidPayload(path + " surucu harfi ya da ':' iceremez");
		}
		while (pattern.startsWith("./")) {
			pattern = pattern.substring(2);
		}
		while (pattern.endsWith("/")) {
			pattern = pattern.substring(0, pattern.length() - 1);
		}
		if (pattern.isEmpty()) {
			throw DeployException.invalidPayload(path + " gecersiz");
		}
		for (String segment : pattern.split("/", -1)) {
			if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
				throw DeployException.invalidPayload(path + " '..', '.' ya da bos segment iceremez");
			}
		}
		return pattern;
	}

	private static HealthSpec parseHealth(JsonObject object, String path) throws DeployException {
		URI url = httpUrl(requiredString(object, "url", path + ".url"), path + ".url");
		String versionPath = optionalString(object, "expectVersionPath", path + ".expectVersionPath");
		if (versionPath != null && versionPath.isEmpty()) {
			versionPath = null;
		}
		if (versionPath != null && !VERSION_PATH.matcher(versionPath).matches()) {
			throw DeployException.invalidPayload(path + ".expectVersionPath gecersiz (nokta ile ayrilmis alan adlari)");
		}
		int timeoutSec = integer(object, "timeoutSec", path + ".timeoutSec", 1, 600, DEFAULT_HEALTH_TIMEOUT_SEC);
		return new HealthSpec(url, versionPath, timeoutSec);
	}

	private static RuntimeConfigSpec parseRuntimeConfigSpec(JsonObject object, String path, boolean legacyAllowed)
			throws DeployException {
		boolean structured = object.has("format") || object.has("values");
		if (!structured) {
			if (!legacyAllowed) {
				throw DeployException.invalidPayload(path + " format ve values icermeli");
			}
			return new RuntimeConfigSpec(RuntimeConfigFormat.FRONTEND_CONFIG_JS,
				parseRuntimeConfigValues(object, path, RuntimeConfigFormat.FRONTEND_CONFIG_JS));
		}
		if (object.size() != 2 || !object.has("format") || !object.has("values")) {
			throw DeployException.invalidPayload(path + " yalniz format ve values icermeli");
		}
		String formatText = requiredString(object, "format", path + ".format");
		RuntimeConfigFormat format = RuntimeConfigFormat.fromWire(formatText);
		if (format == null) {
			throw DeployException.invalidPayload(path + ".format bilinmiyor (frontend-config-js|env-file)");
		}
		JsonObject values = requiredObject(object, "values", path + ".values");
		return new RuntimeConfigSpec(format, parseRuntimeConfigValues(values, path + ".values", format));
	}

	private static Map<String, String> parseRuntimeConfigValues(JsonObject object, String path,
			RuntimeConfigFormat format) throws DeployException {
		if (object.size() > MAX_CONFIG_KEYS) {
			throw DeployException.invalidPayload(path + " en fazla " + MAX_CONFIG_KEYS + " anahtar olabilir");
		}
		Map<String, String> result = new LinkedHashMap<>();
		for (Map.Entry<String, JsonElement> entry : object.entrySet()) {
			String key = entry.getKey();
			Pattern keyPattern = format == RuntimeConfigFormat.ENV_FILE ? ENV_KEY : CONFIG_KEY;
			if (!keyPattern.matcher(key).matches()) {
				throw DeployException.invalidPayload(path + " anahtari gecersiz: "
					+ SafeNames.printable(key, 64));
			}
			if (!isString(entry.getValue())) {
				throw DeployException.invalidPayload(path + "." + key + " metin olmali");
			}
			String value = entry.getValue().getAsString();
			if (value.length() > MAX_VALUE_LENGTH || (format == RuntimeConfigFormat.ENV_FILE && value.indexOf('\0') >= 0)) {
				throw DeployException.invalidPayload(path + "." + key + " cok uzun");
			}
			result.put(key, value);
		}
		return Collections.unmodifiableMap(result);
	}

	// ------------------------------------------------------------------ artifact_config_apply

	public static ConfigApplyRequest parseConfigApply(Object payload) throws DeployException {
		JsonObject root = root(payload);
		String deployId = id(root, "deployId");
		int timeoutSec = integer(root, "timeoutSec", "timeoutSec", 1, 86_400, DEFAULT_TIMEOUT_SEC);
		JsonArray array = requiredArray(root, "components", "components");
		if (array.isEmpty() || array.size() > MAX_COMPONENTS) {
			throw DeployException.invalidPayload("components 1-" + MAX_COMPONENTS + " eleman olmali");
		}
		List<ConfigComponent> components = new ArrayList<>();
		Set<String> names = new HashSet<>();
		for (int i = 0; i < array.size(); i++) {
			String path = "components[" + i + "]";
			JsonElement element = array.get(i);
			if (element == null || !element.isJsonObject()) {
				throw DeployException.invalidPayload(path + " nesne olmali");
			}
			JsonObject component = element.getAsJsonObject();
			String name = requiredString(component, "name", path + ".name");
			if (!COMPONENT.matcher(name).matches() || !names.add(name)) {
				throw DeployException.invalidPayload(path + ".name gecersiz ya da tekrar ediyor");
			}
			RuntimeConfigSpec config = parseRuntimeConfigSpec(
				requiredObject(component, "runtimeConfig", path + ".runtimeConfig"), path + ".runtimeConfig", false);
			components.add(new ConfigComponent(name, config));
		}
		return new ConfigApplyRequest(deployId, timeoutSec, Collections.unmodifiableList(components));
	}

	private static List<HookSpec> parseHooks(JsonObject object, String path) throws DeployException {
		JsonArray array = optionalArray(object, "preStart", path + ".preStart");
		if (array == null) {
			return List.of();
		}
		if (array.size() > MAX_HOOKS) {
			throw DeployException.invalidPayload(path + ".preStart en fazla " + MAX_HOOKS + " hook olabilir");
		}
		List<HookSpec> hooks = new ArrayList<>();
		Set<String> names = new HashSet<>();
		for (int i = 0; i < array.size(); i++) {
			String itemPath = path + ".preStart[" + i + "]";
			JsonElement element = array.get(i);
			if (element == null || !element.isJsonObject()) {
				throw DeployException.invalidPayload(itemPath + " nesne olmali");
			}
			HookSpec hook = parseHook(element.getAsJsonObject(), itemPath);
			if (!names.add(hook.name())) {
				throw DeployException.invalidPayload(itemPath + ".name tekrar ediyor");
			}
			hooks.add(hook);
		}
		return Collections.unmodifiableList(hooks);
	}

	private static HookSpec parseHook(JsonObject object, String path) throws DeployException {
		String name = requiredString(object, "name", path + ".name").trim();
		if (name.isEmpty() || name.length() > 64 || SafeNames.containsControl(name)) {
			throw DeployException.invalidPayload(path + ".name 1-64 karakter olmali");
		}
		String command = requiredString(object, "command", path + ".command");
		if (!DeployConfig.COMMAND.matcher(command).matches() || command.equals(".") || command.equals("..")) {
			throw DeployException.invalidPayload(path + ".command yalin komut adi olmali (^[A-Za-z0-9._-]{1,64}$)");
		}
		List<String> args = new ArrayList<>();
		JsonArray argArray = optionalArray(object, "args", path + ".args");
		if (argArray != null) {
			if (argArray.size() > MAX_HOOK_ARGS) {
				throw DeployException.invalidPayload(path + ".args en fazla " + MAX_HOOK_ARGS + " eleman olabilir");
			}
			for (int i = 0; i < argArray.size(); i++) {
				JsonElement element = argArray.get(i);
				if (!isString(element)) {
					throw DeployException.invalidPayload(path + ".args[" + i + "] metin olmali");
				}
				String arg = element.getAsString();
				// '"' Windows komut satırı kaçışında belirsiz; kontrol karakteri hiçbir platformda gerekmez.
				if (arg.length() > 1024 || SafeNames.containsControl(arg) || arg.indexOf('"') >= 0) {
					throw DeployException.invalidPayload(path + ".args[" + i + "] gecersiz (kontrol karakteri ya da '\"' iceremez)");
				}
				args.add(arg);
			}
		}
		Map<String, String> env = new LinkedHashMap<>();
		JsonObject envObject = optionalObject(object, "env", path + ".env");
		if (envObject != null) {
			if (envObject.size() > MAX_HOOK_ENV) {
				throw DeployException.invalidPayload(path + ".env en fazla " + MAX_HOOK_ENV + " anahtar olabilir");
			}
			for (Map.Entry<String, JsonElement> entry : envObject.entrySet()) {
				if (!ENV_KEY.matcher(entry.getKey()).matches()) {
					throw DeployException.invalidPayload(path + ".env anahtari gecersiz: " + SafeNames.printable(entry.getKey(), 64));
				}
				if (!isString(entry.getValue())) {
					throw DeployException.invalidPayload(path + ".env." + entry.getKey() + " metin olmali");
				}
				String value = entry.getValue().getAsString();
				if (value.length() > MAX_VALUE_LENGTH || value.indexOf('\0') >= 0) {
					throw DeployException.invalidPayload(path + ".env." + entry.getKey() + " gecersiz");
				}
				env.put(entry.getKey(), value);
			}
		}
		int timeoutSec = integer(object, "timeoutSec", path + ".timeoutSec", 1, 3600, DEFAULT_HOOK_TIMEOUT_SEC);
		return new HookSpec(name, command, Collections.unmodifiableList(args), Collections.unmodifiableMap(env), timeoutSec);
	}

	// ------------------------------------------------------------------ artifact_rollback

	public static RollbackRequest parseRollback(Object payload) throws DeployException {
		JsonObject root = root(payload);
		String deployId = id(root, "deployId");
		JsonArray array = optionalArray(root, "components", "components");
		if (array == null) {
			return new RollbackRequest(deployId, null);
		}
		if (array.isEmpty() || array.size() > MAX_COMPONENTS) {
			throw DeployException.invalidPayload("components 1-" + MAX_COMPONENTS + " eleman ya da null olmali");
		}
		List<String> names = new ArrayList<>();
		for (int i = 0; i < array.size(); i++) {
			JsonElement element = array.get(i);
			if (!isString(element) || !COMPONENT.matcher(element.getAsString()).matches()) {
				throw DeployException.invalidPayload("components[" + i + "] gecersiz bilesen adi");
			}
			if (names.contains(element.getAsString())) {
				throw DeployException.invalidPayload("components[" + i + "] tekrar ediyor");
			}
			names.add(element.getAsString());
		}
		return new RollbackRequest(deployId, Collections.unmodifiableList(names));
	}

	// ------------------------------------------------------------------ alan okuyucular

	private static String id(JsonObject object, String key) throws DeployException {
		String value = requiredString(object, key, key);
		if (!DEPLOY_ID.matcher(value).matches()) {
			throw DeployException.invalidPayload(key + " gecersiz (^[A-Za-z0-9_-]{1,64}$)");
		}
		return value;
	}

	private static String version(String value, String path) throws DeployException {
		if (!VERSION.matcher(value).matches() || !SafeNames.isSafeSegment(value)
			|| RESERVED_VERSIONS.contains(value.toLowerCase(Locale.ROOT))) {
			throw DeployException.invalidPayload(path + " gecersiz (^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$)");
		}
		return value;
	}

	private static URI httpUrl(String value, String path) throws DeployException {
		URI uri;
		try {
			uri = new URI(value);
		} catch (URISyntaxException ex) {
			throw DeployException.invalidPayload(path + " gecerli bir URL degil");
		}
		String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
		if (!scheme.equals("http") && !scheme.equals("https")) {
			throw DeployException.invalidPayload(path + " http(s) olmali");
		}
		if (uri.getHost() == null || uri.getHost().isBlank()) {
			throw DeployException.invalidPayload(path + " host icermeli");
		}
		if (uri.getRawUserInfo() != null) {
			throw DeployException.invalidPayload(path + " kullanici bilgisi iceremez");
		}
		return uri;
	}

	private static boolean isString(JsonElement element) {
		return element != null && element.isJsonPrimitive() && element.getAsJsonPrimitive().isString();
	}

	private static String requiredString(JsonObject object, String key, String path) throws DeployException {
		String value = optionalString(object, key, path);
		if (value == null) {
			throw DeployException.invalidPayload(path + " zorunlu");
		}
		return value;
	}

	private static String optionalString(JsonObject object, String key, String path) throws DeployException {
		JsonElement element = object.get(key);
		if (element == null || element.isJsonNull()) {
			return null;
		}
		if (!isString(element)) {
			throw DeployException.invalidPayload(path + " metin olmali");
		}
		return element.getAsString();
	}

	private static String optionalText(JsonObject object, String key, String path, int max) throws DeployException {
		String value = optionalString(object, key, path);
		if (value != null && (value.length() > max || SafeNames.containsControl(value))) {
			throw DeployException.invalidPayload(path + " gecersiz");
		}
		return value;
	}

	private static JsonObject requiredObject(JsonObject object, String key, String path) throws DeployException {
		JsonObject value = optionalObject(object, key, path);
		if (value == null) {
			throw DeployException.invalidPayload(path + " zorunlu");
		}
		return value;
	}

	private static JsonObject optionalObject(JsonObject object, String key, String path) throws DeployException {
		JsonElement element = object.get(key);
		if (element == null || element.isJsonNull()) {
			return null;
		}
		if (!element.isJsonObject()) {
			throw DeployException.invalidPayload(path + " nesne olmali");
		}
		return element.getAsJsonObject();
	}

	private static JsonArray requiredArray(JsonObject object, String key, String path) throws DeployException {
		JsonArray value = optionalArray(object, key, path);
		if (value == null) {
			throw DeployException.invalidPayload(path + " zorunlu");
		}
		return value;
	}

	private static JsonArray optionalArray(JsonObject object, String key, String path) throws DeployException {
		JsonElement element = object.get(key);
		if (element == null || element.isJsonNull()) {
			return null;
		}
		if (!element.isJsonArray()) {
			throw DeployException.invalidPayload(path + " dizi olmali");
		}
		return element.getAsJsonArray();
	}

	private static int integer(JsonObject object, String key, String path, int min, int max, int defaultValue)
			throws DeployException {
		JsonElement element = object.get(key);
		if (element == null || element.isJsonNull()) {
			return defaultValue;
		}
		return (int) longValue(object, key, path, min, max);
	}

	private static long longValue(JsonObject object, String key, String path, long min, long max) throws DeployException {
		JsonElement element = object.get(key);
		if (element == null || element.isJsonNull()) {
			throw DeployException.invalidPayload(path + " zorunlu");
		}
		if (!element.isJsonPrimitive() || !((JsonPrimitive) element).isNumber()) {
			throw DeployException.invalidPayload(path + " sayi olmali");
		}
		double number = element.getAsDouble();
		if (Double.isNaN(number) || number != Math.rint(number) || number < min || number > max) {
			throw DeployException.invalidPayload(path + " " + min + "-" + max + " arasinda tam sayi olmali");
		}
		return (long) number;
	}
}
