package com.idp.agent.deploy;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Tek bir deploy'un gizli değerlerini (indirme token'ları, runtimeConfig ve hook env değerleri)
 * event/log metinlerinden maskeler. Kod bu değerleri zaten mesaja koymaz; bu, hook sürecinin kendi
 * çıktısında yankılaması gibi durumlara karşı ikinci savunmadır. 4 karakterden kısa değerler
 * maskelenmez (anlamlı sır olamaz, mesajı bozar).
 */
final class Redactor {
	static final String MASK = "***";
	private final List<String> secrets = new CopyOnWriteArrayList<>();

	void add(String value) {
		if (value != null && value.length() >= 4 && !secrets.contains(value)) {
			secrets.add(value);
			secrets.sort(Comparator.comparingInt(String::length).reversed());
		}
	}

	String apply(String text) {
		if (text == null || text.isEmpty()) {
			return text;
		}
		String out = text;
		for (String secret : secrets) {
			out = out.replace(secret, MASK);
		}
		return out;
	}
}
