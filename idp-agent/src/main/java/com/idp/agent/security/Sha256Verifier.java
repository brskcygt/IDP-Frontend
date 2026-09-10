package com.idp.agent.security;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Güncelleme paketlerinin SHA-256 doğrulaması. Fail-closed: beklenen özet yoksa ya da biçimi
 * bozuksa güncelleme reddedilir.
 *
 * <p>Beklenen özetler sunucu mesajının payload'unda şu biçimde gelir:
 * <pre>
 * update:        { "sha256": { "backend": "&lt;64 hex&gt;", "frontend": "&lt;64 hex&gt;" } }
 * update_agent:  { "sha256": { "agent": "&lt;64 hex&gt;" } }
 * </pre>
 */
public final class Sha256Verifier {
	public static final String PAYLOAD_FIELD = "sha256";
	public static final String KEY_BACKEND = "backend";
	public static final String KEY_FRONTEND = "frontend";
	public static final String KEY_AGENT = "agent";

	private static final Pattern HEX64 = Pattern.compile("^[0-9a-fA-F]{64}$");

	private Sha256Verifier() {}

	public record Result(boolean ok, String message) {
		static Result accepted(String message) { return new Result(true, message); }
		static Result rejected(String message) { return new Result(false, message); }
	}

	/**
	 * Payload içinden {@code sha256.<key>} değerini okur. Alan yoksa, boşsa veya payload nesne
	 * değilse null döner.
	 */
	public static String expectedChecksum(Object payload, String key) {
		if (!(payload instanceof Map<?, ?> map)) {
			return null;
		}
		Object checksums = map.get(PAYLOAD_FIELD);
		if (!(checksums instanceof Map<?, ?> byKey)) {
			return null;
		}
		Object value = byKey.get(key);
		if (value == null) {
			return null;
		}
		String text = value.toString().trim();
		return text.isEmpty() ? null : text;
	}

	/**
	 * Beklenen özetin güncellemeye başlamadan önce var ve biçimce geçerli olduğunu denetler.
	 * İndirmeye başlamadan fail-closed reddetmek için kullanılır.
	 */
	public static Result checkPresent(String key, String expectedHex) {
		if (expectedHex == null) {
			return Result.rejected("Guncelleme reddedildi: mesajda '" + PAYLOAD_FIELD + "." + key
				+ "' alani yok; SHA-256 dogrulamasi olmadan paket kurulmaz.");
		}
		if (!HEX64.matcher(expectedHex).matches()) {
			return Result.rejected("Guncelleme reddedildi: '" + PAYLOAD_FIELD + "." + key
				+ "' 64 karakterlik hex SHA-256 degil.");
		}
		return Result.accepted("ok");
	}

	/**
	 * İndirilen dosyanın SHA-256'sını beklenen değerle karşılaştırır. Uyuşmazlıkta ya da okuma
	 * hatasında dosya silinir ve sonuç reddedilir.
	 */
	public static Result verifyFile(Path file, String key, String expectedHex) {
		Result present = checkPresent(key, expectedHex);
		if (!present.ok()) {
			deleteQuietly(file);
			return present;
		}
		if (file == null || !Files.isRegularFile(file)) {
			return Result.rejected("Guncelleme reddedildi: '" + key + "' paketi bulunamadi.");
		}

		String actual;
		try {
			actual = sha256Hex(file);
		} catch (IOException ex) {
			deleteQuietly(file);
			return Result.rejected("Guncelleme reddedildi: '" + key + "' paketi okunamadi: " + ex.getMessage());
		}

		boolean match = MessageDigest.isEqual(
			actual.getBytes(StandardCharsets.US_ASCII),
			expectedHex.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII));
		if (!match) {
			deleteQuietly(file);
			return Result.rejected("Guncelleme reddedildi: '" + key + "' paketinin SHA-256 degeri uyusmuyor"
				+ " (beklenen " + expectedHex.toLowerCase(Locale.ROOT) + ", indirilen " + actual + "); dosya silindi.");
		}
		return Result.accepted("'" + key + "' paketi SHA-256 dogrulamasindan gecti.");
	}

	public static String sha256Hex(Path file) throws IOException {
		MessageDigest digest;
		try {
			digest = MessageDigest.getInstance("SHA-256");
		} catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 desteklenmiyor", ex);
		}
		try (InputStream in = Files.newInputStream(file)) {
			byte[] buffer = new byte[64 * 1024];
			int read;
			while ((read = in.read(buffer)) != -1) {
				digest.update(buffer, 0, read);
			}
		}
		return HexFormat.of().formatHex(digest.digest());
	}

	private static void deleteQuietly(Path file) {
		if (file == null) {
			return;
		}
		try {
			Files.deleteIfExists(file);
		} catch (IOException ignored) {
			// Silinemeyen dosya kurulmaz; üst katman güncellemeyi zaten reddediyor.
		}
	}
}
