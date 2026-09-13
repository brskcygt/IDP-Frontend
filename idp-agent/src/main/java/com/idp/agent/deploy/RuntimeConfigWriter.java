package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.google.gson.Gson;
import com.idp.agent.deploy.DeployPayloads.RuntimeConfigFormat;
import com.idp.agent.deploy.DeployPayloads.RuntimeConfigSpec;

/**
 * Bileşen runtime config dosyalarını sabit adlara, atomik ve geri alınabilir biçimde yazar.
 */
final class RuntimeConfigWriter {
	static final String FILE_NAME = "config.js"; // sözleşme 1.2 uyumluluğu
	private static final int MAX_BACKUP_BYTES = 4 * 1024 * 1024;
	private static final Gson GSON = new Gson();
	record Snapshot(Path target, boolean existed, byte[] contents) {}

	private RuntimeConfigWriter() {}

	static String render(Map<String, String> values) {
		return "window.__ENV__ = " + GSON.toJson(new TreeMap<>(values)) + ";\n";
	}

	/** dotenv uyumlu çıktı; fiziksel yeni satır veya yorum enjeksiyonu üretmez. */
	static String renderEnv(Map<String, String> values) {
		StringBuilder out = new StringBuilder();
		for (Map.Entry<String, String> entry : new TreeMap<>(values).entrySet()) {
			out.append(entry.getKey()).append("=\"");
			for (int i = 0; i < entry.getValue().length(); i++) {
				char c = entry.getValue().charAt(i);
				switch (c) {
					case '\\' -> out.append("\\\\");
					case '"' -> out.append("\\\"");
					case '\n' -> out.append("\\n");
					case '\r' -> out.append("\\r");
					default -> out.append(c);
				}
			}
			out.append("\"\n");
		}
		return out.toString();
	}

	static void write(Path componentDir, Map<String, String> values) throws DeployException {
		write(componentDir, new RuntimeConfigSpec(RuntimeConfigFormat.FRONTEND_CONFIG_JS, values));
	}

	static void write(Path componentDir, RuntimeConfigSpec config) throws DeployException {
		apply(componentDir, config);
	}

	static Snapshot apply(Path componentDir, RuntimeConfigSpec config) throws DeployException {
		validate(config);
		Path target = checkedTarget(componentDir, config.format());
		Snapshot snapshot = snapshot(target);
		String rendered = config.format() == RuntimeConfigFormat.ENV_FILE
			? renderEnv(config.values()) : render(config.values());
		atomicReplace(target, rendered.getBytes(StandardCharsets.UTF_8));
		return snapshot;
	}

	private static void validate(RuntimeConfigSpec config) throws DeployException {
		if (config == null || config.format() == null || config.values() == null) {
			throw DeployException.invalidPayload("runtimeConfig eksik");
		}
		for (Map.Entry<String, String> entry : config.values().entrySet()) {
			boolean valid = config.format() == RuntimeConfigFormat.ENV_FILE
				? DeployPayloads.ENV_KEY.matcher(entry.getKey()).matches()
				: DeployPayloads.CONFIG_KEY.matcher(entry.getKey()).matches();
			if (!valid || entry.getValue() == null || entry.getValue().indexOf('\0') >= 0) {
				throw DeployException.invalidPayload("runtimeConfig anahtari/degeri gecersiz: "
					+ SafeNames.printable(entry.getKey(), 64));
			}
		}
	}

	static void restore(Snapshot snapshot) throws DeployException {
		if (!snapshot.existed()) {
			try {
				Files.deleteIfExists(snapshot.target());
			} catch (IOException ex) {
				throw new DeployException(snapshot.target().getFileName() + " kaldirilamadi: " + SafeNames.describe(ex));
			}
			return;
		}
		atomicReplace(snapshot.target(), snapshot.contents());
	}

	private static Path checkedTarget(Path componentDir, RuntimeConfigFormat format) throws DeployException {
		Path target = componentDir.resolve(format.fileName());
		if (!Files.isDirectory(componentDir, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(componentDir)) {
			throw new DeployException("bilesen dizini yok ya da baglanti");
		}
		if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(target)) {
			throw new DeployException(format.fileName() + " dizin ya da baglanti olarak var; yazilamadi");
		}
		return target;
	}

	private static Snapshot snapshot(Path target) throws DeployException {
		if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
			return new Snapshot(target, false, null);
		}
		try {
			if (Files.size(target) > MAX_BACKUP_BYTES) {
				throw new DeployException(target.getFileName() + " geri alma sinirini asiyor");
			}
			return new Snapshot(target, true, Files.readAllBytes(target));
		} catch (IOException ex) {
			throw new DeployException(target.getFileName() + " okunamadi: " + SafeNames.describe(ex));
		}
	}

	private static void atomicReplace(Path target, byte[] contents) throws DeployException {
		Path temp = target.resolveSibling("." + target.getFileName() + ".idp-" + UUID.randomUUID() + ".tmp");
		boolean envFile = target.getFileName().toString().equals(RuntimeConfigFormat.ENV_FILE.fileName());
		try {
			if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
				// Mevcut POSIX izinleri / Windows ACL'leri mümkün olduğunca korunur.
				Files.copy(target, temp, StandardCopyOption.COPY_ATTRIBUTES);
				if (envFile && Files.getFileAttributeView(temp, PosixFileAttributeView.class) != null) {
					Files.setPosixFilePermissions(temp, PosixFilePermissions.fromString("rw-------"));
				}
				Files.write(temp, contents, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
			} else if (envFile && Files.getFileAttributeView(target.getParent(), PosixFileAttributeView.class) != null) {
				Set<PosixFilePermission> ownerOnly = PosixFilePermissions.fromString("rw-------");
				Files.createFile(temp, PosixFilePermissions.asFileAttribute(ownerOnly));
				Files.write(temp, contents, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
			} else {
				Files.write(temp, contents, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
			}
			Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		} catch (IOException ex) {
			throw new DeployException(target.getFileName() + " atomik yazilamadi: " + SafeNames.describe(ex));
		} finally {
			try {
				Files.deleteIfExists(temp);
			} catch (IOException ignored) {
				// Bir sonraki temizlik/operatör incelemesi için kalabilir; canlı dosya etkilenmez.
			}
		}
	}
}
