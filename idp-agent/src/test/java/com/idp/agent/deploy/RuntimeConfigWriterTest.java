package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
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
}
