package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.function.Consumer;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;

/** state.json okuma/yazma. Yazma atomiktir (geçici dosya + rename); okuma/yazma tek kilitte. */
final class StateStore {
	private static final Object LOCK = new Object();
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

	private final Path file;

	StateStore(Path file) {
		this.file = file;
	}

	/**
	 * @param quarantineCorrupt bozuk dosya {@code state.json.corrupt-<ts>} olarak kenara alınsın mı
	 *                          (deploy yolunda true; salt okunur status'ta false)
	 * @param warn              bozuk dosya uyarısı için
	 */
	DeployState load(boolean quarantineCorrupt, Consumer<String> warn) throws DeployException {
		synchronized (LOCK) {
			if (!Files.exists(file)) {
				return new DeployState();
			}
			try {
				String text = Files.readString(file, StandardCharsets.UTF_8);
				DeployState state = GSON.fromJson(text, DeployState.class);
				if (state == null) {
					state = new DeployState();
				}
				state.normalize();
				return state;
			} catch (JsonParseException | IllegalStateException | ClassCastException ex) {
				if (!quarantineCorrupt) {
					throw new DeployException("state.json okunamadi (bozuk)");
				}
				Path aside = file.resolveSibling("state.json.corrupt-" + Instant.now().toEpochMilli());
				try {
					Files.move(file, aside);
				} catch (IOException moveError) {
					throw new DeployException("state.json bozuk ve kenara alinamadi: " + SafeNames.describe(moveError));
				}
				warn.accept("state.json bozuktu; " + aside.getFileName() + " olarak kenara alindi, bos durumla devam ediliyor");
				return new DeployState();
			} catch (IOException ex) {
				throw new DeployException("state.json okunamadi: " + SafeNames.describe(ex));
			}
		}
	}

	void save(DeployState state) throws DeployException {
		synchronized (LOCK) {
			Path tmp = file.resolveSibling("state.json.tmp");
			try {
				Files.writeString(tmp, GSON.toJson(state), StandardCharsets.UTF_8);
				try {
					Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
				} catch (AtomicMoveNotSupportedException ex) {
					Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
				}
			} catch (IOException ex) {
				throw new DeployException("state.json yazilamadi: " + SafeNames.describe(ex));
			}
		}
	}
}
