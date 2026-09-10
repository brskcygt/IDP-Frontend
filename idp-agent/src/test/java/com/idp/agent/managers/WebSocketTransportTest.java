package com.idp.agent.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.yaml.snakeyaml.Yaml;

import com.idp.agent.connection.AgentConnectionConfig;
import com.idp.agent.connection.GatewayRejection;

/**
 * Yerel (127.0.0.1) sahte sunucu/proxy ile Java-WebSocket 1.5.4'ün gerçek davranışını doğrular:
 * upgrade'in 401 ile reddi onClose(1002, "...401...") olarak gelir ve onError çağrılmaz; header'lar
 * upgrade isteğinde gider; proxy yapılandırıldığında CONNECT satırında hedef host adı (yerelde
 * çözülmemiş) bulunur.
 */
@Timeout(20)
class WebSocketTransportTest {
	private static final String SECRET = "test-agent-secret";

	private static AgentConnectionConfig config(String url, String proxy) {
		String yaml = "server:\n  url: \"" + url + "\"\n  agent-secret: \"" + SECRET + "\"\n"
			+ "  cf-access-client-id: \"cf-id.access\"\n  cf-access-client-secret: \"cf-secret\"\n"
			+ (proxy == null ? "" : "  proxy: \"" + proxy + "\"\n")
			+ "agent:\n  id: musteri-01\n";
		Map<?, ?> root = new Yaml().load(yaml);
		return AgentConnectionConfig.fromYaml(root);
	}

	/** İstek başlığını (boş satıra kadar) okur. */
	private static List<String> readHead(BufferedReader in) throws IOException {
		List<String> lines = new ArrayList<>();
		String line;
		while ((line = in.readLine()) != null && !line.isEmpty()) {
			lines.add(line);
		}
		return lines;
	}

	private static void reply401(OutputStream out) throws IOException {
		out.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
			.getBytes(StandardCharsets.US_ASCII));
		out.flush();
	}

	private static final class RecordingClient extends WebSocketClient {
		final CountDownLatch closed = new CountDownLatch(1);
		final AtomicInteger closeCode = new AtomicInteger();
		final AtomicReference<String> closeReason = new AtomicReference<>();
		final AtomicInteger errors = new AtomicInteger();

		RecordingClient(AgentConnectionConfig cfg) throws Exception {
			super(new URI(cfg.getServerUrl()), new HashMap<>(cfg.upgradeHeaders()));
		}

		@Override public void onOpen(ServerHandshake handshakedata) {}
		@Override public void onMessage(String message) {}
		@Override public void onClose(int code, String reason, boolean remote) {
			closeCode.set(code);
			closeReason.set(reason);
			closed.countDown();
		}
		@Override public void onError(Exception ex) { errors.incrementAndGet(); }
	}

	@Test
	void upgradeRejectedWith401SurfacesAsOnClose1002AndCarriesHeaders() throws Exception {
		try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
			CompletableFuture<List<String>> request = CompletableFuture.supplyAsync(() -> {
				try (Socket s = server.accept()) {
					BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
					List<String> head = readHead(in);
					reply401(s.getOutputStream());
					return head;
				} catch (IOException e) {
					throw new RuntimeException(e);
				}
			});

			AgentConnectionConfig cfg = config("ws://127.0.0.1:" + server.getLocalPort() + "/", null);
			RecordingClient client = new RecordingClient(cfg);
			WebSocketManager.applyProxy(client, cfg);

			assertFalse(client.connectBlocking(10, TimeUnit.SECONDS));
			assertTrue(client.closed.await(10, TimeUnit.SECONDS));

			assertEquals(1002, client.closeCode.get());
			assertTrue(client.closeReason.get().contains("Invalid status code received: 401"), client.closeReason.get());
			assertEquals(0, client.errors.get(), "401 onError olarak gelmemeli");
			assertEquals(GatewayRejection.UNAUTHORIZED_401,
				GatewayRejection.classify(client.closeCode.get(), client.closeReason.get()));

			List<String> head = request.get(10, TimeUnit.SECONDS);
			assertTrue(head.contains("Authorization: Bearer " + SECRET), head.toString());
			assertTrue(head.contains("X-IDP-Agent-Id: musteri-01"), head.toString());
			assertTrue(head.contains("CF-Access-Client-Id: cf-id.access"), head.toString());
			assertTrue(head.contains("CF-Access-Client-Secret: cf-secret"), head.toString());
		}
	}

	@Test
	void proxyTunnelsToUnresolvedHostName() throws Exception {
		try (ServerSocket proxy = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
			CompletableFuture<List<String>> seen = CompletableFuture.supplyAsync(() -> {
				try (Socket s = proxy.accept()) {
					BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
					List<String> connect = readHead(in);
					OutputStream out = s.getOutputStream();
					out.write("HTTP/1.1 200 Connection established\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
					out.flush();
					List<String> upgrade = readHead(in);
					reply401(out);
					List<String> all = new ArrayList<>(connect);
					all.add("--");
					all.addAll(upgrade);
					return all;
				} catch (IOException e) {
					throw new RuntimeException(e);
				}
			});

			// .invalid TLD hiçbir zaman çözülmez (RFC 6761): bağlantı ancak proxy adı çözerse kurulabilir.
			AgentConnectionConfig cfg = config("ws://idp-agent-test.invalid:8443/", "127.0.0.1:" + proxy.getLocalPort());
			RecordingClient client = new RecordingClient(cfg);
			WebSocketManager.applyProxy(client, cfg);

			client.connectBlocking(10, TimeUnit.SECONDS);
			assertTrue(client.closed.await(10, TimeUnit.SECONDS));

			List<String> lines = seen.get(10, TimeUnit.SECONDS);
			assertNotNull(lines);
			assertEquals("CONNECT idp-agent-test.invalid:8443 HTTP/1.1", lines.get(0));
			assertTrue(lines.contains("Authorization: Bearer " + SECRET), lines.toString());
			assertEquals(GatewayRejection.UNAUTHORIZED_401,
				GatewayRejection.classify(client.closeCode.get(), client.closeReason.get()));
		}
	}
}
