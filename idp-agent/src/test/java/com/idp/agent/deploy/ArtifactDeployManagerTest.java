package com.idp.agent.deploy;

import static com.idp.agent.deploy.TestSupport.dir;
import static com.idp.agent.deploy.TestSupport.file;
import static com.idp.agent.deploy.TestSupport.list;
import static com.idp.agent.deploy.TestSupport.map;
import static com.idp.agent.deploy.TestSupport.read;
import static com.idp.agent.deploy.TestSupport.sha256;
import static com.idp.agent.deploy.TestSupport.tarGz;
import static com.idp.agent.deploy.TestSupport.wire;
import static com.idp.agent.deploy.TestSupport.write;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Uçtan uca: yerel HTTP sunucusundan gerçek indirme, gerçek tar açma/preserve/swap; çalışma zamanı ve
 * health sahte (macOS/Linux'ta Windows servisleri yok). Payload'lar backend'in gönderdiği biçimde:
 * runtime'da serviceName+appPool ikisi de, kullanılmayanlar null.
 */
@Timeout(60)
class ArtifactDeployManagerTest {
	private static final String BACKEND_TOKEN = "tok-backend-SECRET-0001";
	private static final String FRONTEND_TOKEN = "tok-frontend-SECRET-0002";
	private static final String API_URL = "https://api.customer.example";
	private static final String ENV_SECRET = "db-password-VERY-secret-42";
	private static final String CONFIG_SECRET = "runtime-config-SUPER-secret-99";
	private static final String BACKEND_HEALTH = "http://127.0.0.1:3000/health";
	private static final String FRONTEND_HEALTH = "http://127.0.0.1:8080/";

	@TempDir
	Path tmp;

	private Path base;
	private TestSupport.ArtifactServer server;
	private final TestSupport.CapturingSink sink = new TestSupport.CapturingSink();
	private final TestSupport.CapturingLog log = new TestSupport.CapturingLog();
	private final TestSupport.FakeRuntime runtime = new TestSupport.FakeRuntime();
	private final TestSupport.FakeHealth health = new TestSupport.FakeHealth();
	private ArtifactDeployManager manager;

	@BeforeEach
	void setUp() throws Exception {
		base = Files.createDirectories(tmp.resolve("jetsrm"));
		server = new TestSupport.ArtifactServer();
	}

	@AfterEach
	void tearDown() {
		if (manager != null) {
			manager.shutdown();
		}
		server.close();
	}

	// ------------------------------------------------------------------ yardımcılar

	private DeployConfig config(int keep, RuntimeType... runtimes) {
		Set<RuntimeType> allowed = runtimes.length == 0 ? EnumSet.allOf(RuntimeType.class) : EnumSet.copyOf(Arrays.asList(runtimes));
		return DeployConfig.of(base, keep, allowed, Set.of("node", "npm", "npx", "sh"));
	}

	private ArtifactDeployManager start(DeployConfig config) {
		manager = TestSupport.manager(config, sink, log, runtime, health);
		return manager;
	}

	private static byte[] backendTar(String version) throws Exception {
		return tarGz(tar -> {
			file(tar, "server.js", "backend " + version);
			file(tar, ".env", "FROM_ARTIFACT");
			file(tar, "package.json", "{}");
			dir(tar, "lib/");
			file(tar, "lib/util.js", "util " + version);
		});
	}

	private static byte[] frontendTar(String version) throws Exception {
		return tarGz(tar -> {
			file(tar, "./index.html", "frontend " + version);
			file(tar, "./web.config", "<artifact/>");
			file(tar, "./assets/app.js", "js " + version);
		});
	}

	private static byte[] appTar(String version) throws Exception {
		return tarGz(tar -> file(tar, "server.js", "app " + version));
	}

	private Map<String, Object> download(String id, byte[] data, String token) {
		// Backend gibi: token agent'a bağlı, X-IDP-Agent-Id zorunlu (TestSupport.manager "TEMSA-WIN-01" gönderir).
		server.add(id, data, token).requiredAgent = "TEMSA-WIN-01";
		return map("url", server.url(id).toString(), "token", token, "sha256", sha256(data), "size", data.length);
	}

	private Map<String, Object> backend(String version) throws Exception {
		return map("name", "backend", "subdir", "backend", "version", version,
			"download", download("backend-" + version, backendTar(version), BACKEND_TOKEN),
			"runtime", map("type", "nssm", "serviceName", "jetsrm-backend", "appPool", null),
			"preserve", List.of(".env", "uploads/**"),
			"health", map("url", BACKEND_HEALTH, "expectVersionPath", "version", "timeoutSec", 5),
			"runtimeConfig", null,
			"hooks", null);
	}

	private Map<String, Object> frontend(String version) throws Exception {
		return map("name", "frontend", "subdir", "frontend", "version", version,
			"download", download("frontend-" + version, frontendTar(version), FRONTEND_TOKEN),
			"runtime", map("type", "iis-static", "serviceName", null, "appPool", "JetSRM Frontend Pool"),
			"preserve", List.of("web.config"),
			"health", map("url", FRONTEND_HEALTH, "expectVersionPath", null, "timeoutSec", 5),
			"runtimeConfig", map("VITE_APP_MAIN_URL", API_URL, "VITE_COMPANY_NAME", "temsa"),
			"hooks", null);
	}

	private Map<String, Object> app(String version, String runtimeType) throws Exception {
		return map("name", "app", "subdir", "app", "version", version,
			"download", download("app-" + version + "-" + System.nanoTime(), appTar(version), BACKEND_TOKEN),
			"runtime", map("type", runtimeType, "serviceName", runtimeType.equals("none") ? null : "app-svc", "appPool", null),
			"preserve", List.of(".env"),
			"health", null,
			"runtimeConfig", null,
			"hooks", null);
	}

	@SafeVarargs
	private static Object deploy(String deployId, String version, int timeoutSec, Map<String, Object>... components) {
		return wire(map("deployId", deployId, "project", "jetsrm", "version", version, "timeoutSec", timeoutSec,
			"components", new ArrayList<>(List.of(components))));
	}

	private void seedLive() throws Exception {
		write(base.resolve("backend/server.js"), "backend 1.0.0");
		write(base.resolve("backend/.env"), "SECRET=live-env");
		write(base.resolve("backend/uploads/a.png"), "img");
		write(base.resolve("backend/old.js"), "old");
		write(base.resolve("frontend/index.html"), "frontend 1.0.0");
		write(base.resolve("frontend/web.config"), "<live/>");
	}

	private JsonObject deployAndWait(String deployId, String version, Map<String, Object> component) throws Exception {
		manager.handleDeploy(deploy(deployId, version, 1800, component));
		return sink.awaitResult(deployId);
	}

	private static Map<String, Object> runtimeConfig(String format, Map<String, String> values) {
		return map("format", format, "values", values);
	}

	@SafeVarargs
	private static Object configApply(String deployId, Map<String, Object>... components) {
		return wire(map("deployId", deployId, "timeoutSec", 30,
			"components", new ArrayList<>(List.of(components))));
	}

	private JsonObject awaitConfigResult(String deployId) throws Exception {
		return sink.await(ArtifactDeployManager.CONFIG_RESULT,
			json -> deployId.equals(json.get("deployId").getAsString()), TestSupport.TIMEOUT);
	}

	private static JsonObject component(JsonObject result, String name) {
		for (var element : result.getAsJsonArray("components")) {
			if (element.getAsJsonObject().get("name").getAsString().equals(name)) {
				return element.getAsJsonObject();
			}
		}
		throw new AssertionError(name + " sonucta yok: " + result);
	}

	private static String error(JsonObject result) {
		return result.get("error").isJsonNull() ? null : result.get("error").getAsString();
	}

	private JsonObject state() throws Exception {
		return JsonParser.parseString(read(base.resolve(".releases/state.json"))).getAsJsonObject();
	}

	private void assertNoSecretsLeaked() {
		String messages = sink.allJson();
		String logs = log.all();
		for (String secret : List.of(BACKEND_TOKEN, FRONTEND_TOKEN, ENV_SECRET)) {
			assertFalse(messages.contains(secret), "mesajlarda sir: " + secret);
			assertFalse(logs.contains(secret), "loglarda sir: " + secret);
		}
		assertFalse(logs.contains(API_URL), "runtimeConfig degeri loglanmamali");
		assertFalse(messages.contains(API_URL), "runtimeConfig degeri event'e girmemeli");
	}

	// ------------------------------------------------------------------ testler

	@Test
	void deploysTwoComponentsPreservesFilesWritesConfigAndState() throws Exception {
		seedLive();
		start(config(3));
		String deployId = "dep_0123456789abcdef01234567";
		manager.handleDeploy(deploy(deployId, "2.0.0", 1800, backend("2.0.0"), frontend("2.0.0")));
		JsonObject result = sink.awaitResult(deployId);

		assertTrue(result.get("success").getAsBoolean(), result.toString());
		assertFalse(result.get("rolledBack").getAsBoolean());
		assertTrue(result.get("error").isJsonNull());
		assertEquals("2.0.0", result.get("version").getAsString());
		assertTrue(result.get("durationMs").getAsLong() >= 0);
		assertEquals(2, result.getAsJsonArray("components").size());
		assertTrue(component(result, "backend").get("previousVersion").isJsonNull());
		assertTrue(component(result, "frontend").get("error").isJsonNull());

		assertEquals("backend 2.0.0", read(base.resolve("backend/server.js")));
		assertEquals("SECRET=live-env", read(base.resolve("backend/.env")), "canli .env kazanir");
		assertEquals("img", read(base.resolve("backend/uploads/a.png")));
		assertFalse(Files.exists(base.resolve("backend/old.js")), "eski surum dosyasi tasinmamali");
		assertEquals("util 2.0.0", read(base.resolve("backend/lib/util.js")));
		assertEquals("frontend 2.0.0", read(base.resolve("frontend/index.html")));
		assertEquals("<live/>", read(base.resolve("frontend/web.config")));
		assertEquals(RuntimeConfigWriter.render(Map.of("VITE_APP_MAIN_URL", API_URL, "VITE_COMPANY_NAME", "temsa")),
			read(base.resolve("frontend/config.js")));

		assertEquals(List.of("stop:jetsrm-backend", "start:jetsrm-backend", "start:pool:JetSRM Frontend Pool"), runtime.calls);
		assertEquals(List.of(BACKEND_HEALTH + "|2.0.0", FRONTEND_HEALTH + "|null"), health.checks);

		List<String> prev = list(base.resolve(".releases/prev"));
		assertEquals(2, prev.size(), prev.toString());
		assertTrue(prev.get(0).startsWith("backend-unknown-"), prev.toString());
		assertTrue(prev.get(1).startsWith("frontend-unknown-"), prev.toString());
		assertEquals("backend 1.0.0", read(base.resolve(".releases/prev").resolve(prev.get(0)).resolve("server.js")));
		assertEquals(List.of(), list(base.resolve(".releases/_downloads")));
		assertFalse(Files.exists(base.resolve(".releases/2.0.0")), "staging temizlenmeli");

		JsonObject backendState = state().getAsJsonObject("components").getAsJsonObject("backend");
		assertEquals("2.0.0", backendState.get("version").getAsString());
		assertEquals("[\"unknown\"]", backendState.get("previousVersions").toString());
		assertEquals("nssm", backendState.get("runtimeType").getAsString());
		assertFalse(read(base.resolve(".releases/state.json")).contains(API_URL), "runtimeConfig state'e yazilmaz");

		List<JsonObject> events = sink.events(deployId);
		assertEquals("accepted", events.get(0).get("stage").getAsString());
		assertTrue(events.get(0).get("component").isJsonNull());
		assertEquals("cleanup", events.get(events.size() - 1).get("stage").getAsString());
		assertEquals(DeployReporter.RESULT, sink.lastProcess(deployId), "terminal sonuc en son gelir");
		assertEquals(1, sink.resultCount(deployId));
		List<String> backendStages = events.stream()
			.filter(e -> !e.get("component").isJsonNull() && e.get("component").getAsString().equals("backend"))
			.map(e -> e.get("stage").getAsString()).distinct().collect(Collectors.toList());
		assertEquals(List.of("downloading", "verifying", "extracting", "preserving", "configuring", "stopping",
			"switching", "pre_start", "starting", "health_check"), backendStages);
		for (JsonObject event : events) {
			assertTrue(event.has("progress") && event.has("message") && event.has("status"), event.toString());
		}

		assertTrue(server.authHeaders.contains("Bearer " + BACKEND_TOKEN));
		assertNoSecretsLeaked();
	}

	@Test
	void healthFailureRollsBackAllComponents() throws Exception {
		seedLive();
		health.failures.put(FRONTEND_HEALTH, new AtomicInteger(1));
		start(config(3));
		manager.handleDeploy(deploy("dep_health", "2.0.0", 1800, backend("2.0.0"), frontend("2.0.0")));
		JsonObject result = sink.awaitResult("dep_health");

		assertFalse(result.get("success").getAsBoolean());
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertTrue(error(result).startsWith("frontend: health"), error(result));
		assertTrue(component(result, "backend").get("rolledBack").getAsBoolean());
		assertTrue(component(result, "frontend").get("rolledBack").getAsBoolean());
		assertTrue(component(result, "backend").get("error").getAsString().contains("geri alindi"));

		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
		assertTrue(Files.exists(base.resolve("backend/old.js")));
		assertEquals("frontend 1.0.0", read(base.resolve("frontend/index.html")));
		assertFalse(Files.exists(base.resolve("frontend/config.js")));
		assertEquals(List.of(), list(base.resolve(".releases/prev")));
		assertFalse(Files.exists(base.resolve(".releases/2.0.0")));
		assertFalse(Files.exists(base.resolve(".releases/state.json")), "basarisiz deploy state yazmaz");
		assertEquals(List.of("stop:jetsrm-backend", "start:jetsrm-backend", "start:pool:JetSRM Frontend Pool",
			"start:pool:JetSRM Frontend Pool", "stop:jetsrm-backend", "start:jetsrm-backend"), runtime.calls);
		assertEquals(1, sink.resultCount("dep_health"));
		assertTrue(sink.events("dep_health").stream().anyMatch(e -> e.get("stage").getAsString().equals("rolling_back")
			&& e.get("status").getAsString().equals("done")));
	}

	@Test
	void shaMismatchNeverTouchesLive() throws Exception {
		seedLive();
		start(config(3));
		Map<String, Object> backend = backend("2.0.0");
		@SuppressWarnings("unchecked")
		Map<String, Object> download = (Map<String, Object>) backend.get("download");
		download.put("sha256", sha256("something else".getBytes()));
		JsonObject result = deployAndWait("dep_sha", "2.0.0", backend);

		assertFalse(result.get("success").getAsBoolean());
		assertFalse(result.get("rolledBack").getAsBoolean());
		assertTrue(error(result).contains("SHA-256"), error(result));
		assertTrue(runtime.calls.isEmpty());
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
		assertEquals(List.of(), list(base.resolve(".releases/_downloads")));
	}

	@Test
	void non200DownloadFailsWithoutRetryOrLeftovers() throws Exception {
		start(config(3));
		Map<String, Object> backend = backend("2.0.0");
		server.routes.get("backend-2.0.0").status = 404;
		JsonObject result = deployAndWait("dep_404", "2.0.0", backend);
		assertFalse(result.get("success").getAsBoolean());
		assertTrue(error(result).contains("HTTP 404"), error(result));
		assertEquals(1, server.requests.get());
		assertEquals(List.of(), list(base.resolve(".releases/_downloads")));
		assertTrue(runtime.calls.isEmpty());
	}

	@Test
	void secondDeployWhileBusyGetsBusyResult() throws Exception {
		start(config(3));
		Map<String, Object> first = app("1.0.0", "none");
		String firstRoute = ((String) ((Map<?, ?>) first.get("download")).get("url")).replaceAll(".*/a/", "");
		CountDownLatch gate = new CountDownLatch(1);
		server.routes.get(firstRoute).gate = gate;

		manager.handleDeploy(deploy("dep_a", "1.0.0", 1800, first));
		assertTrue(manager.isBusy());
		manager.handleDeploy(deploy("dep_b", "1.0.1", 1800, app("1.0.1", "none")));
		JsonObject busy = sink.awaitResult("dep_b");
		assertFalse(busy.get("success").getAsBoolean());
		assertEquals("busy", error(busy));
		assertEquals(0, busy.getAsJsonArray("components").size());
		assertEquals("1.0.1", busy.get("version").getAsString());

		gate.countDown();
		JsonObject done = sink.awaitResult("dep_a");
		assertTrue(done.get("success").getAsBoolean(), done.toString());
		assertEquals(1, sink.resultCount("dep_a"));
		assertEquals(1, sink.resultCount("dep_b"));
		assertTrue(sink.events("dep_b").isEmpty(), "reddedilen istek event uretmez");
	}

	@Test
	void duplicateDeployIdIsIgnored() throws Exception {
		start(config(3));
		Object payload = deploy("dep_dup", "1.0.0", 1800, app("1.0.0", "none"));
		manager.handleDeploy(payload);
		sink.awaitResult("dep_dup");
		manager.handleDeploy(payload);
		Thread.sleep(300);
		assertEquals(1, sink.resultCount("dep_dup"));
		assertEquals(1, server.requests.get());
	}

	@Test
	void cancelDuringDownloadAbortsWithoutTouchingLive() throws Exception {
		seedLive();
		start(config(3));
		Map<String, Object> backend = backend("2.0.0");
		TestSupport.Route route = server.routes.get("backend-2.0.0");
		route.stall = true;
		manager.handleDeploy(deploy("dep_cancel", "2.0.0", 1800, backend));
		assertTrue(route.stalled.await(10, TimeUnit.SECONDS));
		Thread.sleep(100);
		manager.handleCancel(wire(map("deployId", "dep_cancel")));
		JsonObject result = sink.awaitResult("dep_cancel");
		route.release.countDown();

		assertFalse(result.get("success").getAsBoolean());
		assertEquals("cancelled", error(result));
		assertFalse(result.get("rolledBack").getAsBoolean());
		assertTrue(runtime.calls.isEmpty());
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
		assertEquals(List.of(), list(base.resolve(".releases/_downloads")));
		assertEquals(1, sink.resultCount("dep_cancel"));
	}

	@Test
	void cancelAfterSwitchRollsBack() throws Exception {
		seedLive();
		health.blockNext.set(true);
		start(config(3));
		manager.handleDeploy(deploy("dep_cancel2", "2.0.0", 1800, backend("2.0.0")));
		assertTrue(health.entered.await(20, TimeUnit.SECONDS));
		manager.handleCancel(wire(map("deployId", "other")));
		manager.handleCancel(wire(map("deployId", "dep_cancel2")));
		JsonObject result = sink.awaitResult("dep_cancel2");

		assertEquals("cancelled", error(result));
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
		assertEquals(List.of("stop:jetsrm-backend", "start:jetsrm-backend", "stop:jetsrm-backend", "start:jetsrm-backend"),
			runtime.calls);
	}

	@Test
	void globalTimeoutIsFailureWithRollback() throws Exception {
		seedLive();
		health.blockNext.set(true);
		start(config(3));
		manager.handleDeploy(deploy("dep_timeout", "2.0.0", 1, backend("2.0.0")));
		JsonObject result = sink.awaitResult("dep_timeout");
		assertFalse(result.get("success").getAsBoolean());
		assertEquals("timeout", error(result));
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
	}

	@Test
	void rejectionsBeforeAnyDownload() throws Exception {
		start(DeployConfig.notConfigured(null));
		manager.handleDeploy(deploy("dep_nc", "2.0.0", 1800, app("2.0.0", "none")));
		assertEquals("not_configured", error(sink.awaitResult("dep_nc")));
		manager.shutdown();

		start(config(3, RuntimeType.NONE, RuntimeType.IIS_STATIC));
		manager.handleDeploy(deploy("dep_rt", "2.0.0", 1800, backend("2.0.0")));
		assertEquals("runtime_not_allowed:nssm", error(sink.awaitResult("dep_rt")));

		manager.handleDeploy(wire(map("deployId", "dep_inv", "version", "2.0.0")));
		JsonObject invalid = sink.awaitResult("dep_inv");
		assertTrue(error(invalid).startsWith("invalid_payload:"), error(invalid));
		assertEquals("2.0.0", invalid.get("version").getAsString());

		manager.handleDeploy(wire(map("deployId", "../evil", "version", "2.0.0")));
		JsonObject badId = sink.awaitResult("../evil");
		assertEquals("invalid_payload: deployId gecersiz", error(badId));

		assertEquals(0, server.requests.get(), "hicbir indirme yapilmamali");
		assertTrue(runtime.calls.isEmpty());
	}

	@Test
	void keepsOnlyConfiguredNumberOfPreviousReleases() throws Exception {
		start(config(2));
		for (int major = 1; major <= 4; major++) {
			String version = major + ".0.0";
			JsonObject result = deployAndWait("dep_keep" + major, version, app(version, "none"));
			assertTrue(result.get("success").getAsBoolean(), result.toString());
		}
		assertEquals("app 4.0.0", read(base.resolve("app/server.js")));
		List<String> prev = list(base.resolve(".releases/prev"));
		assertEquals(2, prev.size(), prev.toString());
		assertTrue(prev.stream().anyMatch(p -> p.startsWith("app-3.0.0-")), prev.toString());
		assertTrue(prev.stream().anyMatch(p -> p.startsWith("app-2.0.0-")), prev.toString());
		assertEquals("[\"3.0.0\",\"2.0.0\"]", state().getAsJsonObject("components").getAsJsonObject("app")
			.get("previousVersions").toString());
		assertEquals(List.of("_downloads", "prev", "state.json"), list(base.resolve(".releases")));
	}

	@Test
	void artifactRollbackRestoresPreviousReleaseAndPreservesFiles() throws Exception {
		start(config(3));
		assertTrue(deployAndWait("dep_r1", "1.0.0", app("1.0.0", "nssm")).get("success").getAsBoolean());
		assertTrue(deployAndWait("dep_r2", "2.0.0", app("2.0.0", "nssm")).get("success").getAsBoolean());
		write(base.resolve("app/.env"), "CHANGED_AFTER_DEPLOY");

		manager.handleRollback(wire(map("deployId", "dep_rb", "components", null)));
		JsonObject result = sink.awaitResult("dep_rb");
		assertTrue(result.get("success").getAsBoolean(), result.toString());
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertEquals("1.0.0", result.get("version").getAsString());
		assertEquals("2.0.0", component(result, "app").get("previousVersion").getAsString());

		assertEquals("app 1.0.0", read(base.resolve("app/server.js")));
		assertEquals("CHANGED_AFTER_DEPLOY", read(base.resolve("app/.env")), "geri almada da preserve uygulanir");
		JsonObject appState = state().getAsJsonObject("components").getAsJsonObject("app");
		assertEquals("1.0.0", appState.get("version").getAsString());
		assertEquals("[]", appState.get("previousVersions").toString());
		assertEquals(List.of(), list(base.resolve(".releases/prev")), "geri alinan surum dizini silinir");
		List<String> calls = runtime.calls;
		assertEquals(List.of("stop:app-svc", "start:app-svc"), calls.subList(calls.size() - 2, calls.size()));

		manager.handleRollback(wire(map("deployId", "dep_rb2", "components", List.of("app"))));
		assertEquals("no_previous_release:app", error(sink.awaitResult("dep_rb2")));
		manager.handleRollback(wire(map("deployId", "dep_rb3", "components", List.of("ghost"))));
		assertEquals("unknown_component:ghost", error(sink.awaitResult("dep_rb3")));
	}

	@Test
	void rollbackWithoutHistoryIsRejected() throws Exception {
		start(config(3));
		manager.handleRollback(wire(map("deployId", "dep_none", "components", null)));
		assertEquals("no_previous_release", error(sink.awaitResult("dep_none")));
	}

	@Test
	void statusReportsStateAndBasePath() throws Exception {
		start(config(3));
		assertTrue(deployAndWait("dep_s1", "1.0.0", app("1.0.0", "none")).get("success").getAsBoolean());
		manager.handleStatus(wire(map("requestId", "req_1")));
		JsonObject status = sink.await(ArtifactDeployManager.STATUS_RESULT,
			json -> "req_1".equals(json.get("requestId").getAsString()), TestSupport.TIMEOUT);
		assertEquals(base.toString(), status.get("basePath").getAsString());
		JsonObject app = status.getAsJsonObject("components").getAsJsonObject("app");
		assertEquals("1.0.0", app.get("version").getAsString());
		assertEquals("[]", app.get("previousVersions").toString());
		assertTrue(app.has("deployedAt"));
		manager.shutdown();

		start(DeployConfig.notConfigured(null));
		manager.handleStatus(wire(map("requestId", "req_2")));
		JsonObject notConfigured = sink.await(ArtifactDeployManager.STATUS_RESULT,
			json -> "req_2".equals(json.get("requestId").getAsString()), TestSupport.TIMEOUT);
		assertEquals("not_configured", notConfigured.get("error").getAsString());
		assertTrue(notConfigured.get("basePath").isJsonNull());
	}

	@Test
	void appliesFrontendAndBackendConfigWithoutChangingReleaseState() throws Exception {
		seedLive();
		start(config(3));
		manager.handleDeploy(deploy("dep_cfg_seed", "2.0.0", 1800, backend("2.0.0"), frontend("2.0.0")));
		assertTrue(sink.awaitResult("dep_cfg_seed").get("success").getAsBoolean());
		String stateBefore = read(base.resolve(".releases/state.json"));
		runtime.calls.clear();
		health.checks.clear();

		manager.handleConfigApply(configApply("cfg_apply_ok",
			map("name", "backend", "runtimeConfig", runtimeConfig("env-file",
				Map.of("DB_PASSWORD", CONFIG_SECRET, "PORT", "3000"))),
			map("name", "frontend", "runtimeConfig", runtimeConfig("frontend-config-js",
				Map.of("VITE_APP_MAIN_URL", "https://new.customer", "VITE_TOKEN", CONFIG_SECRET)))));
		JsonObject result = awaitConfigResult("cfg_apply_ok");

		assertTrue(result.get("success").getAsBoolean(), result.toString());
		assertEquals("2.0.0", result.get("version").getAsString());
		assertEquals("DB_PASSWORD=\"" + CONFIG_SECRET + "\"\nPORT=\"3000\"\n", read(base.resolve("backend/.env")));
		assertEquals(RuntimeConfigWriter.render(Map.of("VITE_APP_MAIN_URL", "https://new.customer",
			"VITE_TOKEN", CONFIG_SECRET)), read(base.resolve("frontend/config.js")));
		assertEquals(stateBefore, read(base.resolve(".releases/state.json")), "config apply release state'i degistirmez");
		assertEquals(List.of("stop:jetsrm-backend", "start:jetsrm-backend", "start:pool:JetSRM Frontend Pool"),
			runtime.calls);
		assertEquals(List.of(BACKEND_HEALTH + "|2.0.0", FRONTEND_HEALTH + "|null"), health.checks);
		assertFalse(sink.allJson().contains(CONFIG_SECRET));
		assertFalse(log.all().contains(CONFIG_SECRET));
		assertEquals(ArtifactDeployManager.CONFIG_RESULT, sink.lastProcess("cfg_apply_ok"));
	}

	@Test
	void configHealthFailureRestoresAllConfigsAndRestartsRuntimes() throws Exception {
		seedLive();
		start(config(3));
		manager.handleDeploy(deploy("dep_cfg_seed2", "2.0.0", 1800, backend("2.0.0"), frontend("2.0.0")));
		assertTrue(sink.awaitResult("dep_cfg_seed2").get("success").getAsBoolean());
		String backendBefore = read(base.resolve("backend/.env"));
		String frontendBefore = read(base.resolve("frontend/config.js"));
		String stateBefore = read(base.resolve(".releases/state.json"));
		runtime.calls.clear();
		health.checks.clear();
		health.failures.put(FRONTEND_HEALTH, new AtomicInteger(1));

		manager.handleConfigApply(configApply("cfg_apply_fail",
			map("name", "backend", "runtimeConfig", runtimeConfig("env-file", Map.of("SECRET", CONFIG_SECRET))),
			map("name", "frontend", "runtimeConfig", runtimeConfig("frontend-config-js",
				Map.of("VITE_SECRET", CONFIG_SECRET)))));
		JsonObject result = awaitConfigResult("cfg_apply_fail");

		assertFalse(result.get("success").getAsBoolean());
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertEquals(backendBefore, read(base.resolve("backend/.env")));
		assertEquals(frontendBefore, read(base.resolve("frontend/config.js")));
		assertEquals(stateBefore, read(base.resolve(".releases/state.json")));
		assertEquals(List.of("stop:jetsrm-backend", "start:jetsrm-backend", "start:pool:JetSRM Frontend Pool",
			"start:pool:JetSRM Frontend Pool", "stop:jetsrm-backend", "start:jetsrm-backend"), runtime.calls);
		assertFalse(sink.allJson().contains(CONFIG_SECRET));
		assertFalse(log.all().contains(CONFIG_SECRET));
		assertTrue(sink.snapshot().stream().noneMatch(message -> message.process().equals(DeployReporter.RESULT)
			&& message.json().contains("cfg_apply_fail")), "config sonucu deploy_result kanalina gitmemeli");
	}

	// ------------------------------------------------------------------ preStart hook'ları (gerçek süreç)

	private Map<String, Object> withHook(Map<String, Object> component, String command, String script, int timeoutSec) {
		component.put("hooks", map("preStart", List.of(map("name", "migrate", "command", command,
			"args", List.of("-c", script), "env", map("DB_PASSWORD", ENV_SECRET), "timeoutSec", timeoutSec))));
		return component;
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void preStartHookRunsAfterSwitchBeforeStartInLiveDirWithMaskedOutput() throws Exception {
		seedLive();
		Path marker = base.resolve("backend/hook-ran.txt");
		List<String> observed = new CopyOnWriteArrayList<>();
		runtime.onStop = () -> observed.add("stop:" + Files.exists(marker));
		runtime.onStart = () -> observed.add("start:" + Files.exists(marker));
		start(config(3));
		Map<String, Object> backend = withHook(backend("2.0.0"), "sh",
			"echo migrating; echo value=$DB_PASSWORD; cat server.js > hook-ran.txt", 30);
		JsonObject result = deployAndWait("dep_hook", "2.0.0", backend);

		assertTrue(result.get("success").getAsBoolean(), result.toString());
		assertEquals("backend 2.0.0", read(marker), "hook canli (yeni) dizinde calisir");
		assertEquals(List.of("stop:false", "start:true"), observed, "hook swap'tan sonra, start'tan once");
		List<JsonObject> hookEvents = sink.events("dep_hook").stream()
			.filter(e -> e.get("stage").getAsString().equals("pre_start")).collect(Collectors.toList());
		assertEquals(List.of("started", "done"), hookEvents.stream().map(e -> e.get("status").getAsString()).collect(Collectors.toList()));
		for (JsonObject event : hookEvents) {
			assertEquals("migrate", event.get("message").getAsString(), "pre_start mesaji yalnizca hook adi");
		}
		assertFalse(sink.allJson().contains("migrating"), "hook ciktisi event'e girmez");
		String logs = log.all();
		assertTrue(logs.contains("hook 'migrate' | migrating"), logs);
		assertTrue(logs.contains("hook 'migrate' | value=" + Redactor.MASK), "env degeri logda maskelenir: " + logs);
		assertNoSecretsLeaked();
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void failingHookRollsBack() throws Exception {
		seedLive();
		start(config(3));
		JsonObject result = deployAndWait("dep_hookfail", "2.0.0", withHook(backend("2.0.0"), "sh",
			"echo boom $DB_PASSWORD; exit 3", 30));
		assertFalse(result.get("success").getAsBoolean());
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertTrue(error(result).contains("cikis kodu 3"), error(result));
		assertTrue(error(result).contains("son cikti: boom " + Redactor.MASK), "cikti kuyrugu maskeli: " + error(result));
		JsonObject failed = sink.events("dep_hookfail").stream()
			.filter(e -> e.get("stage").getAsString().equals("pre_start") && e.get("status").getAsString().equals("failed"))
			.findFirst().orElseThrow();
		assertEquals("migrate", failed.get("message").getAsString());
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
		assertEquals(List.of("stop:jetsrm-backend", "stop:jetsrm-backend", "start:jetsrm-backend"), runtime.calls);
		assertNoSecretsLeaked();
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void hookTimeoutKillsAndRollsBack() throws Exception {
		seedLive();
		start(config(3));
		long started = System.nanoTime();
		JsonObject result = deployAndWait("dep_hooktimeout", "2.0.0", withHook(backend("2.0.0"), "sh", "sleep 30", 1));
		assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 20);
		assertFalse(result.get("success").getAsBoolean());
		assertTrue(error(result).contains("1 sn icinde bitmedi"), error(result));
		assertTrue(result.get("rolledBack").getAsBoolean());
		assertEquals("backend 1.0.0", read(base.resolve("backend/server.js")));
	}

	@Test
	void notAllowlistedHookIsRejectedBeforeDownload() throws Exception {
		seedLive();
		start(config(3));
		JsonObject result = deployAndWait("dep_hooknot", "2.0.0", withHook(backend("2.0.0"), "python3", "print(1)", 30));
		assertEquals("hook_not_allowed:migrate", error(result));
		assertEquals(0, server.requests.get());
		assertTrue(runtime.calls.isEmpty());
		assertTrue(sink.events("dep_hooknot").isEmpty());
		assertNoSecretsLeaked();
	}

	@Test
	void unresolvableHookCommandIsRejectedBeforeDownload() throws Exception {
		start(DeployConfig.of(base, 3, EnumSet.allOf(RuntimeType.class), Set.of("no-such-tool-xyz")));
		Map<String, Object> app = app("1.0.0", "none");
		app.put("hooks", map("preStart", List.of(map("name", "seed", "command", "no-such-tool-xyz", "args", null,
			"env", null, "timeoutSec", null))));
		JsonObject result = deployAndWait("dep_hooknf", "1.0.0", app);
		assertEquals("hook_command_not_found:seed", error(result));
		assertEquals(0, server.requests.get());
	}

	@Test
	void resultPayloadHasContractKeys() throws Exception {
		start(config(3));
		JsonObject result = deployAndWait("dep_keys", "1.0.0", app("1.0.0", "none"));
		assertEquals(Set.of("deployId", "success", "version", "rolledBack", "durationMs", "components", "error"), result.keySet());
		JsonArray components = result.getAsJsonArray("components");
		assertEquals(Set.of("name", "success", "rolledBack", "previousVersion", "error"),
			components.get(0).getAsJsonObject().keySet());
		for (JsonObject event : sink.events("dep_keys")) {
			assertEquals(Set.of("deployId", "component", "stage", "status", "progress", "message"), event.keySet());
			assertTrue(Set.of("accepted", "downloading", "verifying", "extracting", "preserving", "configuring", "stopping",
				"switching", "pre_start", "starting", "health_check", "rolling_back", "cleanup")
				.contains(event.get("stage").getAsString()), event.toString());
			assertTrue(Set.of("started", "progress", "done", "failed", "skipped").contains(event.get("status").getAsString()));
		}
		assertTrue(Duration.ofMillis(result.get("durationMs").getAsLong()).toMinutes() < 1);
	}
}
