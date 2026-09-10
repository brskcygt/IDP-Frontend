package com.idp.agent.connection;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WebSocket kapanışını gateway kimlik reddi açısından sınıflandırır.
 *
 * <p>Java-WebSocket 1.5.4'te upgrade'in HTTP 101 dışı bir yanıtla reddi {@code onError} değil
 * {@code onClose} olarak gelir: {@code Draft.translateHandshakeHttpClient} (Draft.java:167-169)
 * {@code InvalidHandshakeException("Invalid status code received: 401 Status line: ...")} fırlatır,
 * {@code WebSocketImpl.decodeHandshake} (WebSocketImpl.java:371-373) bunu {@code close(e)} ile
 * PROTOCOL_ERROR (1002) koduna çevirir ve {@code eot()} → {@code closeConnection} üzerinden
 * {@code onClose(1002, "Invalid status code received: 401 ...", false)} çağrılır. Bu yüzden HTTP
 * durum kodu yalnızca kapanış mesajından okunabilir.
 */
public enum GatewayRejection {
	/** Kimlik reddi değil; normal backoff uygulanır. */
	NONE(null),
	/** Upgrade HTTP 401 ile reddedildi: agent-secret geçersiz ya da iptal edilmiş. */
	UNAUTHORIZED_401("Gateway kimligi reddetti (401): agent kimligi gecersiz ya da iptal edilmis. IDP arayuzunden yeniden uretin."),
	/** Upgrade HTTP 403 ile reddedildi: çoğunlukla Cloudflare Access servis token'ı eksik/yanlış. */
	FORBIDDEN_403("Gateway erisimi reddetti (403): Cloudflare Access servis token'i (server.cf-access-client-id/secret) eksik ya da gecersiz olabilir."),
	/** Gateway bağlantıyı 1008 ile kapattı: handshake'teki agent kimliği upgrade kimliğiyle uyuşmuyor. */
	POLICY_1008("Gateway baglantiyi politika ihlaliyle kapatti (1008): handshake'teki agent kimligi gateway'deki kayitla uyusmuyor."),
	/** Gateway kimlik rotasyonu/iptali nedeniyle bağlantıyı 4003 ile kapattı. */
	REVOKED_4003("Agent kimligi iptal edildi/yenilendi (4003).");

	public static final int CLOSE_PROTOCOL_ERROR = 1002;
	public static final int CLOSE_POLICY_VIOLATION = 1008;
	public static final int CLOSE_REVOKED = 4003;

	private static final Pattern STATUS = Pattern.compile("Invalid status code received: (\\d{3})");

	private final String logMessage;

	GatewayRejection(String logMessage) {
		this.logMessage = logMessage;
	}

	/** ERROR seviyesinde basılacak operatör mesajı (NONE için null). */
	public String logMessage() {
		return logMessage;
	}

	public boolean isAuthFailure() {
		return this != NONE;
	}

	/** Upgrade reddinde HTTP durum kodunu kapanış mesajından çıkarır; yoksa -1. */
	public static int upgradeStatus(int code, String reason) {
		if (code != CLOSE_PROTOCOL_ERROR || reason == null) {
			return -1;
		}
		Matcher m = STATUS.matcher(reason);
		return m.find() ? Integer.parseInt(m.group(1)) : -1;
	}

	public static GatewayRejection classify(int code, String reason) {
		if (code == CLOSE_REVOKED) {
			return REVOKED_4003;
		}
		if (code == CLOSE_POLICY_VIOLATION) {
			return POLICY_1008;
		}
		int status = upgradeStatus(code, reason);
		if (status == 401) {
			return UNAUTHORIZED_401;
		}
		if (status == 403) {
			return FORBIDDEN_403;
		}
		return NONE;
	}
}
