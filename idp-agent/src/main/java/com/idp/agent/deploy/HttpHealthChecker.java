package com.idp.agent.deploy;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import com.google.gson.JsonElement;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.idp.agent.deploy.DeployPayloads.HealthSpec;

/**
 * HTTP GET ile sağlık yoklaması. Proxy kullanılmaz (hedef genelde 127.0.0.1), yönlendirme izlenir,
 * gövdeden en fazla 64 KB okunur. {@code expectVersionPath} nokta ile ayrılmış JSON alan yoludur
 * (ör. {@code version} ya da {@code data.build.version}).
 */
public final class HttpHealthChecker implements HealthChecker {
	private static final int MAX_BODY = 64 * 1024;

	private final HttpClient client;
	private final Duration pollInterval;
	private final Duration requestTimeout;

	HttpHealthChecker(HttpClient client, Duration pollInterval, Duration requestTimeout) {
		this.client = client;
		this.pollInterval = pollInterval;
		this.requestTimeout = requestTimeout;
	}

	public static HttpHealthChecker create() {
		return new HttpHealthChecker(defaultClient(), Duration.ofSeconds(2), Duration.ofSeconds(10));
	}

	static HttpClient defaultClient() {
		return HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(5))
			.followRedirects(HttpClient.Redirect.NORMAL)
			.proxy(HttpClient.Builder.NO_PROXY)
			.build();
	}

	@Override
	public void check(HealthSpec health, String expectedVersion, CancelToken cancel) throws DeployException {
		long deadline = System.nanoTime() + Duration.ofSeconds(health.timeoutSec()).toNanos();
		String last = "yanit yok";
		while (true) {
			cancel.throwIfCancelled();
			long remainingMillis = Duration.ofNanos(deadline - System.nanoTime()).toMillis();
			Duration timeout = Duration.ofMillis(Math.max(500, Math.min(requestTimeout.toMillis(), remainingMillis)));
			try {
				HttpRequest request = HttpRequest.newBuilder(health.url())
					.timeout(timeout)
					.header("Accept", "application/json")
					.GET()
					.build();
				HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
				String body;
				try (InputStream in = response.body()) {
					body = new String(in.readNBytes(MAX_BODY), StandardCharsets.UTF_8);
				}
				if (response.statusCode() == 200) {
					if (health.expectVersionPath() == null || expectedVersion == null) {
						return;
					}
					String actual = extractValue(body, health.expectVersionPath());
					if (expectedVersion.equals(actual)) {
						return;
					}
					last = "surum " + (actual == null ? "bulunamadi" : "'" + SafeNames.printable(actual, 64) + "'")
						+ ", beklenen '" + expectedVersion + "'";
				} else {
					last = "HTTP " + response.statusCode();
				}
			} catch (IOException ex) {
				last = SafeNames.describe(ex);
			} catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
				throw new CancelledException(CancelToken.Reason.CANCELLED);
			}
			long remaining = deadline - System.nanoTime();
			if (remaining <= 0) {
				break;
			}
			cancel.sleep(Duration.ofNanos(Math.min(pollInterval.toNanos(), remaining)));
		}
		throw new DeployException("health check " + health.timeoutSec() + " sn icinde basarili olmadi: " + last);
	}

	/** JSON gövdede nokta yolundaki ilkel değer; yoksa ya da gövde JSON değilse null. */
	static String extractValue(String body, String dotPath) {
		try {
			JsonElement element = JsonParser.parseString(body);
			for (String segment : dotPath.split("\\.")) {
				if (element == null || !element.isJsonObject()) {
					return null;
				}
				element = element.getAsJsonObject().get(segment);
			}
			return element != null && element.isJsonPrimitive() ? element.getAsString() : null;
		} catch (JsonParseException | IllegalStateException ex) {
			return null;
		}
	}
}
