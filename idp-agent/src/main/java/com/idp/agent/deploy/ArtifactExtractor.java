package com.idp.agent.deploy;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

/**
 * .tar.gz'yi taze bir staging dizinine güvenli açar. Reddedilenler: mutlak yollar, sürücü harfi,
 * '..' segmenti, ':' (NTFS ADS), Windows'ta geçersiz adlar, sembolik/sabit bağlantılar, aygıt ve FIFO
 * girdileri. Toplam açılan bayt ve girdi sayısı sınırlıdır (gzip bombası). Sembolik bağlantı hiç
 * oluşturulmadığı için hedef dizin içinde kaçış yolu kalmaz.
 */
final class ArtifactExtractor {
	static final long DEFAULT_MAX_BYTES = 4L * 1024 * 1024 * 1024;
	static final int DEFAULT_MAX_ENTRIES = 200_000;

	record Stats(int files, int directories, long bytes) {}

	private final long maxBytes;
	private final int maxEntries;

	ArtifactExtractor(long maxBytes, int maxEntries) {
		this.maxBytes = maxBytes;
		this.maxEntries = maxEntries;
	}

	Stats extract(Path archive, Path destination, CancelToken cancel) throws DeployException {
		if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
			throw new DeployException("staging dizini zaten var: " + destination);
		}
		Path root;
		boolean posix;
		try {
			Files.createDirectories(destination);
			root = destination.toRealPath();
			posix = Files.getFileStore(root).supportsFileAttributeView(PosixFileAttributeView.class);
		} catch (IOException ex) {
			throw new DeployException("staging dizini olusturulamadi: " + SafeNames.describe(ex));
		}

		int entries = 0;
		int files = 0;
		int directories = 0;
		long bytes = 0;
		byte[] buffer = new byte[64 * 1024];
		try (InputStream raw = Files.newInputStream(archive);
				InputStream gzip = new GzipCompressorInputStream(new BufferedInputStream(raw), true);
				TarArchiveInputStream tar = new TarArchiveInputStream(gzip)) {
			TarArchiveEntry entry;
			while ((entry = tar.getNextEntry()) != null) {
				cancel.throwIfCancelled();
				if (++entries > maxEntries) {
					throw new DeployException("arsiv cok fazla girdi iceriyor (> " + maxEntries + ")");
				}
				String name = entry.getName();
				if (entry.isSymbolicLink() || entry.isLink()) {
					throw new DeployException("arsivde baglanti (symlink/hardlink) reddedildi: " + SafeNames.printable(name, 200));
				}
				if (entry.isCharacterDevice() || entry.isBlockDevice() || entry.isFIFO()) {
					throw new DeployException("arsivde aygit/FIFO girdisi reddedildi: " + SafeNames.printable(name, 200));
				}
				String relative = safeEntryPath(name);
				if (relative.isEmpty()) {
					if (entry.isDirectory()) {
						continue;
					}
					throw new DeployException("arsivde gecersiz girdi adi: " + SafeNames.printable(name, 200));
				}
				Path target = root.resolve(relative).normalize();
				if (!target.startsWith(root) || target.equals(root)) {
					throw new DeployException("arsiv girdisi hedef dizin disina cikiyor: " + SafeNames.printable(name, 200));
				}
				if (entry.isDirectory()) {
					Files.createDirectories(target);
					directories++;
					continue;
				}
				if (!entry.isFile()) {
					throw new DeployException("desteklenmeyen tar girdi turu: " + SafeNames.printable(name, 200));
				}
				Files.createDirectories(target.getParent());
				if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
					throw new DeployException("arsivde dosya/dizin cakismasi: " + SafeNames.printable(name, 200));
				}
				try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE,
						StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
					int read;
					while ((read = tar.read(buffer)) != -1) {
						bytes += read;
						if (bytes > maxBytes) {
							throw new DeployException("acilan toplam boyut siniri asildi (" + maxBytes + " bayt)");
						}
						out.write(buffer, 0, read);
					}
				}
				if (posix && (entry.getMode() & 0111) != 0) {
					Files.setPosixFilePermissions(target, PosixFilePermissions.fromString("rwxr-xr-x"));
				}
				files++;
			}
		} catch (IOException | RuntimeException ex) {
			throw new DeployException("arsiv acilamadi: " + SafeNames.describe(ex));
		}
		return new Stats(files, directories, bytes);
	}

	/**
	 * Tar girdi adını göreli, '/' ayraçlı güvenli bir yola çevirir ("./" ve boş segmentler atılır).
	 * Kök girdisi ("./") için boş metin döner.
	 */
	static String safeEntryPath(String rawName) throws DeployException {
		if (rawName == null) {
			throw new DeployException("arsivde adsiz girdi");
		}
		String name = rawName.replace('\\', '/');
		if (name.startsWith("/")) {
			throw new DeployException("arsivde mutlak yol reddedildi: " + SafeNames.printable(rawName, 200));
		}
		if (name.length() >= 2 && Character.isLetter(name.charAt(0)) && name.charAt(1) == ':') {
			throw new DeployException("arsivde surucu harfli yol reddedildi: " + SafeNames.printable(rawName, 200));
		}
		List<String> parts = new ArrayList<>();
		for (String segment : name.split("/")) {
			if (segment.isEmpty() || segment.equals(".")) {
				continue;
			}
			if (segment.equals("..")) {
				throw new DeployException("arsivde '..' iceren yol reddedildi: " + SafeNames.printable(rawName, 200));
			}
			if (!SafeNames.isSafeSegment(segment)) {
				throw new DeployException("arsivde gecersiz dosya adi reddedildi: " + SafeNames.printable(rawName, 200));
			}
			parts.add(segment);
		}
		return String.join("/", parts);
	}
}
