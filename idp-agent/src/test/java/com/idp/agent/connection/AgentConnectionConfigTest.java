package com.idp.agent.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.yaml.snakeyaml.Yaml;

class AgentConnectionConfigTest {
	private static final String SECRET = "s3cr3t-agent-value-abc";
	private static final String CF_SECRET = "cf-secret-value-xyz";

	private static Map<?, ?> yaml(String text) {
		return new Yaml().load(text);
	}

	private static String base(String serverExtra) {
		return "server:\n  url: wss://agent.example.com\n" + serverExtra
			+ "agent:\n  id: musteri-01\n"
			+ "application:\n  working-directory: C:/app\n";
	}

	private static AgentConnectionConfig parse(String serverExtra) {
		return AgentConnectionConfig.fromYaml(yaml(base(serverExtra)));
	}

	private static InvalidConfigException rejected(String serverExtra) {
		return assertThrows(InvalidConfigException.class, () -> parse(serverExtra));
	}

	@Test
	void legacyTokenOnlyIsRejectedWithRegenerateMessage() {
		InvalidConfigException ex = rejected("  token: \"eski-paylasimli\"\n");

		assertEquals(AgentConnectionConfig.LEGACY_TOKEN_MESSAGE, ex.getMessage());
		assertEquals(2, InvalidConfigException.EXIT_CODE);
		assertFalse(ex.getMessage().contains("eski-paylasimli"));
	}

	@Test
	void legacyTokenWithAgentSecretIsIgnored() {
		AgentConnectionConfig cfg = parse("  token: \"eski\"\n  agent-secret: \"" + SECRET + "\"\n");

		assertTrue(cfg.isLegacyTokenIgnored());
		assertEquals("Bearer " + SECRET, cfg.upgradeHeaders().get("Authorization"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"", "  agent-secret: \"\"\n", "  agent-secret: \"   \"\n"})
	void missingOrBlankAgentSecretIsRejected(String extra) {
		InvalidConfigException ex = rejected(extra);

		assertTrue(ex.getMessage().contains("server.agent-secret"));
	}

	@Test
	void secretWithControlCharactersIsRejected() {
		Map<String, Object> root = Map.of(
			"server", Map.of("url", "wss://agent.example.com", "agent-secret", "abc\r\nX-Evil: 1"),
			"agent", Map.of("id", "musteri-01"));

		InvalidConfigException ex = assertThrows(InvalidConfigException.class, () -> AgentConnectionConfig.fromYaml(root));
		assertFalse(ex.getMessage().contains("X-Evil"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"http://agent.example.com", "https://agent.example.com", "agent.example.com", "wss://", "ftp://x"})
	void urlMustBeWsOrWss(String url) {
		Map<?, ?> root = yaml("server:\n  url: \"" + url + "\"\n  agent-secret: \"" + SECRET + "\"\nagent:\n  id: musteri-01\n");

		assertThrows(InvalidConfigException.class, () -> AgentConnectionConfig.fromYaml(root));
	}

	@ParameterizedTest
	@ValueSource(strings = {"ws://10.0.0.5:7003", "wss://agent.example.com", "WSS://agent.example.com/"})
	void wsAndWssUrlsAreAccepted(String url) {
		Map<?, ?> root = yaml("server:\n  url: \"" + url + "\"\n  agent-secret: \"" + SECRET + "\"\nagent:\n  id: musteri-01\n");

		assertEquals(url, AgentConnectionConfig.fromYaml(root).getServerUrl());
	}

	@Test
	void invalidAgentIdIsRejected() {
		Map<?, ?> root = yaml("server:\n  url: wss://a.example.com\n  agent-secret: x\nagent:\n  id: \"a b\"\n");

		assertThrows(InvalidConfigException.class, () -> AgentConnectionConfig.fromYaml(root));
	}

	@Test
	void cfAccessHalfIdOnlyIsRejected() {
		InvalidConfigException ex = rejected("  agent-secret: \"" + SECRET + "\"\n  cf-access-client-id: \"id.access\"\n");

		assertTrue(ex.getMessage().contains("birlikte"));
	}

	@Test
	void cfAccessHalfSecretOnlyIsRejectedWithoutLeakingSecret() {
		InvalidConfigException ex = rejected("  agent-secret: \"" + SECRET + "\"\n  cf-access-client-secret: \"" + CF_SECRET + "\"\n");

		assertTrue(ex.getMessage().contains("birlikte"));
		assertFalse(ex.getMessage().contains(CF_SECRET));
		assertFalse(ex.getMessage().contains(SECRET));
	}

	@Test
	void headersContainSecretAndAgentIdWithoutCf() {
		Map<String, String> headers = parse("  agent-secret: \"" + SECRET + "\"\n").upgradeHeaders();

		assertEquals(Map.of("Authorization", "Bearer " + SECRET, "X-IDP-Agent-Id", "musteri-01"), headers);
	}

	@Test
	void headersContainCfAccessPairWhenConfigured() {
		Map<String, String> headers = parse("  agent-secret: \"" + SECRET + "\"\n"
			+ "  cf-access-client-id: \"abc.access\"\n  cf-access-client-secret: \"" + CF_SECRET + "\"\n").upgradeHeaders();

		assertEquals(List.of("Authorization", "X-IDP-Agent-Id", "CF-Access-Client-Id", "CF-Access-Client-Secret"),
			List.copyOf(headers.keySet()));
		assertEquals("Bearer " + SECRET, headers.get("Authorization"));
		assertEquals("musteri-01", headers.get("X-IDP-Agent-Id"));
		assertEquals("abc.access", headers.get("CF-Access-Client-Id"));
		assertEquals(CF_SECRET, headers.get("CF-Access-Client-Secret"));
	}

	@Test
	void proxyHostPortIsParsed() {
		AgentConnectionConfig cfg = parse("  agent-secret: \"" + SECRET + "\"\n  proxy: \"proxy.corp.local:8080\"\n");

		assertTrue(cfg.hasProxy());
		assertEquals("proxy.corp.local", cfg.getProxyHost());
		assertEquals(8080, cfg.getProxyPort());
	}

	@Test
	void bracketedIpv6ProxyIsParsed() {
		AgentConnectionConfig cfg = parse("  agent-secret: \"" + SECRET + "\"\n  proxy: \"[fd00::1]:3128\"\n");

		assertEquals("fd00::1", cfg.getProxyHost());
		assertEquals(3128, cfg.getProxyPort());
	}

	@Test
	void noProxyByDefault() {
		assertFalse(parse("  agent-secret: \"" + SECRET + "\"\n").hasProxy());
	}

	@ParameterizedTest
	@ValueSource(strings = {"proxy.local", "http://proxy.local:8080", ":8080", "proxy.local:", "proxy.local:0",
		"proxy.local:65536", "proxy.local:abc", "user:pass@proxy.local:8080"})
	void malformedProxyIsRejected(String proxy) {
		InvalidConfigException ex = rejected("  agent-secret: \"" + SECRET + "\"\n  proxy: \"" + proxy + "\"\n");

		assertTrue(ex.getMessage().contains("server.proxy"));
		assertFalse(ex.getMessage().contains("pass"));
	}

	@Test
	void toStringNeverContainsSecrets() {
		AgentConnectionConfig cfg = parse("  agent-secret: \"" + SECRET + "\"\n"
			+ "  cf-access-client-id: \"abc.access\"\n  cf-access-client-secret: \"" + CF_SECRET + "\"\n");

		assertFalse(cfg.toString().contains(SECRET));
		assertFalse(cfg.toString().contains(CF_SECRET));
	}
}
