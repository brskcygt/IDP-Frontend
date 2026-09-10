package com.idp.agent.connection;

import java.util.concurrent.ThreadLocalRandom;
import java.util.function.DoubleSupplier;

/**
 * Yeniden bağlanma için exponential backoff + jitter.
 *
 * <ul>
 *   <li>Nominal gecikme 10 sn'den başlar, her başarısız denemede 2 katına çıkar, 300 sn'de tavanlanır.</li>
 *   <li>Jitter: nominal değerin %0-20'si kadar aşağı kaydırılır (aralık [0.8·nominal, nominal]).
 *       Böylece tavan hiçbir zaman aşılmaz ve gateway yeniden başladığında agent'lar aynı saniyede
 *       saldırmaz.</li>
 *   <li>{@link #reset()} "Handshake onaylandı" sonrası çağrılır.</li>
 *   <li>{@link #authFailureDelayMillis()} kimlik reddinde (401/403/1008/4003) doğrudan tavanı döner
 *       ve sayacı tavana kilitler; sonsuz 10 sn döngüsü oluşmaz.</li>
 * </ul>
 *
 * Thread-safe: WebSocket okuma thread'i ve zamanlayıcı thread'i aynı nesneyi kullanır.
 */
public final class ReconnectBackoff {
	public static final long INITIAL_DELAY_MILLIS = 10_000L;
	public static final long MAX_DELAY_MILLIS = 300_000L;
	public static final double JITTER_RATIO = 0.2;

	private final DoubleSupplier random;
	private int attempt;

	public ReconnectBackoff() {
		this(() -> ThreadLocalRandom.current().nextDouble());
	}

	/** @param random [0,1) aralığında değer üretir; testlerde deterministik verilir. */
	public ReconnectBackoff(DoubleSupplier random) {
		this.random = random;
	}

	/** Nominal (jitter'sız) gecikme: 10s · 2^attempt, tavan 300s. */
	static long nominalDelayMillis(int attempt) {
		long delay = INITIAL_DELAY_MILLIS;
		for (int i = 0; i < attempt && delay < MAX_DELAY_MILLIS; i++) {
			delay *= 2;
		}
		return Math.min(delay, MAX_DELAY_MILLIS);
	}

	/** Bir sonraki ağ hatası sonrası beklenecek süre; sayacı ilerletir. */
	public synchronized long nextDelayMillis() {
		long nominal = nominalDelayMillis(attempt);
		if (nominalDelayMillis(attempt) < MAX_DELAY_MILLIS) {
			attempt++;
		}
		double r = Math.min(Math.max(random.getAsDouble(), 0.0), 1.0);
		long jitter = (long) (nominal * JITTER_RATIO * r);
		return nominal - jitter;
	}

	/** Kimlik reddinde beklenecek süre: doğrudan tavan; sonraki denemeler de tavandan devam eder. */
	public synchronized long authFailureDelayMillis() {
		while (nominalDelayMillis(attempt) < MAX_DELAY_MILLIS) {
			attempt++;
		}
		return MAX_DELAY_MILLIS;
	}

	/** Başarılı handshake sonrası baştan başla. */
	public synchronized void reset() {
		attempt = 0;
	}
}
