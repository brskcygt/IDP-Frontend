package com.idp.agent.deploy;

import java.util.regex.Pattern;

/** Dosya sistemi yol parçası (tek segment) doğrulamaları; Windows kısıtlarını her platformda uygular. */
final class SafeNames {
	private static final Pattern WINDOWS_DEVICE =
		Pattern.compile("^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\\..*)?$", Pattern.CASE_INSENSITIVE);

	private SafeNames() {}

	/**
	 * Tek bir yol segmenti güvenli mi: boş/"."/".." değil; ayırıcı, ':' (sürücü harfi, NTFS
	 * alternate data stream), joker ya da kontrol karakteri içermez; nokta/boşlukla bitmez
	 * (Windows sessizce kırpar); Windows aygıt adı (CON, NUL, COM1...) değildir.
	 */
	static boolean isSafeSegment(String segment) {
		if (segment == null || segment.isEmpty() || segment.length() > 255) {
			return false;
		}
		if (segment.equals(".") || segment.equals("..")) {
			return false;
		}
		for (int i = 0; i < segment.length(); i++) {
			char c = segment.charAt(i);
			if (c < 0x20 || c == 0x7f || c == '/' || c == '\\' || c == ':' || c == '*' || c == '?'
				|| c == '"' || c == '<' || c == '>' || c == '|') {
				return false;
			}
		}
		char last = segment.charAt(segment.length() - 1);
		if (last == '.' || last == ' ') {
			return false;
		}
		return !WINDOWS_DEVICE.matcher(segment).matches();
	}

	static boolean containsControl(String value) {
		for (int i = 0; i < value.length(); i++) {
			char c = value.charAt(i);
			if (Character.isISOControl(c) || c == '\u2028' || c == '\u2029') {
				return true;
			}
		}
		return false;
	}

	/** Mesajlarda gösterilecek kısa, kontrol karaktersiz metin. */
	static String printable(String value, int max) {
		if (value == null) {
			return "";
		}
		StringBuilder out = new StringBuilder(Math.min(value.length(), max));
		for (int i = 0; i < value.length() && out.length() < max; i++) {
			char c = value.charAt(i);
			out.append(Character.isISOControl(c) || c == '\u2028' || c == '\u2029' ? ' ' : c);
		}
		if (value.length() > max) {
			out.append("...");
		}
		return out.toString();
	}

	static String describe(Throwable error) {
		if (error == null) {
			return "bilinmeyen hata";
		}
		String message = error.getMessage();
		return message == null || message.isBlank() ? error.getClass().getSimpleName() : printable(message, 300);
	}
}
