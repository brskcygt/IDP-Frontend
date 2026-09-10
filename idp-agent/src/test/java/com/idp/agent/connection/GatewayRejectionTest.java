package com.idp.agent.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class GatewayRejectionTest {

	@Test
	void upgrade401IsUnauthorized() {
		GatewayRejection r = GatewayRejection.classify(1002,
			"Invalid status code received: 401 Status line: HTTP/1.1 401 Unauthorized");

		assertEquals(GatewayRejection.UNAUTHORIZED_401, r);
		assertTrue(r.isAuthFailure());
		assertEquals("Gateway kimligi reddetti (401): agent kimligi gecersiz ya da iptal edilmis. IDP arayuzunden yeniden uretin.",
			r.logMessage());
	}

	@Test
	void upgrade403IsForbidden() {
		assertEquals(GatewayRejection.FORBIDDEN_403,
			GatewayRejection.classify(1002, "Invalid status code received: 403 Status line: HTTP/1.1 403 Forbidden"));
	}

	@Test
	void close4003IsRevoked() {
		GatewayRejection r = GatewayRejection.classify(4003, "Credential revoked");

		assertEquals(GatewayRejection.REVOKED_4003, r);
		assertEquals("Agent kimligi iptal edildi/yenilendi (4003).", r.logMessage());
	}

	@Test
	void close1008IsPolicy() {
		assertEquals(GatewayRejection.POLICY_1008, GatewayRejection.classify(1008, "Handshake required"));
	}

	@Test
	void networkAndOtherClosesAreNotAuthFailures() {
		assertFalse(GatewayRejection.classify(-1, "Connection refused").isAuthFailure());
		assertFalse(GatewayRejection.classify(1006, "").isAuthFailure());
		assertFalse(GatewayRejection.classify(1000, null).isAuthFailure());
		assertFalse(GatewayRejection.classify(4001, "Replaced by a newer connection").isAuthFailure());
		assertFalse(GatewayRejection.classify(1002,
			"Invalid status code received: 502 Status line: HTTP/1.1 502 Bad Gateway").isAuthFailure());
		// 1002 dışı kodda metin eşleşse bile HTTP durumu sayılmaz.
		assertEquals(-1, GatewayRejection.upgradeStatus(1006, "Invalid status code received: 401"));
	}
}
