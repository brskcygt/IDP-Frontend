package com.idp.agent.deploy;

import static com.idp.agent.deploy.TestSupport.read;
import static com.idp.agent.deploy.TestSupport.write;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DirectorySwapperTest {
	@TempDir
	Path tmp;

	private final DirectorySwapper swapper = new DirectorySwapper(Duration.ofMillis(200), Duration.ofMillis(10), Duration.ofMillis(50));

	@Test
	void switchAndRevert() throws Exception {
		Path live = tmp.resolve("backend");
		Path incoming = tmp.resolve(".releases/2.0.0/backend");
		Path archive = tmp.resolve(".releases/prev/backend-1.0.0-ts");
		write(live.resolve("v.txt"), "1");
		write(incoming.resolve("v.txt"), "2");

		DirectorySwapper.Swap swap = swapper.switchIn(live, incoming, archive);
		assertEquals("2", read(live.resolve("v.txt")));
		assertEquals("1", read(archive.resolve("v.txt")));
		assertFalse(Files.exists(incoming));

		swapper.revert(swap);
		assertEquals("1", read(live.resolve("v.txt")));
		assertEquals("2", read(incoming.resolve("v.txt")));
		assertFalse(Files.exists(archive));
	}

	@Test
	void firstInstallHasNoArchive() throws Exception {
		Path live = tmp.resolve("frontend");
		Path incoming = tmp.resolve("staging");
		write(incoming.resolve("index.html"), "new");
		DirectorySwapper.Swap swap = swapper.switchIn(live, incoming, tmp.resolve("prev/x"));
		assertNull(swap.archived());
		assertEquals("new", read(live.resolve("index.html")));
		swapper.revert(swap);
		assertFalse(Files.exists(live));
		assertTrue(Files.exists(incoming.resolve("index.html")));
	}

	@Test
	void failedSecondRenamePutsOldBack() throws Exception {
		Path live = tmp.resolve("backend");
		write(live.resolve("v.txt"), "1");
		Path archive = tmp.resolve("prev/backend-1");
		DeployException ex = assertThrows(DeployException.class,
			() -> swapper.switchIn(live, tmp.resolve("does-not-exist"), archive));
		assertTrue(ex.getMessage().contains("yeniden adlandirilamadi"), ex.getMessage());
		assertEquals("1", read(live.resolve("v.txt")));
		assertFalse(Files.exists(archive));
	}

	@Test
	void existingTargetIsNeverOverwritten() throws Exception {
		Path a = Files.createDirectories(tmp.resolve("a"));
		Path b = Files.createDirectories(tmp.resolve("b"));
		assertThrows(DeployException.class, () -> swapper.move(a, b));
		assertTrue(Files.isDirectory(a));
	}
}
