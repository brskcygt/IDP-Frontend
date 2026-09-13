package com.idp.agent.deploy;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.OptionalLong;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import com.idp.agent.deploy.DeployPayloads.DownloadSpec;

/**
 * Artifact'ı IDP backend'inden indirir ({@code GET <url>}, {@code Authorization: Bearer <token>}).
 * Yalnızca HTTP 200 kabul edilir (yönlendirme izlenmez: token başka bir hosta gitmez); boyut
 * Content-Length ve akış sonunda denetlenir; hatada dosya silinir. Ağ hataları ve 5xx/408/429 için
 * toplam {@code attempts} deneme yapılır, diğer 4xx'ler hemen başarısız olur (token kullanımı boşa
 * harcanmaz). İptal süren isteği ve akışı keser. Token hiçbir mesajda yer almaz.
 */
final class ArtifactDownloader {

	interface Listener {
		void onProgress(long bytes, long total);

		void onRetry(int attempt, String reason);
	}

	private static final class RetryableException extends DeployException {
		private static final long serialVersionUID = 1L;

		RetryableException(String message) {
			super(message);
		}
	}

	static final String AGENT_ID_HEADER = "X-IDP-Agent-Id";

	private final HttpClient client;
	private final int attempts;
	private final Duration retryDelay;
	private final Duration headerTimeout;
	private final String agentId;

	/**
	 * @param agentId null değilse {@code X-IDP-Agent-Id} olarak gönderilir; backend token'ın bu agent'a
	 *                verildiğini ayrıca doğrular (çalınan token başka agent kimliğiyle kullanılamaz).
	 */
	ArtifactDownloader(HttpClient client, int attempts, Duration retryDelay, Duration headerTimeout, String agentId) {
		this.client = client;
		this.attempts = Math.max(1, attempts);
		this.retryDelay = retryDelay;
		this.headerTimeout = headerTimeout;
		this.agentId = agentId;
	}

	/** Varsayılan istemci: HTTP/1.1, yönlendirme yok, varsa server.proxy üzerinden. */
	static HttpClient defaultClient(String proxyHost, int proxyPort) {
		HttpClient.Builder builder = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(30))
			.followRedirects(HttpClient.Redirect.NEVER);
		if (proxyHost != null) {
			builder.proxy(ProxySelector.of(InetSocketAddress.createUnresolved(proxyHost, proxyPort)));
		}
		return builder.build();
	}

	void download(DownloadSpec spec, Path target, CancelToken cancel, Listener listener) throws DeployException {
		String lastReason = null;
		for (int attempt = 1; attempt <= attempts; attempt++) {
			cancel.throwIfCancelled();
			try {
				downloadOnce(spec, target, cancel, listener);
				return;
			} catch (RetryableException ex) {
				deleteQuietly(target);
				lastReason = ex.getMessage();
				if (attempt < attempts) {
					listener.onRetry(attempt, lastReason);
					cancel.sleep(retryDelay);
				}
			} catch (DeployException ex) {
				deleteQuietly(target);
				throw ex;
			} catch (RuntimeException ex) {
				deleteQuietly(target);
				throw new DeployException("indirme hatasi: " + SafeNames.describe(ex));
			}
		}
		throw new DeployException("indirme basarisiz (" + attempts + " deneme): " + lastReason);
	}

	private void downloadOnce(DownloadSpec spec, Path target, CancelToken cancel, Listener listener)
			throws DeployException {
		HttpRequest.Builder builder = HttpRequest.newBuilder(spec.url())
			.timeout(headerTimeout)
			.header("Authorization", "Bearer " + spec.token())
			.header("Accept", "application/gzip, application/octet-stream");
		if (agentId != null) {
			builder.header(AGENT_ID_HEADER, agentId);
		}
		HttpRequest request = builder.GET().build();

		CompletableFuture<HttpResponse<InputStream>> future =
			client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream());
		HttpResponse<InputStream> response;
		try (CancelToken.Registration ignored = cancel.onCancel(() -> future.cancel(true))) {
			response = future.get();
		} catch (CancellationException ex) {
			throw new CancelledException(cancel.reason() != null ? cancel.reason() : CancelToken.Reason.CANCELLED);
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new CancelledException(CancelToken.Reason.CANCELLED);
		} catch (ExecutionException ex) {
			cancel.throwIfCancelled();
			throw new RetryableException("baglanti hatasi: " + SafeNames.describe(ex.getCause()));
		}

		InputStream body = response.body();
		int status = response.statusCode();
		if (status != 200) {
			closeQuietly(body);
			String reason = "HTTP " + status;
			if (status >= 500 || status == 408 || status == 429) {
				throw new RetryableException(reason);
			}
			if (status == 401 || status == 403) {
				// Tekrar denenmez: token iptal edilmiş/süresi dolmuş ya da bu agent'a ait değil.
				throw new DeployException("indirme reddedildi: " + reason
					+ " (indirme token'i gecersiz, suresi dolmus ya da bu agent'a (X-IDP-Agent-Id) ait degil)");
			}
			throw new DeployException("indirme reddedildi: " + reason);
		}
		OptionalLong contentLength = response.headers().firstValueAsLong("Content-Length");
		if (contentLength.isPresent() && contentLength.getAsLong() != spec.size()) {
			closeQuietly(body);
			throw new DeployException("indirme boyutu uyusmuyor: Content-Length " + contentLength.getAsLong()
				+ ", beklenen " + spec.size());
		}

		long total = 0;
		try (CancelToken.Registration ignored = cancel.onCancel(() -> closeQuietly(body));
				InputStream in = body;
				OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE,
					StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
			byte[] buffer = new byte[64 * 1024];
			int read;
			while ((read = in.read(buffer)) != -1) {
				cancel.throwIfCancelled();
				total += read;
				if (total > spec.size()) {
					throw new DeployException("indirme beklenen boyutu asti (" + spec.size() + " bayt)");
				}
				out.write(buffer, 0, read);
				listener.onProgress(total, spec.size());
			}
		} catch (IOException ex) {
			cancel.throwIfCancelled();
			throw new RetryableException("indirme kesildi: " + SafeNames.describe(ex));
		}
		cancel.throwIfCancelled();
		if (total != spec.size()) {
			throw new RetryableException("eksik indirme: " + total + "/" + spec.size() + " bayt");
		}
	}

	private static void closeQuietly(InputStream stream) {
		try {
			if (stream != null) {
				stream.close();
			}
		} catch (IOException ignored) {
			// Kapatma hatası indirme sonucunu değiştirmez.
		}
	}

	static void deleteQuietly(Path file) {
		try {
			Files.deleteIfExists(file);
		} catch (IOException ignored) {
			// Temizlik adımı tekrar dener.
		}
	}
}
