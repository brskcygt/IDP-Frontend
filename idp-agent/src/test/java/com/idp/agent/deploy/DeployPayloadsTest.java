package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.idp.agent.deploy.DeployPayloads.ComponentSpec;
import com.idp.agent.deploy.DeployPayloads.DeployRequest;
import com.idp.agent.deploy.DeployPayloads.RollbackRequest;

class DeployPayloadsTest {
	private static final String TOKEN = "dl-token-SECRET-abcdef";
	private static final String ENV_SECRET = "postgres-password-123";
	private static final String SHA = "A".repeat(64);

	/** Sözleşme 1.2'deki örnek (+ preStart hook). */
	private static final String SAMPLE = "{\"deployId\":\"dep_01\",\"project\":\"jetsrm\",\"version\":\"2.5.0\",\"timeoutSec\":1800,"
		+ "\"components\":["
		+ "{\"name\":\"backend\",\"subdir\":\"backend\",\"version\":\"2.5.0\","
		+ "\"download\":{\"url\":\"https://idp.example/api/artifacts/a1/download\",\"token\":\"" + TOKEN + "\",\"sha256\":\"" + SHA + "\",\"size\":123},"
		+ "\"runtime\":{\"type\":\"nssm\",\"serviceName\":\"jetsrm-backend\"},"
		+ "\"preserve\":[\".env\",\"config/**\",\"uploads/**\",\"logs/**\"],"
		+ "\"health\":{\"url\":\"http://127.0.0.1:3000/health\",\"expectVersionPath\":\"version\",\"timeoutSec\":90},"
		+ "\"runtimeConfig\":null,"
		+ "\"hooks\":{\"preStart\":[{\"name\":\"db-migrate\",\"command\":\"node\",\"args\":[\"node_modules/sequelize-cli/lib/sequelize\",\"db:migrate\"],"
		+ "\"env\":{\"DB_PASSWORD\":\"" + ENV_SECRET + "\"},\"timeoutSec\":300}]}},"
		+ "{\"name\":\"frontend\",\"subdir\":\"frontend\",\"version\":\"2.5.0\","
		+ "\"download\":{\"url\":\"https://idp.example/api/artifacts/a2/download\",\"token\":\"" + TOKEN + "2\",\"sha256\":\"" + "b".repeat(64) + "\",\"size\":456},"
		+ "\"runtime\":{\"type\":\"iis-static\",\"appPool\":null},"
		+ "\"preserve\":[\"web.config\"],\"health\":null,"
		+ "\"runtimeConfig\":{\"VITE_APP_MAIN_URL\":\"https://api.customer\",\"VITE_COMPANY_NAME\":\"temsa\"}}]}";

	private static JsonObject sample() {
		return JsonParser.parseString(SAMPLE).getAsJsonObject();
	}

	private static JsonObject backend(JsonObject root) {
		return root.getAsJsonArray("components").get(0).getAsJsonObject();
	}

	@Test
	void parsesContractSampleLikeTheWebSocketPath() throws Exception {
		// Gerçek yol: Gson → Object (LinkedTreeMap, Double sayılar).
		Object payload = new Gson().fromJson(SAMPLE, Object.class);
		DeployRequest request = DeployPayloads.parseDeploy(payload);

		assertEquals("dep_01", request.deployId());
		assertEquals("2.5.0", request.version());
		assertEquals(1800, request.timeoutSec());
		assertEquals(2, request.components().size());

		ComponentSpec backend = request.components().get(0);
		assertEquals("backend", backend.name());
		assertEquals(RuntimeType.NSSM, backend.runtime().type());
		assertEquals("jetsrm-backend", backend.runtime().serviceName());
		assertEquals(SHA.toLowerCase(), backend.download().sha256());
		assertEquals(123, backend.download().size());
		assertEquals(List.of(".env", "config/**", "uploads/**", "logs/**"), backend.preserve());
		assertEquals("version", backend.health().expectVersionPath());
		assertEquals(90, backend.health().timeoutSec());
		assertNull(backend.runtimeConfig());
		assertEquals(1, backend.preStartHooks().size());
		assertEquals("node", backend.preStartHooks().get(0).command());
		assertEquals(List.of("node_modules/sequelize-cli/lib/sequelize", "db:migrate"), backend.preStartHooks().get(0).args());
		assertEquals(300, backend.preStartHooks().get(0).timeoutSec());

		ComponentSpec frontend = request.components().get(1);
		assertEquals(RuntimeType.IIS_STATIC, frontend.runtime().type());
		assertNull(frontend.runtime().appPool());
		assertNull(frontend.health());
		assertEquals(Map.of("VITE_APP_MAIN_URL", "https://api.customer", "VITE_COMPANY_NAME", "temsa"), frontend.runtimeConfig());
		assertTrue(frontend.preStartHooks().isEmpty());
	}

	@Test
	void defaultsApply() throws Exception {
		JsonObject root = sample();
		root.remove("timeoutSec");
		JsonObject backend = backend(root);
		backend.remove("version");
		backend.getAsJsonObject("health").remove("timeoutSec");
		backend.getAsJsonObject("hooks").getAsJsonArray("preStart").get(0).getAsJsonObject().remove("timeoutSec");
		DeployRequest request = DeployPayloads.parseDeploy(root);
		assertEquals(1800, request.timeoutSec());
		assertEquals("2.5.0", request.components().get(0).version());
		assertEquals(60, request.components().get(0).health().timeoutSec());
		assertEquals(600, request.components().get(0).preStartHooks().get(0).timeoutSec());
	}

	private static void assertInvalid(Consumer<JsonObject> mutation, String expectedFragment) {
		JsonObject root = sample();
		mutation.accept(root);
		DeployException ex = assertThrows(DeployException.class, () -> DeployPayloads.parseDeploy(root), expectedFragment);
		assertTrue(ex.getMessage().startsWith("invalid_payload: "), ex.getMessage());
		assertTrue(ex.getMessage().contains(expectedFragment), ex.getMessage() + " / " + expectedFragment);
		assertFalse(ex.getMessage().contains(TOKEN), "token yankilanmamali");
		assertFalse(ex.getMessage().contains(ENV_SECRET), "env degeri yankilanmamali");
	}

	@Test
	void rejectsUnsafeOrMalformedFields() {
		assertInvalid(r -> r.addProperty("deployId", "../x"), "deployId");
		assertInvalid(r -> r.addProperty("version", "../1"), "version");
		assertInvalid(r -> r.addProperty("version", "prev"), "version");
		assertInvalid(r -> r.addProperty("version", "CON"), "version");
		assertInvalid(r -> r.addProperty("timeoutSec", 0), "timeoutSec");
		assertInvalid(r -> r.addProperty("timeoutSec", 1.5), "timeoutSec");
		assertInvalid(r -> r.add("components", new JsonArray()), "components");
		assertInvalid(r -> r.remove("components"), "components");
		assertInvalid(r -> backend(r).addProperty("name", "Backend"), "name");
		assertInvalid(r -> backend(r).addProperty("name", "frontend"), "tekrar");
		assertInvalid(r -> backend(r).addProperty("subdir", ".."), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", "a/b"), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", "C:x"), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", "/etc"), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", ".releases"), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", "Agent"), "subdir");
		assertInvalid(r -> backend(r).addProperty("subdir", "FRONTEND"), "tekrar");
		assertInvalid(r -> backend(r).getAsJsonObject("download").addProperty("url", "ftp://x/y"), "download.url");
		assertInvalid(r -> backend(r).getAsJsonObject("download").addProperty("url", "https://u:p@x/y"), "download.url");
		assertInvalid(r -> backend(r).getAsJsonObject("download").addProperty("token", "has space " + TOKEN), "download.token");
		assertInvalid(r -> backend(r).getAsJsonObject("download").addProperty("sha256", "abc"), "sha256");
		assertInvalid(r -> backend(r).getAsJsonObject("download").addProperty("size", 0), "size");
		assertInvalid(r -> backend(r).getAsJsonObject("runtime").addProperty("type", "docker"), "runtime.type");
		assertInvalid(r -> backend(r).getAsJsonObject("runtime").addProperty("serviceName", "bad name"), "serviceName");
		assertInvalid(r -> backend(r).getAsJsonObject("runtime").addProperty("serviceName", "x\" & calc"), "serviceName");
		assertInvalid(r -> backend(r).getAsJsonObject("runtime").remove("serviceName"), "serviceName");
		assertInvalid(r -> backend(r).getAsJsonArray("preserve").add("../secrets"), "preserve");
		assertInvalid(r -> backend(r).getAsJsonArray("preserve").add("/etc/passwd"), "preserve");
		assertInvalid(r -> backend(r).getAsJsonArray("preserve").add("\\\\server\\share"), "preserve");
		assertInvalid(r -> backend(r).getAsJsonArray("preserve").add("C:/Windows"), "preserve");
		assertInvalid(r -> backend(r).getAsJsonArray("preserve").add("web.config:stream"), "preserve");
		assertInvalid(r -> backend(r).getAsJsonObject("health").addProperty("url", "file:///etc/passwd"), "health.url");
		assertInvalid(r -> backend(r).getAsJsonObject("health").addProperty("timeoutSec", 601), "health.timeoutSec");
		assertInvalid(r -> backend(r).getAsJsonObject("health").addProperty("expectVersionPath", "a..b"), "expectVersionPath");
		assertInvalid(r -> backend(r).add("runtimeConfig", obj("lower_key", new JsonPrimitive("v"))), "runtimeConfig");
		assertInvalid(r -> backend(r).add("runtimeConfig", obj("API_URL", new JsonPrimitive(5))), "runtimeConfig.API_URL");
		assertInvalid(r -> hook(r).addProperty("command", "/bin/sh"), "command");
		assertInvalid(r -> hook(r).addProperty("command", "..\\node"), "command");
		assertInvalid(r -> hook(r).getAsJsonArray("args").add("say \"hi\""), "args");
		assertInvalid(r -> hook(r).getAsJsonArray("args").add("line\nbreak"), "args");
		assertInvalid(r -> hook(r).add("env", obj("BAD-KEY", new JsonPrimitive(ENV_SECRET))), "env");
		assertInvalid(r -> hook(r).add("env", obj("DB_PASSWORD", new JsonPrimitive(7))), "env.DB_PASSWORD");
		assertInvalid(r -> hook(r).addProperty("timeoutSec", 3601), "timeoutSec");
		assertInvalid(r -> {
			JsonArray hooks = backend(r).getAsJsonObject("hooks").getAsJsonArray("preStart");
			hooks.add(hooks.get(0).deepCopy());
		}, "tekrar");
	}

	private static JsonObject hook(JsonObject root) {
		return backend(root).getAsJsonObject("hooks").getAsJsonArray("preStart").get(0).getAsJsonObject();
	}

	private static JsonObject obj(String key, com.google.gson.JsonElement value) {
		JsonObject object = new JsonObject();
		object.add(key, value);
		return object;
	}

	/** Backend (implementer A) gerçek biçimi: dep_+24 hex, runtime'da iki alan da, hooks/health/runtimeConfig null. */
	@Test
	void acceptsBackendShapedPayload() throws Exception {
		JsonObject root = sample();
		root.addProperty("deployId", "dep_0123456789abcdef01234567");
		root.addProperty("timeoutSec", 14400);
		JsonObject backend = backend(root);
		backend.getAsJsonObject("runtime").add("appPool", JsonNull.INSTANCE);
		backend.add("hooks", JsonNull.INSTANCE);
		backend.add("health", JsonNull.INSTANCE);
		JsonObject frontend = root.getAsJsonArray("components").get(1).getAsJsonObject();
		frontend.getAsJsonObject("runtime").add("serviceName", JsonNull.INSTANCE);
		frontend.getAsJsonObject("runtime").addProperty("appPool", "JetSRM Frontend Pool");
		frontend.add("runtimeConfig", JsonNull.INSTANCE);

		DeployRequest request = DeployPayloads.parseDeploy(new Gson().fromJson(root, Object.class));
		assertEquals("dep_0123456789abcdef01234567", request.deployId());
		assertEquals(14400, request.timeoutSec());
		assertTrue(request.components().get(0).preStartHooks().isEmpty());
		assertNull(request.components().get(0).health());
		assertNull(request.components().get(0).runtime().appPool());
		assertEquals("JetSRM Frontend Pool", request.components().get(1).runtime().appPool());
		assertNull(request.components().get(1).runtime().serviceName());
		assertNull(request.components().get(1).runtimeConfig());

		JsonObject nullHooks = sample();
		backend(nullHooks).add("hooks", new JsonObject());
		backend(nullHooks).getAsJsonObject("hooks").add("preStart", JsonNull.INSTANCE);
		assertTrue(DeployPayloads.parseDeploy(nullHooks).components().get(0).preStartHooks().isEmpty());
	}

	@Test
	void deployIdAndAppPoolCharsets() {
		assertTrue(DeployPayloads.isValidDeployId("dep_0123456789abcdef01234567"));
		assertFalse(DeployPayloads.isValidDeployId("dep.1"));
		assertFalse(DeployPayloads.isValidDeployId("x".repeat(65)));
		assertFalse(DeployPayloads.isValidDeployId("dep 1"));
		assertInvalid(r -> r.addProperty("deployId", "dep.1"), "deployId");
		JsonObject root = sample();
		JsonObject frontendRuntime = root.getAsJsonArray("components").get(1).getAsJsonObject().getAsJsonObject("runtime");
		for (String bad : new String[] { " leading", "pool&calc", "pool\"x", "pool/x", "a".repeat(129) }) {
			frontendRuntime.addProperty("appPool", bad);
			assertThrows(DeployException.class, () -> DeployPayloads.parseDeploy(root), bad);
		}
		// Servis adları boşluk kabul etmez.
		assertInvalid(r -> backend(r).getAsJsonObject("runtime").addProperty("serviceName", "JetSRM Backend"), "serviceName");
	}

	@Test
	void toStringNeverLeaksSecrets() throws Exception {
		DeployRequest request = DeployPayloads.parseDeploy(sample());
		String text = request.toString();
		assertFalse(text.contains(TOKEN), text);
		assertFalse(text.contains(ENV_SECRET), text);
		assertFalse(text.contains("https://api.customer"), text);
		assertTrue(text.contains("VITE_APP_MAIN_URL"), text);
	}

	@Test
	void preservePatternsAreNormalized() throws Exception {
		JsonObject root = sample();
		JsonArray preserve = new JsonArray();
		preserve.add("./config\\app.json");
		preserve.add("uploads/");
		backend(root).add("preserve", preserve);
		assertEquals(List.of("config/app.json", "uploads"), DeployPayloads.parseDeploy(root).components().get(0).preserve());
	}

	@Test
	void rollbackPayload() throws Exception {
		RollbackRequest all = DeployPayloads.parseRollback(new Gson().fromJson("{\"deployId\":\"dep_2\",\"components\":null}", Object.class));
		assertEquals("dep_2", all.deployId());
		assertNull(all.components());
		RollbackRequest some = DeployPayloads.parseRollback(new Gson().fromJson("{\"deployId\":\"dep_3\",\"components\":[\"backend\"]}", Object.class));
		assertEquals(List.of("backend"), some.components());
		JsonObject bad = new JsonObject();
		bad.addProperty("deployId", "dep_4");
		JsonArray names = new JsonArray();
		names.add("../x");
		bad.add("components", names);
		assertThrows(DeployException.class, () -> DeployPayloads.parseRollback(bad));
		JsonObject empty = new JsonObject();
		empty.addProperty("deployId", "dep_5");
		empty.add("components", new JsonArray());
		assertThrows(DeployException.class, () -> DeployPayloads.parseRollback(empty));
	}

	@Test
	void rawIdAndVersionHintTolerateGarbage() {
		assertEquals("dep_01", DeployPayloads.rawId(sample(), "deployId"));
		assertNull(DeployPayloads.rawId("", "deployId"));
		assertNull(DeployPayloads.rawId(null, "deployId"));
		JsonObject object = new JsonObject();
		object.add("deployId", JsonNull.INSTANCE);
		assertNull(DeployPayloads.rawId(object, "deployId"));
		object.addProperty("deployId", 5);
		assertNull(DeployPayloads.rawId(object, "deployId"));
		assertEquals("2.5.0", DeployPayloads.versionHint(sample()));
		object.addProperty("version", "../x");
		assertNull(DeployPayloads.versionHint(object));
	}
}
