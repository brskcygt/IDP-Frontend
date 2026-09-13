package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;

import com.idp.agent.deploy.DeployPayloads.DownloadSpec;

@Timeout(30)
class ArtifactDownloaderTest {
	private static final String TOKEN = "download-token-SECRET";
	private static final byte[] DATA = "artifact-bytes-0123456789-abcdefghijklmnopqrstuvwxyz".getBytes(StandardCharsets.UTF_8);

	@TempDir
	Path tmp;

	private TestSupport.ArtifactServer server;
	private final List<String> retries = new CopyOnWriteArrayList<>();
	private final ArtifactDownloader downloader = new ArtifactDownloader(ArtifactDownloader.defaultClient(null, 0), 3,
		Duration.ofMillis(10), Duration.ofSeconds(5), "TEMSA-WIN-01");

	private final ArtifactDownloader.Listener listener = new ArtifactDownloader.Listener() {
		@Override
		public void onProgress(long bytes, long total) {
		}

		@Override
		public void onRetry(int attempt, String reason) {
			retries.add(attempt + ":" + reason);
		}
	};

	@BeforeEach
	void setUp() throws Exception {
		server = new TestSupport.ArtifactServer();
	}

	@AfterEach
	void tearDown() {
		server.close();
	}

	private DownloadSpec spec(String id, long size) {
		return new DownloadSpec(server.url(id), TOKEN, TestSupport.sha256(DATA), size);
	}

	@Test
	void downloadsWithBearerToken() throws Exception {
		server.add("ok", DATA, TOKEN);
		Path target = tmp.resolve("ok.tar.gz");
		downloader.download(spec("ok", DATA.length), target, CancelToken.none(), listener);
		assertArrayEquals(DATA, Files.readAllBytes(target));
		assertEquals(List.of("Bearer " + TOKEN), server.authHeaders);
		assertEquals(List.of("TEMSA-WIN-01"), server.agentHeaders, "token agent'a baglidir");
		assertTrue(retries.isEmpty());
	}

	@Test
	void non200IsFailureWithoutRetryAndNoFile() throws Exception {
		server.add("missing", DATA, TOKEN).status = 404;
		Path target = tmp.resolve("missing.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> downloader.download(spec("missing", DATA.length), target, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("HTTP 404"), ex.getMessage());
		assertFalse(ex.getMessage().contains(TOKEN));
		assertFalse(Files.exists(target));
		assertEquals(1, server.requests.get());
	}

	@Test
	void redirectIsNotFollowed() throws Exception {
		server.add("moved", DATA, TOKEN).status = 302;
		Path target = tmp.resolve("moved.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> downloader.download(spec("moved", DATA.length), target, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("HTTP 302"), ex.getMessage());
		assertEquals(1, server.requests.get());
		assertFalse(Files.exists(target));
	}

	@Test
	void wrongTokenIs401AndNotRetried() throws Exception {
		server.add("secured", DATA, "other-token");
		Path target = tmp.resolve("secured.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> downloader.download(spec("secured", DATA.length), target, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("HTTP 401"), ex.getMessage());
		assertTrue(ex.getMessage().contains("token"), ex.getMessage());
		assertEquals(1, server.requests.get(), "401 tekrar denenmez");
		assertTrue(retries.isEmpty());
		assertFalse(Files.exists(target));

		server.add("forbidden", DATA, TOKEN).status = 403;
		assertThrows(DeployException.class,
			() -> downloader.download(spec("forbidden", DATA.length), tmp.resolve("f.tar.gz"), CancelToken.none(), listener));
		assertEquals(2, server.requests.get(), "403 tekrar denenmez");
	}

	@Test
	void agentIdHeaderIsSentAndBoundToToken() throws Exception {
		TestSupport.Route route = server.add("bound", DATA, TOKEN);
		route.requiredAgent = "TEMSA-WIN-01";
		downloader.download(spec("bound", DATA.length), tmp.resolve("bound.tar.gz"), CancelToken.none(), listener);
		assertEquals(List.of("TEMSA-WIN-01"), server.agentHeaders);
		assertEquals(List.of("Bearer " + TOKEN), server.authHeaders);

		ArtifactDownloader otherAgent = new ArtifactDownloader(ArtifactDownloader.defaultClient(null, 0), 3,
			Duration.ofMillis(10), Duration.ofSeconds(5), "OTHER-AGENT-02");
		Path target = tmp.resolve("stolen.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> otherAgent.download(spec("bound", DATA.length), target, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("HTTP 401"), ex.getMessage());
		assertEquals(2, server.requests.get(), "baska agent kimligiyle tek istek, tekrar yok");
		assertFalse(Files.exists(target));
	}

	@Test
	void retriesServerErrorsUpToThreeAttempts() throws Exception {
		server.add("flaky", DATA, TOKEN).failuresLeft.set(2);
		Path target = tmp.resolve("flaky.tar.gz");
		downloader.download(spec("flaky", DATA.length), target, CancelToken.none(), listener);
		assertArrayEquals(DATA, Files.readAllBytes(target));
		assertEquals(3, server.requests.get());
		assertEquals(2, retries.size());

		server.add("down", DATA, TOKEN).failuresLeft.set(10);
		Path downTarget = tmp.resolve("down.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> downloader.download(spec("down", DATA.length), downTarget, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("3 deneme"), ex.getMessage());
		assertEquals(6, server.requests.get());
		assertFalse(Files.exists(downTarget));
	}

	@Test
	void sizeMismatchIsRejected() throws Exception {
		server.add("sized", DATA, TOKEN);
		Path target = tmp.resolve("sized.tar.gz");
		DeployException ex = assertThrows(DeployException.class,
			() -> downloader.download(spec("sized", DATA.length + 1), target, CancelToken.none(), listener));
		assertTrue(ex.getMessage().contains("Content-Length"), ex.getMessage());
		assertFalse(Files.exists(target));
		assertEquals(1, server.requests.get());
	}

	@Test
	void cancelAbortsInFlightDownload() throws Exception {
		TestSupport.Route route = server.add("slow", DATA, TOKEN);
		route.stall = true;
		Path target = tmp.resolve("slow.tar.gz");
		CancelToken cancel = new CancelToken();
		Thread canceller = new Thread(() -> {
			try {
				if (route.stalled.await(10, TimeUnit.SECONDS)) {
					Thread.sleep(200);
					cancel.cancel(CancelToken.Reason.CANCELLED);
				}
			} catch (InterruptedException ignored) {
				Thread.currentThread().interrupt();
			}
		});
		canceller.start();
		long started = System.nanoTime();
		CancelledException ex = assertThrows(CancelledException.class,
			() -> downloader.download(spec("slow", DATA.length), target, cancel, listener));
		assertEquals("cancelled", ex.getMessage());
		assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 10, "iptal indirmeyi hemen kesmeli");
		assertFalse(Files.exists(target));
		route.release.countDown();
		canceller.join();
	}
}
