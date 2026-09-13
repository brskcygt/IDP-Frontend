package com.idp.agent.deploy;

import static com.idp.agent.deploy.TestSupport.read;
import static com.idp.agent.deploy.TestSupport.write;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

class PreserveCopierTest {
	@TempDir
	Path tmp;

	@Test
	void copiesMatchingFilesAndLiveWins() throws Exception {
		Path live = tmp.resolve("live");
		Path staging = tmp.resolve("staging");
		write(live.resolve(".env"), "LIVE_ENV");
		write(live.resolve("config/app.json"), "{\"live\":true}");
		write(live.resolve("config/sub/x.json"), "x");
		Files.createDirectories(live.resolve("uploads"));
		write(live.resolve("logs/a.log"), "log");
		write(live.resolve("deep/nested/b.log"), "log2");
		write(live.resolve("node_modules/pkg/index.js"), "module");
		write(live.resolve("server.js"), "old code");
		write(live.resolve("web.config"), "<live/>");

		write(staging.resolve(".env"), "ARTIFACT_ENV");
		write(staging.resolve("config/app.json"), "{\"live\":false}");
		write(staging.resolve("server.js"), "new code");

		PreserveCopier copier = new PreserveCopier(List.of(".env", "config/**", "uploads/**", "**/*.log", "web.config"), false);
		PreserveCopier.Result result = copier.copy(live, staging, CancelToken.none());

		assertEquals("LIVE_ENV", read(staging.resolve(".env")));
		assertEquals("{\"live\":true}", read(staging.resolve("config/app.json")));
		assertEquals("x", read(staging.resolve("config/sub/x.json")));
		assertTrue(Files.isDirectory(staging.resolve("uploads")), "bos korunan dizin de olusur");
		assertEquals("log", read(staging.resolve("logs/a.log")));
		assertEquals("log2", read(staging.resolve("deep/nested/b.log")));
		assertEquals("<live/>", read(staging.resolve("web.config")));
		assertEquals("new code", read(staging.resolve("server.js")), "desenle eslesmeyen dosya degismez");
		assertFalse(Files.exists(staging.resolve("node_modules")));
		assertEquals(6, result.files());
		assertEquals(3, result.directories(), "config, config/sub, uploads");
		assertTrue(result.skipped().isEmpty());
	}

	@Test
	void directoryPatternSelectsWholeSubtree() {
		PreserveCopier copier = new PreserveCopier(List.of("uploads", "certificates/**", "*.env"), false);
		assertTrue(copier.selected("uploads"));
		assertTrue(copier.selected("uploads/2026/a.png"));
		assertTrue(copier.selected("certificates"));
		assertTrue(copier.selected("certificates/ca/root.pem"));
		assertTrue(copier.selected("prod.env"));
		assertFalse(copier.selected("config/prod.env"));
		assertFalse(copier.selected("uploads2/a.png"));
	}

	@Test
	void caseInsensitiveOnWindows() {
		assertTrue(new PreserveCopier(List.of("Web.Config"), true).selected("web.config"));
		assertFalse(new PreserveCopier(List.of("Web.Config"), false).selected("web.config"));
	}

	@Test
	void missingLiveIsNoop() throws Exception {
		PreserveCopier.Result result = new PreserveCopier(List.of(".env"), false)
			.copy(tmp.resolve("nope"), tmp.resolve("staging"), CancelToken.none());
		assertEquals(0, result.files());
	}

	@Test
	void fileVersusDirectoryConflictFails() throws Exception {
		Path live = tmp.resolve("live");
		Path staging = tmp.resolve("staging");
		write(live.resolve("settings"), "file in live");
		Files.createDirectories(staging.resolve("settings"));
		DeployException ex = assertThrows(DeployException.class,
			() -> new PreserveCopier(List.of("settings"), false).copy(live, staging, CancelToken.none()));
		assertTrue(ex.getMessage().contains("settings"), ex.getMessage());
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void symlinksAreSkipped() throws Exception {
		Path live = tmp.resolve("live");
		Path staging = Files.createDirectories(tmp.resolve("staging"));
		Path secret = tmp.resolve("outside-secret.txt");
		write(secret, "do not copy");
		Files.createDirectories(live);
		Files.createSymbolicLink(live.resolve(".env"), secret);
		Files.createSymbolicLink(live.resolve("uploads"), tmp);
		PreserveCopier.Result result = new PreserveCopier(List.of(".env", "uploads/**"), false)
			.copy(live, staging, CancelToken.none());
		assertFalse(Files.exists(staging.resolve(".env")));
		assertFalse(Files.exists(staging.resolve("uploads")));
		assertTrue(result.skipped().contains(".env"), result.skipped().toString());
	}
}
