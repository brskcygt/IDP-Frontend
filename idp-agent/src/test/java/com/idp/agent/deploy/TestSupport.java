package com.idp.agent.deploy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.idp.agent.deploy.DeployPayloads.HealthSpec;
import com.idp.agent.deploy.DeployPayloads.RuntimeSpec;
import com.idp.agent.enums.OperatingSystem;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** Artifact deploy testleri için ortak yardımcılar (tar fixture'ları, yerel HTTP sunucusu, sahteler). */
final class TestSupport {
	static final Gson GSON = new GsonBuilder().serializeNulls().create();
	static final Duration TIMEOUT = Duration.ofSeconds(30);

	private TestSupport() {}

	// ------------------------------------------------------------------ tar.gz fixture'ları

	interface TarWriter {
		void write(TarArchiveOutputStream tar) throws IOException;
	}

	static byte[] tarGz(TarWriter writer) throws IOException {
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (GzipCompressorOutputStream gzip = new GzipCompressorOutputStream(bytes);
				TarArchiveOutputStream tar = new TarArchiveOutputStream(gzip)) {
			tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
			writer.write(tar);
			tar.finish();
		}
		return bytes.toByteArray();
	}

	static void file(TarArchiveOutputStream tar, String name, String content) throws IOException {
		file(tar, name, content, 0644);
	}

	static void file(TarArchiveOutputStream tar, String name, String content, int mode) throws IOException {
		byte[] data = content.getBytes(StandardCharsets.UTF_8);
		TarArchiveEntry entry = new TarArchiveEntry(name, true);
		entry.setSize(data.length);
		entry.setMode(mode);
		tar.putArchiveEntry(entry);
		tar.write(data);
		tar.closeArchiveEntry();
	}

	static void dir(TarArchiveOutputStream tar, String name) throws IOException {
		TarArchiveEntry entry = new TarArchiveEntry(name.endsWith("/") ? name : name + "/", true);
		tar.putArchiveEntry(entry);
		tar.closeArchiveEntry();
	}

	static void special(TarArchiveOutputStream tar, String name, byte linkFlag, String linkName) throws IOException {
		TarArchiveEntry entry = new TarArchiveEntry(name, linkFlag, true);
		if (linkName != null) {
			entry.setLinkName(linkName);
		}
		tar.putArchiveEntry(entry);
		tar.closeArchiveEntry();
	}

	static String sha256(byte[] data) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
		} catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	static String read(Path file) throws IOException {
		return Files.readString(file, StandardCharsets.UTF_8);
	}

	static void write(Path file, String content) throws IOException {
		Files.createDirectories(file.getParent());
		Files.writeString(file, content, StandardCharsets.UTF_8);
	}

	static List<String> list(Path dir) throws IOException {
		if (!Files.isDirectory(dir)) {
			return List.of();
		}
		try (Stream<Path> entries = Files.list(dir)) {
			return entries.map(p -> p.getFileName().toString()).sorted().collect(Collectors.toList());
		}
	}

	/** LinkedHashMap (null değer serbest). */
	static Map<String, Object> map(Object... keyValues) {
		Map<String, Object> result = new LinkedHashMap<>();
		for (int i = 0; i < keyValues.length; i += 2) {
			result.put((String) keyValues[i], keyValues[i + 1]);
		}
		return result;
	}

	/** Gerçek WS yolundaki gibi: JSON'a çevirip Object (LinkedTreeMap, Double sayılar) olarak geri okur. */
	static Object wire(Map<String, Object> payload) {
		return GSON.fromJson(GSON.toJson(payload), Object.class);
	}

	// ------------------------------------------------------------------ yerel artifact sunucusu

	static final class Route {
		final byte[] data;
		final String token;
		volatile int status = 200;
		/** Backend gibi: null değilse X-IDP-Agent-Id bu değer olmalı, yoksa 401. */
		volatile String requiredAgent;
		final AtomicInteger failuresLeft = new AtomicInteger();
		volatile CountDownLatch gate;
		volatile boolean stall;
		final CountDownLatch stalled = new CountDownLatch(1);
		final CountDownLatch release = new CountDownLatch(1);

		Route(byte[] data, String token) {
			this.data = data;
			this.token = token;
		}
	}

	static final class ArtifactServer implements AutoCloseable {
		private final HttpServer server;
		private final ExecutorService executor = Executors.newCachedThreadPool();
		final Map<String, Route> routes = new ConcurrentHashMap<>();
		final List<String> authHeaders = new CopyOnWriteArrayList<>();
		final List<String> agentHeaders = new CopyOnWriteArrayList<>();
		final AtomicInteger requests = new AtomicInteger();

		ArtifactServer() throws IOException {
			server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
			server.setExecutor(executor);
			server.createContext("/a/", this::handle);
			server.start();
		}

		Route add(String id, byte[] data, String token) {
			Route route = new Route(data, token);
			routes.put(id, route);
			return route;
		}

		URI url(String id) {
			return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/a/" + id);
		}

		private void handle(HttpExchange exchange) throws IOException {
			requests.incrementAndGet();
			String id = exchange.getRequestURI().getPath().substring("/a/".length());
			String auth = exchange.getRequestHeaders().getFirst("Authorization");
			authHeaders.add(auth == null ? "" : auth);
			String agent = exchange.getRequestHeaders().getFirst(ArtifactDownloader.AGENT_ID_HEADER);
			agentHeaders.add(agent == null ? "" : agent);
			Route route = routes.get(id);
			try {
				if (route == null || !("Bearer " + route.token).equals(auth)
						|| (route.requiredAgent != null && !route.requiredAgent.equals(agent))) {
					exchange.sendResponseHeaders(401, -1);
					return;
				}
				if (route.failuresLeft.getAndDecrement() > 0) {
					exchange.sendResponseHeaders(503, -1);
					return;
				}
				if (route.status != 200) {
					if (route.status == 302) {
						exchange.getResponseHeaders().add("Location", "http://127.0.0.1:9/elsewhere");
					}
					exchange.sendResponseHeaders(route.status, -1);
					return;
				}
				CountDownLatch gate = route.gate;
				if (gate != null) {
					gate.await(20, TimeUnit.SECONDS);
				}
				exchange.getResponseHeaders().add("Content-Type", "application/gzip");
				exchange.sendResponseHeaders(200, route.data.length);
				try (OutputStream out = exchange.getResponseBody()) {
					if (route.stall) {
						int first = Math.min(16, route.data.length);
						out.write(route.data, 0, first);
						out.flush();
						route.stalled.countDown();
						route.release.await(20, TimeUnit.SECONDS);
						out.write(route.data, first, route.data.length - first);
					} else {
						out.write(route.data);
					}
				}
			} catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
			} catch (IOException ignored) {
				// İstemci bağlantıyı kesti (iptal testleri).
			} finally {
				exchange.close();
			}
		}

		@Override
		public void close() {
			for (Route route : routes.values()) {
				route.release.countDown();
				CountDownLatch gate = route.gate;
				if (gate != null) {
					gate.countDown();
				}
			}
			server.stop(0);
			executor.shutdownNow();
		}
	}

	// ------------------------------------------------------------------ sahteler

	static final class FakeRuntime implements RuntimeController {
		final List<String> calls = new CopyOnWriteArrayList<>();
		volatile Runnable onStop;
		volatile Runnable onStart;

		static String key(RuntimeSpec spec) {
			if (spec.serviceName() != null) {
				return spec.serviceName();
			}
			return spec.appPool() != null ? "pool:" + spec.appPool() : spec.type().wire();
		}

		@Override
		public void validate(RuntimeSpec spec) {
		}

		@Override
		public void stop(RuntimeSpec spec) {
			calls.add("stop:" + key(spec));
			Runnable hook = onStop;
			if (hook != null) {
				hook.run();
			}
		}

		@Override
		public void start(RuntimeSpec spec) {
			calls.add("start:" + key(spec));
			Runnable hook = onStart;
			if (hook != null) {
				hook.run();
			}
		}
	}

	static final class FakeHealth implements HealthChecker {
		final Map<String, AtomicInteger> failures = new ConcurrentHashMap<>();
		final List<String> checks = new CopyOnWriteArrayList<>();
		final AtomicBoolean blockNext = new AtomicBoolean();
		final CountDownLatch entered = new CountDownLatch(1);

		@Override
		public void check(HealthSpec health, String expectedVersion, CancelToken cancel) throws DeployException {
			checks.add(health.url() + "|" + expectedVersion);
			entered.countDown();
			if (blockNext.compareAndSet(true, false)) {
				cancel.sleep(Duration.ofSeconds(20));
			}
			AtomicInteger remaining = failures.get(health.url().toString());
			if (remaining != null && remaining.getAndDecrement() > 0) {
				throw new DeployException("health basarisiz (sahte): " + health.url());
			}
		}
	}

	static final class CapturingSink implements DeployReporter.Sink {
		record Sent(String process, String json) {}

		final List<Sent> sent = new ArrayList<>();

		@Override
		public synchronized void send(String process, Map<String, Object> payload) {
			sent.add(new Sent(process, GSON.toJson(payload)));
			notifyAll();
		}

		synchronized List<Sent> snapshot() {
			return new ArrayList<>(sent);
		}

		synchronized JsonObject await(String process, Predicate<JsonObject> match, Duration timeout) throws InterruptedException {
			long deadline = System.nanoTime() + timeout.toNanos();
			while (true) {
				for (Sent message : sent) {
					if (message.process().equals(process)) {
						JsonObject json = JsonParser.parseString(message.json()).getAsJsonObject();
						if (match.test(json)) {
							return json;
						}
					}
				}
				long remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
				if (remaining <= 0) {
					throw new AssertionError(process + " beklenirken zaman asimi; gonderilenler: " + sent);
				}
				wait(remaining);
			}
		}

		JsonObject awaitResult(String deployId) throws InterruptedException {
			return await(DeployReporter.RESULT, json -> json.has("deployId") && !json.get("deployId").isJsonNull()
				&& deployId.equals(json.get("deployId").getAsString()), TIMEOUT);
		}

		List<JsonObject> events(String deployId) {
			List<JsonObject> events = new ArrayList<>();
			for (Sent message : snapshot()) {
				if (message.process().equals(DeployReporter.EVENT)) {
					JsonObject json = JsonParser.parseString(message.json()).getAsJsonObject();
					if (deployId.equals(json.get("deployId").getAsString())) {
						events.add(json);
					}
				}
			}
			return events;
		}

		long resultCount(String deployId) {
			return snapshot().stream()
				.filter(m -> m.process().equals(DeployReporter.RESULT))
				.map(m -> JsonParser.parseString(m.json()).getAsJsonObject())
				.filter(json -> !json.get("deployId").isJsonNull() && deployId.equals(json.get("deployId").getAsString()))
				.count();
		}

		/** deployId'ye ait son mesajın süreci. */
		String lastProcess(String deployId) {
			String last = null;
			for (Sent message : snapshot()) {
				JsonObject json = JsonParser.parseString(message.json()).getAsJsonObject();
				if (json.has("deployId") && !json.get("deployId").isJsonNull() && deployId.equals(json.get("deployId").getAsString())) {
					last = message.process();
				}
			}
			return last;
		}

		String allJson() {
			return snapshot().stream().map(Sent::json).collect(Collectors.joining("\n"));
		}
	}

	static final class CapturingLog implements DeployLog {
		final List<String> lines = new CopyOnWriteArrayList<>();

		@Override
		public void info(String message) {
			lines.add("INFO " + message);
		}

		@Override
		public void warn(String message) {
			lines.add("WARN " + message);
		}

		@Override
		public void error(String message) {
			lines.add("ERROR " + message);
		}

		String all() {
			return String.join("\n", lines);
		}
	}

	static ArtifactDeployManager manager(DeployConfig config, CapturingSink sink, CapturingLog log,
			RuntimeController runtime, HealthChecker health) {
		ArtifactDeployManager.Deps deps = new ArtifactDeployManager.Deps();
		deps.config = () -> config;
		deps.sink = sink;
		deps.log = log;
		deps.runtime = runtime;
		deps.health = health;
		deps.downloader = new ArtifactDownloader(ArtifactDownloader.defaultClient(null, 0), 3,
			Duration.ofMillis(20), Duration.ofSeconds(10), "TEMSA-WIN-01");
		deps.swapper = new DirectorySwapper(Duration.ofMillis(300), Duration.ofMillis(10), Duration.ofMillis(50));
		SystemProcessRunner runner = new SystemProcessRunner();
		deps.processRunner = runner;
		deps.commandResolver = new CommandResolver(OperatingSystem.detect(), () -> System.getenv("PATH"));
		deps.progressIntervalMillis = 0;
		deps.caseInsensitivePaths = false;
		return new ArtifactDeployManager(deps);
	}
}
