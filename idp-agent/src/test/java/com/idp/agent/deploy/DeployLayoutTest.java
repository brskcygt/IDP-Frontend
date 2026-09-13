package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

class DeployLayoutTest {
	@TempDir
	Path tmp;

	private DeployConfig config(Path base) {
		return DeployConfig.of(base, 3, EnumSet.allOf(RuntimeType.class), Set.of());
	}

	@Test
	void createsReleasesSkeletonUnderRealBase() throws Exception {
		Path base = Files.createDirectories(tmp.resolve("jetsrm"));
		DeployLayout layout = DeployLayout.open(config(base));
		assertEquals(base.toRealPath(), layout.base());
		assertTrue(Files.isDirectory(layout.releases()));
		assertTrue(Files.isDirectory(layout.downloads()));
		assertTrue(Files.isDirectory(layout.prev()));
		assertEquals(layout.base().resolve("backend"), layout.liveDir("backend"));
		assertEquals(layout.releases().resolve("2.5.0").resolve("backend"), layout.stagingDir("2.5.0", "backend"));
		assertEquals(layout.downloads().resolve("dep_1-backend.tar.gz"), layout.downloadFile("dep_1", "backend"));
		assertEquals(layout.prev().resolve("backend-2.4.0-x"), layout.prevEntry("backend-2.4.0-x"));
	}

	@Test
	void missingBaseIsNotConfigured() {
		DeployException ex = assertThrows(DeployException.class, () -> DeployLayout.open(config(tmp.resolve("yok"))));
		assertTrue(ex.getMessage().startsWith("not_configured"), ex.getMessage());
		DeployException notSet = assertThrows(DeployException.class, () -> DeployLayout.open(DeployConfig.notConfigured(null)));
		assertEquals("not_configured", notSet.getMessage());
	}

	@Test
	void rejectsTraversalInNames() throws Exception {
		Path base = Files.createDirectories(tmp.resolve("jetsrm"));
		DeployLayout layout = DeployLayout.open(config(base));
		assertThrows(DeployException.class, () -> layout.liveDir(".."));
		assertThrows(DeployException.class, () -> layout.liveDir("a/../../x"));
		assertThrows(DeployException.class, () -> layout.prevEntry("../state.json"));
		assertThrows(DeployException.class, () -> layout.prevEntry("x\\..\\y"));
		assertThrows(DeployException.class, () -> layout.stagingDir("..", "backend"));
	}

	@Test
	void liveFileInsteadOfDirectoryIsRejected() throws Exception {
		Path base = Files.createDirectories(tmp.resolve("jetsrm"));
		Files.writeString(base.resolve("backend"), "not a dir");
		DeployLayout layout = DeployLayout.open(config(base));
		DeployException ex = assertThrows(DeployException.class, () -> layout.liveDir("backend"));
		assertTrue(ex.getMessage().startsWith("unsafe_path"), ex.getMessage());
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void symlinkEscapesAreRejected() throws Exception {
		Path base = Files.createDirectories(tmp.resolve("jetsrm"));
		Path outside = Files.createDirectories(tmp.resolve("outside"));
		Files.createSymbolicLink(base.resolve("backend"), outside);
		DeployLayout layout = DeployLayout.open(config(base));
		DeployException ex = assertThrows(DeployException.class, () -> layout.liveDir("backend"));
		assertTrue(ex.getMessage().startsWith("unsafe_path"), ex.getMessage());

		Path other = Files.createDirectories(tmp.resolve("other"));
		Files.createSymbolicLink(other.resolve(".releases"), outside);
		DeployException releases = assertThrows(DeployException.class, () -> DeployLayout.open(config(other)));
		assertTrue(releases.getMessage().startsWith("unsafe_path"), releases.getMessage());
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void symlinkedBaseIsResolvedToItsRealPath() throws Exception {
		Path real = Files.createDirectories(tmp.resolve("real-base"));
		Path link = Files.createSymbolicLink(tmp.resolve("link-base"), real);
		DeployLayout layout = DeployLayout.open(config(link));
		assertEquals(real.toRealPath(), layout.base());
		assertTrue(Files.isDirectory(real.resolve(".releases")));
	}
}
