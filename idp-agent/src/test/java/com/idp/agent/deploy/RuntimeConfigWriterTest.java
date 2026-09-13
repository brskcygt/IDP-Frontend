package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RuntimeConfigWriterTest {
	@TempDir
	Path tmp;

	@Test
	void rendersSortedWindowEnv() {
		Map<String, String> values = new LinkedHashMap<>();
		values.put("VITE_COMPANY_NAME", "temsa");
		values.put("VITE_APP_MAIN_URL", "https://api.customer");
		assertEquals("window.__ENV__ = {\"VITE_APP_MAIN_URL\":\"https://api.customer\",\"VITE_COMPANY_NAME\":\"temsa\"};\n",
			RuntimeConfigWriter.render(values));
	}

	@Test
	void valuesCannotBreakOutOfScript() {
		String rendered = RuntimeConfigWriter.render(Map.of("X", "</script><script>alert('x')</script>\u2028"));
		assertFalse(rendered.contains("</script>"), rendered);
		assertFalse(rendered.contains("\u2028"), rendered);
		assertTrue(rendered.contains("\\u003c/script\\u003e"), rendered);
	}

	@Test
	void writesConfigJsAndRejectsBadKeys() throws Exception {
		RuntimeConfigWriter.write(tmp, Map.of("API_URL", "https://x"));
		assertEquals("window.__ENV__ = {\"API_URL\":\"https://x\"};\n", Files.readString(tmp.resolve("config.js")));
		DeployException ex = assertThrows(DeployException.class, () -> RuntimeConfigWriter.write(tmp, Map.of("api_url", "x")));
		assertTrue(ex.getMessage().startsWith("invalid_payload"), ex.getMessage());
	}

	@Test
	void rendersEnvWithoutLineOrCommentInjection() {
		String rendered = RuntimeConfigWriter.renderEnv(Map.of(
			"DB_PASSWORD", "p#ass\nNEXT=evil",
			"QUOTE", "a\"b\\c"));
		assertEquals("DB_PASSWORD=\"p#ass\\nNEXT=evil\"\nQUOTE=\"a\\\"b\\\\c\"\n", rendered);
		assertFalse(rendered.contains("\nNEXT="), rendered);
	}

	@Test
	void atomicallyAppliesAndRestoresEnvFile() throws Exception {
		Path env = tmp.resolve(".env");
		Files.writeString(env, "OLD=1\n");
		if (Files.getFileAttributeView(tmp, PosixFileAttributeView.class) != null) {
			Files.setPosixFilePermissions(env, PosixFilePermissions.fromString("rw-r--r--"));
		}
		var config = new DeployPayloads.RuntimeConfigSpec(DeployPayloads.RuntimeConfigFormat.ENV_FILE,
			Map.of("NEW", "secret"));
		RuntimeConfigWriter.Snapshot snapshot = RuntimeConfigWriter.apply(tmp, config);
		assertEquals("NEW=\"secret\"\n", Files.readString(env));
		if (Files.getFileAttributeView(tmp, PosixFileAttributeView.class) != null) {
			assertEquals(PosixFilePermissions.fromString("rw-------"), Files.getPosixFilePermissions(env));
		}
		RuntimeConfigWriter.restore(snapshot);
		assertEquals("OLD=1\n", Files.readString(env));
		assertTrue(Files.list(tmp).noneMatch(path -> path.getFileName().toString().endsWith(".tmp")));
	}

	@Test
	void rollbackDeletesConfigThatDidNotExist() throws Exception {
		var config = new DeployPayloads.RuntimeConfigSpec(DeployPayloads.RuntimeConfigFormat.ENV_FILE,
			Map.of("A", "1"));
		RuntimeConfigWriter.Snapshot snapshot = RuntimeConfigWriter.apply(tmp, config);
		RuntimeConfigWriter.restore(snapshot);
		assertFalse(Files.exists(tmp.resolve(".env")));
	}

	@Test
	void aNewEnvFileIsOwnerOnlyOnPosix() throws Exception {
		if (Files.getFileAttributeView(tmp, PosixFileAttributeView.class) == null) {
			return;
		}
		RuntimeConfigWriter.write(tmp, new DeployPayloads.RuntimeConfigSpec(
			DeployPayloads.RuntimeConfigFormat.ENV_FILE, Map.of("TOKEN", "secret")));
		assertEquals(
			PosixFilePermissions.fromString("rw-------"),
			Files.getPosixFilePermissions(tmp.resolve(".env")));
	}
}
