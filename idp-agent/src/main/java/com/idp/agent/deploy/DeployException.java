package com.idp.agent.deploy;

/**
 * Artifact deploy adımının başarısızlığı. Mesaj {@code deploy_event} / {@code deploy_result} ile
 * sunucuya gider; bu yüzden hiçbir zaman indirme token'ı ya da runtimeConfig/hook env değeri içermez.
 */
public class DeployException extends Exception {
	private static final long serialVersionUID = 1L;

	public DeployException(String message) {
		super(message);
	}

	public DeployException(String message, Throwable cause) {
		super(message, cause);
	}

	public static DeployException invalidPayload(String detail) {
		return new DeployException("invalid_payload: " + detail);
	}
}
