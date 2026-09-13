package com.idp.agent.deploy;

import com.idp.agent.deploy.DeployPayloads.HealthSpec;

/** Başlatma sonrası sağlık kontrolü. */
public interface HealthChecker {

	/**
	 * {@code health.url} 200 dönene (ve {@code expectVersionPath} verilmişse o yoldaki değer
	 * {@code expectedVersion}'a eşit olana) kadar {@code timeoutSec} boyunca yoklar.
	 *
	 * @param expectedVersion null ise sürüm karşılaştırılmaz (yalnızca 200)
	 */
	void check(HealthSpec health, String expectedVersion, CancelToken cancel) throws DeployException;
}
