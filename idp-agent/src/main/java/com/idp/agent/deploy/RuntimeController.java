package com.idp.agent.deploy;

import com.idp.agent.deploy.DeployPayloads.RuntimeSpec;

/**
 * Bileşenin çalışma zamanını durdurur/başlatır (nssm, Windows servisi, IIS app pool geri dönüşümü,
 * systemd). Windows komutları bu arayüzün arkasındadır; testler macOS/Linux'ta sahte uygulama kullanır.
 */
public interface RuntimeController {

	/** Deploy başlamadan (indirme öncesi) çağrılır: platform uyumu vb. */
	void validate(RuntimeSpec spec) throws DeployException;

	/** Swap öncesi; çalışmayan servis için hata vermez. iis-static / none için işlem yok. */
	void stop(RuntimeSpec spec) throws DeployException;

	/** Swap (ve preStart hook'ları) sonrası; iis-static için appPool varsa geri dönüşüm. */
	void start(RuntimeSpec spec) throws DeployException;
}
