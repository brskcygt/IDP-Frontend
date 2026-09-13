package com.idp.agent.deploy;

import static com.idp.agent.deploy.TestSupport.dir;
import static com.idp.agent.deploy.TestSupport.file;
import static com.idp.agent.deploy.TestSupport.special;
import static com.idp.agent.deploy.TestSupport.tarGz;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.commons.compress.archivers.tar.TarConstants;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

class ArtifactExtractorTest {
	@TempDir
	Path tmp;

	private final ArtifactExtractor extractor = new ArtifactExtractor(1024 * 1024, 1000);

	private Path archive(TestSupport.TarWriter writer) throws Exception {
		Path file = tmp.resolve("a-" + System.nanoTime() + ".tar.gz");
		Files.write(file, tarGz(writer));
		return file;
	}

	private Path dest() {
		return tmp.resolve("work").resolve("staging");
	}

	private void assertRejected(TestSupport.TarWriter writer, String fragment) throws Exception {
		Path archive = archive(writer);
		// Her durum için taze staging (başarısız açma yarım dizini bırakır; manager temizliği siler).
		Path dest = tmp.resolve("work").resolve("staging-" + System.nanoTime());
		DeployException ex = assertThrows(DeployException.class, () -> extractor.extract(archive, dest, CancelToken.none()));
		assertTrue(ex.getMessage().contains(fragment), ex.getMessage());
		assertFalse(Files.exists(tmp.resolve("work").resolve("evil.txt")), "hedef disina yazilmamali");
		assertFalse(Files.exists(tmp.resolve("evil.txt")), "hedef disina yazilmamali");
		TestSupport.list(dest).forEach(name -> assertFalse(name.contains("evil"), name));
	}

	@Test
	void extractsFilesDirectoriesAndDotSlashPrefix() throws Exception {
		Path archive = archive(tar -> {
			dir(tar, "./");
			file(tar, "./index.html", "<html/>");
			dir(tar, "./assets");
			file(tar, "./assets/app.js", "console.log(1)");
			file(tar, "lib/deep/x.txt", "x");
			file(tar, "bin/run.sh", "#!/bin/sh", 0755);
		});
		ArtifactExtractor.Stats stats = extractor.extract(archive, dest(), CancelToken.none());
		assertEquals(4, stats.files());
		assertEquals("<html/>", Files.readString(dest().resolve("index.html")));
		assertEquals("console.log(1)", Files.readString(dest().resolve("assets/app.js")));
		assertEquals("x", Files.readString(dest().resolve("lib/deep/x.txt")));
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void keepsExecutableBit() throws Exception {
		Path archive = archive(tar -> file(tar, "bin/run.sh", "#!/bin/sh", 0755));
		extractor.extract(archive, dest(), CancelToken.none());
		assertTrue(Files.isExecutable(dest().resolve("bin/run.sh")));
	}

	@Test
	void rejectsTraversal() throws Exception {
		assertRejected(tar -> file(tar, "../evil.txt", "x"), "..");
		assertRejected(tar -> file(tar, "ok/../../evil.txt", "x"), "..");
		assertRejected(tar -> file(tar, "..\\evil.txt", "x"), "..");
	}

	@Test
	void rejectsAbsoluteAndDriveLetterPaths() throws Exception {
		assertRejected(tar -> file(tar, "/tmp/evil.txt", "x"), "mutlak");
		assertRejected(tar -> file(tar, "C:/evil.txt", "x"), "surucu");
		assertRejected(tar -> file(tar, "c:evil.txt", "x"), "surucu");
		assertRejected(tar -> file(tar, "web.config:evil", "x"), "gecersiz dosya adi");
		assertRejected(tar -> file(tar, "CON", "x"), "gecersiz dosya adi");
	}

	@Test
	void rejectsLinksAndDevices() throws Exception {
		assertRejected(tar -> special(tar, "link", TarConstants.LF_SYMLINK, "/etc/passwd"), "baglanti");
		assertRejected(tar -> special(tar, "hard", TarConstants.LF_LINK, "../evil.txt"), "baglanti");
		assertRejected(tar -> special(tar, "dev", TarConstants.LF_CHR, null), "aygit");
		assertRejected(tar -> special(tar, "fifo", TarConstants.LF_FIFO, null), "aygit");
	}

	@Test
	void enforcesEntryAndByteLimits() throws Exception {
		ArtifactExtractor small = new ArtifactExtractor(10, 3);
		Path big = archive(tar -> file(tar, "big.bin", "0123456789ABCDEF"));
		DeployException bytes = assertThrows(DeployException.class, () -> small.extract(big, dest(), CancelToken.none()));
		assertTrue(bytes.getMessage().contains("boyut"), bytes.getMessage());

		Path many = archive(tar -> {
			for (int i = 0; i < 5; i++) {
				file(tar, "f" + i, "x");
			}
		});
		Path other = tmp.resolve("other");
		DeployException entries = assertThrows(DeployException.class, () -> small.extract(many, other, CancelToken.none()));
		assertTrue(entries.getMessage().contains("girdi"), entries.getMessage());
	}

	@Test
	void destinationMustBeFresh() throws Exception {
		Files.createDirectories(dest());
		Path archive = archive(tar -> file(tar, "a.txt", "x"));
		assertThrows(DeployException.class, () -> extractor.extract(archive, dest(), CancelToken.none()));
	}

	@Test
	void notGzipIsRejected() throws Exception {
		Path archive = tmp.resolve("broken.tar.gz");
		Files.writeString(archive, "this is not gzip");
		DeployException ex = assertThrows(DeployException.class, () -> extractor.extract(archive, dest(), CancelToken.none()));
		assertTrue(ex.getMessage().startsWith("arsiv acilamadi"), ex.getMessage());
	}

	@Test
	void safeEntryPathNormalizes() throws Exception {
		assertEquals("a/b.txt", ArtifactExtractor.safeEntryPath("./a//b.txt"));
		assertEquals("a/b", ArtifactExtractor.safeEntryPath("a\\b"));
		assertEquals("", ArtifactExtractor.safeEntryPath("./"));
	}
}
