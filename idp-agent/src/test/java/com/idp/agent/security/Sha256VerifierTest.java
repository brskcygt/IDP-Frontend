package com.idp.agent.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.Gson;
import com.idp.agent.dto.Message;

class Sha256VerifierTest {
	// Geçerli biçimde ama "tampered" içeriğiyle eşleşmeyen herhangi bir özet.
	private static final String OTHER_SHA = "cf1b3e3b0a7dfcd1b0e38c8e1a64b1ac0f8d9d5e11e0a0f1f4fcd0d2f1a8e7c3";

	@TempDir
	Path dir;

	private Path file(String content) throws Exception {
		Path p = dir.resolve("pkg.tar.gz");
		Files.writeString(p, content, StandardCharsets.UTF_8);
		return p;
	}

	@Test
	void matchingChecksumKeepsFile() throws Exception {
		Path p = file("idp");
		String actual = Sha256Verifier.sha256Hex(p);

		Sha256Verifier.Result r = Sha256Verifier.verifyFile(p, "backend", actual.toUpperCase(Locale.ROOT));

		assertTrue(r.ok(), r.message());
		assertTrue(Files.exists(p));
	}

	@Test
	void knownDigestIsComputed() throws Exception {
		Path p = file("");
		assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Sha256Verifier.sha256Hex(p));
	}

	@Test
	void mismatchDeletesFileAndRejects() throws Exception {
		Path p = file("tampered");

		Sha256Verifier.Result r = Sha256Verifier.verifyFile(p, "backend", OTHER_SHA);

		assertFalse(r.ok());
		assertTrue(r.message().contains("uyusmuyor"), r.message());
		assertFalse(Files.exists(p));
	}

	@Test
	void missingChecksumRejectsFailClosed() throws Exception {
		Path p = file("idp");

		assertFalse(Sha256Verifier.checkPresent("backend", null).ok());
		Sha256Verifier.Result r = Sha256Verifier.verifyFile(p, "backend", null);

		assertFalse(r.ok());
		assertTrue(r.message().contains("sha256.backend"), r.message());
		assertFalse(Files.exists(p));
	}

	@Test
	void malformedChecksumIsRejected() {
		assertFalse(Sha256Verifier.checkPresent("agent", "abc123").ok());
		assertFalse(Sha256Verifier.checkPresent("agent", "z".repeat(64)).ok());
		assertTrue(Sha256Verifier.checkPresent("agent", "A".repeat(64)).ok());
	}

	@Test
	void expectedChecksumIsReadFromServerMessagePayload() {
		String json = "{\"type\":\"server\",\"agentId\":\"musteri-01\",\"process\":\"update\","
			+ "\"payload\":{\"sha256\":{\"backend\":\"" + "a".repeat(64) + "\",\"frontend\":\"" + "b".repeat(64) + "\"}}}";
		Message msg = new Gson().fromJson(json, Message.class);

		assertEquals("a".repeat(64), Sha256Verifier.expectedChecksum(msg.getPayload(), "backend"));
		assertEquals("b".repeat(64), Sha256Verifier.expectedChecksum(msg.getPayload(), "frontend"));
		assertNull(Sha256Verifier.expectedChecksum(msg.getPayload(), "agent"));
	}

	@Test
	void todaysGatewayPayloadHasNoChecksum() {
		// idp-agent-gateway sendCommand(agentId, 'update') bugün payload olarak '' gönderiyor.
		Message msg = new Gson().fromJson("{\"type\":\"server\",\"process\":\"update\",\"payload\":\"\"}", Message.class);

		assertNull(Sha256Verifier.expectedChecksum(msg.getPayload(), "backend"));
		assertNull(Sha256Verifier.expectedChecksum(null, "backend"));
		assertNull(Sha256Verifier.expectedChecksum(Map.of("sha256", "flat-string"), "backend"));
		assertNull(Sha256Verifier.expectedChecksum(Map.of("sha256", Map.of("backend", "  ")), "backend"));
	}
}
