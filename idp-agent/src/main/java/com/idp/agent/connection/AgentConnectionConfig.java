package com.idp.agent.connection;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Gateway bağlantısı için doğrulanmış ayarlar. application.yml içindeki şu alanlardan kurulur:
 *
 * <pre>
 * server:
 *   url: wss://agent.example.com        # ws:// veya wss://
 *   agent-secret: "..."                 # ZORUNLU, agent başına kimlik
 *   cf-access-client-id: "..."          # opsiyonel, secret ile birlikte
 *   cf-access-client-secret: "..."      # opsiyonel, id ile birlikte
 *   proxy: "proxy.local:8080"           # opsiyonel, HTTP CONNECT proxy
 * agent:
 *   id: "musteri-sunucu-01"
 * </pre>
 *
 * Eski paylaşımlı {@code server.token} alanı artık desteklenmez. Sır değerleri bu sınıfın
 * {@link #toString()} çıktısına ve hata mesajlarına hiçbir zaman girmez.
 */
public final class AgentConnectionConfig {

	public static final String LEGACY_TOKEN_MESSAGE =
		"Bu agent eski paylasimli token formatinda; IDP arayuzunden yeniden uretin";

	public static final String HEADER_AUTHORIZATION = "Authorization";
	public static final String HEADER_AGENT_ID = "X-IDP-Agent-Id";
	public static final String HEADER_CF_CLIENT_ID = "CF-Access-Client-Id";
	public static final String HEADER_CF_CLIENT_SECRET = "CF-Access-Client-Secret";

	/** Gateway'in handshake'te uyguladığı biçimle aynı (idp-agent-gateway/src/gateway.js). */
	private static final Pattern AGENT_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$");

	private final String serverUrl;
	private final String agentSecret;
	private final String agentId;
	private final String cfAccessClientId;
	private final String cfAccessClientSecret;
	private final String proxyHost;
	private final int proxyPort;
	private final boolean legacyTokenIgnored;

	private AgentConnectionConfig(String serverUrl, String agentSecret, String agentId,
			String cfAccessClientId, String cfAccessClientSecret, String proxyHost, int proxyPort,
			boolean legacyTokenIgnored) {
		this.serverUrl = serverUrl;
		this.agentSecret = agentSecret;
		this.agentId = agentId;
		this.cfAccessClientId = cfAccessClientId;
		this.cfAccessClientSecret = cfAccessClientSecret;
		this.proxyHost = proxyHost;
		this.proxyPort = proxyPort;
		this.legacyTokenIgnored = legacyTokenIgnored;
	}

	/**
	 * YAML kök haritasından ayarları okur ve doğrular.
	 *
	 * @throws InvalidConfigException ayarlar eksik ya da hatalıysa (mesaj sır içermez)
	 */
	public static AgentConnectionConfig fromYaml(Map<?, ?> root) {
		if (root == null) {
			throw new InvalidConfigException("Yapilandirma dosyasi bos.");
		}

		Map<?, ?> server = section(root, "server");
		Map<?, ?> agent = section(root, "agent");

		String secret = text(server, "agent-secret");
		boolean hasLegacyToken = server.containsKey("token");

		if (secret == null) {
			if (hasLegacyToken) {
				throw new InvalidConfigException(LEGACY_TOKEN_MESSAGE);
			}
			throw new InvalidConfigException("server.agent-secret tanimli degil; IDP arayuzunden agent'i yeniden uretin.");
		}
		if (containsControlChar(secret)) {
			throw new InvalidConfigException("server.agent-secret gecersiz karakter iceriyor.");
		}

		String url = validateUrl(text(server, "url"));
		String agentId = validateAgentId(text(agent, "id"));

		String cfId = text(server, "cf-access-client-id");
		String cfSecret = text(server, "cf-access-client-secret");
		if ((cfId == null) != (cfSecret == null)) {
			throw new InvalidConfigException(
				"server.cf-access-client-id ve server.cf-access-client-secret birlikte verilmeli (yalnizca biri tanimli).");
		}
		if ((cfId != null && containsControlChar(cfId)) || (cfSecret != null && containsControlChar(cfSecret))) {
			throw new InvalidConfigException("Cloudflare Access alanlari gecersiz karakter iceriyor.");
		}

		String proxyHost = null;
		int proxyPort = -1;
		String proxy = text(server, "proxy");
		if (proxy != null) {
			int colon = proxy.lastIndexOf(':');
			if (proxy.contains("://") || proxy.contains("@") || colon <= 0 || colon == proxy.length() - 1) {
				throw new InvalidConfigException("server.proxy \"host:port\" biciminde olmali (ornek: proxy.local:8080; sema ve kullanici bilgisi yazilmaz).");
			}
			proxyHost = proxy.substring(0, colon);
			if (proxyHost.startsWith("[") && proxyHost.endsWith("]")) {
				proxyHost = proxyHost.substring(1, proxyHost.length() - 1);
			}
			if (proxyHost.isBlank() || proxyHost.contains(" ")) {
				throw new InvalidConfigException("server.proxy host kismi gecersiz.");
			}
			try {
				proxyPort = Integer.parseInt(proxy.substring(colon + 1));
			} catch (NumberFormatException ex) {
				throw new InvalidConfigException("server.proxy port kismi sayi olmali (1-65535).");
			}
			if (proxyPort < 1 || proxyPort > 65535) {
				throw new InvalidConfigException("server.proxy port kismi 1-65535 araliginda olmali.");
			}
		}

		return new AgentConnectionConfig(url, secret, agentId, cfId, cfSecret, proxyHost, proxyPort,
			hasLegacyToken);
	}

	/**
	 * WebSocket upgrade isteğine eklenecek header'lar. Sıra sabittir (test ve okunabilirlik için).
	 */
	public Map<String, String> upgradeHeaders() {
		Map<String, String> headers = new LinkedHashMap<>();
		headers.put(HEADER_AUTHORIZATION, "Bearer " + agentSecret);
		headers.put(HEADER_AGENT_ID, agentId);
		if (hasCfAccess()) {
			headers.put(HEADER_CF_CLIENT_ID, cfAccessClientId);
			headers.put(HEADER_CF_CLIENT_SECRET, cfAccessClientSecret);
		}
		return Collections.unmodifiableMap(headers);
	}

	private static Map<?, ?> section(Map<?, ?> root, String name) {
		Object value = root.get(name);
		if (value == null) {
			throw new InvalidConfigException("Yapilandirmada '" + name + "' bolumu yok.");
		}
		if (!(value instanceof Map<?, ?> map)) {
			throw new InvalidConfigException("Yapilandirmada '" + name + "' bolumu gecersiz.");
		}
		return map;
	}

	/** Değer yoksa ya da boşsa null, varsa kırpılmış metin döner. */
	private static String text(Map<?, ?> map, String key) {
		Object value = map.get(key);
		if (value == null) {
			return null;
		}
		String result = value.toString().trim();
		return result.isEmpty() ? null : result;
	}

	private static String validateUrl(String url) {
		if (url == null) {
			throw new InvalidConfigException("server.url tanimli degil.");
		}
		URI uri;
		try {
			uri = new URI(url);
		} catch (URISyntaxException ex) {
			throw new InvalidConfigException("server.url gecerli bir adres degil.");
		}
		String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
		if (!scheme.equals("ws") && !scheme.equals("wss")) {
			throw new InvalidConfigException("server.url ws:// veya wss:// ile baslamali.");
		}
		if (uri.getHost() == null || uri.getHost().isBlank()) {
			throw new InvalidConfigException("server.url bir host icermeli.");
		}
		if (uri.getRawUserInfo() != null) {
			throw new InvalidConfigException("server.url kullanici bilgisi icermemeli.");
		}
		return url;
	}

	private static String validateAgentId(String agentId) {
		if (agentId == null) {
			throw new InvalidConfigException("agent.id tanimli degil.");
		}
		if (!AGENT_ID.matcher(agentId).matches()) {
			throw new InvalidConfigException(
				"agent.id gecersiz: 3-128 karakter; harf, rakam, nokta, alt cizgi ve tire icerebilir.");
		}
		return agentId;
	}

	private static boolean containsControlChar(String value) {
		for (int i = 0; i < value.length(); i++) {
			if (Character.isISOControl(value.charAt(i))) {
				return true;
			}
		}
		return false;
	}

	public String getServerUrl() { return serverUrl; }
	public String getAgentId() { return agentId; }
	public boolean hasCfAccess() { return cfAccessClientId != null; }
	public boolean hasProxy() { return proxyHost != null; }
	public String getProxyHost() { return proxyHost; }
	public int getProxyPort() { return proxyPort; }
	public boolean isSecure() { return serverUrl.regionMatches(true, 0, "wss:", 0, 4); }
	/** Hem agent-secret hem eski token verilmişse true (token yok sayılır). */
	public boolean isLegacyTokenIgnored() { return legacyTokenIgnored; }

	/** Sır değerleri kasıtlı olarak dışarıda bırakılır. */
	@Override
	public String toString() {
		return "AgentConnectionConfig{url=" + serverUrl
			+ ", agentId=" + agentId
			+ ", cfAccess=" + hasCfAccess()
			+ ", proxy=" + (hasProxy() ? proxyHost + ":" + proxyPort : "yok")
			+ "}";
	}
}
