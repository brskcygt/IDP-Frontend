package com.idp.agent.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class ReconnectBackoffTest {

	@Test
	void withoutJitterDoublesFromTenSecondsUpToCap() {
		ReconnectBackoff backoff = new ReconnectBackoff(() -> 0.0);
		List<Long> delays = new ArrayList<>();
		for (int i = 0; i < 9; i++) {
			delays.add(backoff.nextDelayMillis());
		}

		assertEquals(List.of(10_000L, 20_000L, 40_000L, 80_000L, 160_000L, 300_000L, 300_000L, 300_000L, 300_000L), delays);
	}

	@Test
	void jitterStaysWithinTwentyPercentBelowNominalAndNeverExceedsCap() {
		ReconnectBackoff maxJitter = new ReconnectBackoff(() -> 0.999999);
		assertTrue(maxJitter.nextDelayMillis() >= 8_000L);

		ReconnectBackoff random = new ReconnectBackoff();
		for (int i = 0; i < 200; i++) {
			long delay = random.nextDelayMillis();
			assertTrue(delay >= 8_000L, "alt sinir: " + delay);
			assertTrue(delay <= ReconnectBackoff.MAX_DELAY_MILLIS, "ust sinir: " + delay);
		}
		// Uzun süre sonra hep tavan bandında: [240 sn, 300 sn]
		long late = random.nextDelayMillis();
		assertTrue(late >= 240_000L && late <= 300_000L, "tavan bandi: " + late);
	}

	@Test
	void resetAfterHandshakeStartsAgainFromTenSeconds() {
		ReconnectBackoff backoff = new ReconnectBackoff(() -> 0.0);
		backoff.nextDelayMillis();
		backoff.nextDelayMillis();
		backoff.nextDelayMillis();

		backoff.reset();

		assertEquals(10_000L, backoff.nextDelayMillis());
		assertEquals(20_000L, backoff.nextDelayMillis());
	}

	@Test
	void authFailureWaitsCapImmediatelyAndStaysAtCap() {
		ReconnectBackoff backoff = new ReconnectBackoff(() -> 0.0);

		assertEquals(300_000L, backoff.authFailureDelayMillis());
		// Ardından gelen ağ hatası da 10 sn'ye geri düşmez.
		assertEquals(300_000L, backoff.nextDelayMillis());
		assertEquals(300_000L, backoff.authFailureDelayMillis());

		backoff.reset();
		assertEquals(10_000L, backoff.nextDelayMillis());
	}

	@Test
	void nominalDelayIsCappedForLargeAttempts() {
		assertEquals(300_000L, ReconnectBackoff.nominalDelayMillis(Integer.MAX_VALUE));
		assertEquals(10_000L, ReconnectBackoff.nominalDelayMillis(0));
	}
}
