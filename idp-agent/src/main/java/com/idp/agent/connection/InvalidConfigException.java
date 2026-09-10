package com.idp.agent.connection;

/**
 * Agent yapılandırması (application.yml) geçersiz olduğunda fırlatılır. Mesaj operatöre
 * gösterilir; bu yüzden hiçbir zaman sır değeri (agent-secret, CF Access secret) içermez.
 */
public class InvalidConfigException extends RuntimeException {
	/** Yapılandırma hatasında sürecin çıkış kodu (kurulum betikleri buna bakabilir). */
	public static final int EXIT_CODE = 2;

	public InvalidConfigException(String message) {
		super(message);
	}
}
