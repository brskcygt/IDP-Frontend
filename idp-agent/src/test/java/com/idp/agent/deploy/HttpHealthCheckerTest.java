package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Deque;
import java.util.concurrent.ConcurrentLinkedDeque;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import com.idp.agent.deploy.DeployPayloads.HealthSpec;
import com.sun.net.httpserver.HttpServer;

@Timeout(30)
class HttpHealthCheckerTest {
	private record Reply(int status, String body) {}

	private HttpServer server;
	private final Deque<Reply> replies = new ConcurrentLinkedDeque<>();
	private final HttpHealthChecker checker = new HttpHealthChecker(HttpHealthChecker.defaultClient(),
		Duration.ofMillis(50), Duration.ofSeconds(2));

	@BeforeEach
	void setUp() throws Exception {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/health", exchange -> {
			Reply reply = replies.size() > 1 ? replies.poll() : replies.peek();
			byte[] body = (reply == null ? "" : reply.body()).getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(reply == null ? 503 : reply.status(), body.length == 0 ? -1 : body.length);
			if (body.length > 0) {
				try (OutputStream out = exchange.getResponseBody()) {
					out.write(body);
				}
			}
			exchange.close();
		});
		server.start();
	}

	@AfterEach
	void tearDown() {
		server.stop(0);
	}

	private HealthSpec spec(String versionPath, int timeoutSec) {
		return new HealthSpec(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/health"), versionPath, timeoutSec);
	}

	@Test
	void plain200IsHealthyLikeJetsrm() {
		replies.add(new Reply(200, "{\"type\":true,\"message\":\"ok\"}"));
		assertDoesNotThrow(() -> checker.check(spec(null, 5), "2.5.0", CancelToken.none()));
	}

	@Test
	void becomesHealthyAfterFailures() {
		replies.add(new Reply(503, ""));
		replies.add(new Reply(500, ""));
		replies.add(new Reply(200, "{\"data\":{\"version\":\"2.5.0\"}}"));
		assertDoesNotThrow(() -> checker.check(spec("data.version", 5), "2.5.0", CancelToken.none()));
	}

	@Test
	void versionMismatchFailsAfterTimeout() {
		replies.add(new Reply(200, "{\"version\":\"2.4.0\"}"));
		DeployException ex = assertThrows(DeployException.class, () -> checker.check(spec("version", 1), "2.5.0", CancelToken.none()));
		assertTrue(ex.getMessage().contains("beklenen '2.5.0'"), ex.getMessage());
		assertTrue(ex.getMessage().contains("2.4.0"), ex.getMessage());
	}

	@Test
	void persistentErrorFails() {
		replies.add(new Reply(503, ""));
		DeployException ex = assertThrows(DeployException.class, () -> checker.check(spec(null, 1), null, CancelToken.none()));
		assertTrue(ex.getMessage().contains("HTTP 503"), ex.getMessage());
	}

	@Test
	void cancelStopsPolling() {
		replies.add(new Reply(503, ""));
		CancelToken cancel = new CancelToken();
		cancel.cancel(CancelToken.Reason.CANCELLED);
		assertThrows(CancelledException.class, () -> checker.check(spec(null, 30), null, cancel));
	}

	@Test
	void extractsDotPathValues() {
		assertEquals("1.2.3", HttpHealthChecker.extractValue("{\"a\":{\"b\":\"1.2.3\"}}", "a.b"));
		assertEquals("7", HttpHealthChecker.extractValue("{\"v\":7}", "v"));
		assertNull(HttpHealthChecker.extractValue("{\"a\":[1]}", "a.b"));
		assertNull(HttpHealthChecker.extractValue("not json", "a"));
		assertNull(HttpHealthChecker.extractValue("{\"a\":{\"b\":{}}}", "a.b"));
	}
}
