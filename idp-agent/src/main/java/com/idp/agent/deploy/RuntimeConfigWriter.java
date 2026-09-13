package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Map;
import java.util.TreeMap;

import com.google.gson.Gson;

/**
 * {@code runtimeConfig} → bileşen kökünde {@code config.js}: {@code window.__ENV__ = <JSON>;}.
 * Gson'un varsayılan HTML-güvenli kaçışı ({@code < > & = '} ve U+2028/U+2029) değerlerin script
 * bağlamından çıkmasını engeller. Anahtarlar sıralı yazılır (tekrarlanabilir çıktı).
 */
final class RuntimeConfigWriter {
	static final String FILE_NAME = "config.js";
	private static final Gson GSON = new Gson();

	private RuntimeConfigWriter() {}

	static String render(Map<String, String> values) {
		return "window.__ENV__ = " + GSON.toJson(new TreeMap<>(values)) + ";\n";
	}

	static void write(Path componentDir, Map<String, String> values) throws DeployException {
		for (String key : values.keySet()) {
			if (!DeployPayloads.CONFIG_KEY.matcher(key).matches()) {
				throw DeployException.invalidPayload("runtimeConfig anahtari gecersiz: " + SafeNames.printable(key, 64));
			}
		}
		Path target = componentDir.resolve(FILE_NAME);
		if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(target)) {
			throw new DeployException(FILE_NAME + " dizin ya da baglanti olarak var; yazilamadi");
		}
		try {
			Files.writeString(target, render(values), StandardCharsets.UTF_8, StandardOpenOption.CREATE,
				StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
		} catch (IOException ex) {
			throw new DeployException(FILE_NAME + " yazilamadi: " + SafeNames.describe(ex));
		}
	}
}
