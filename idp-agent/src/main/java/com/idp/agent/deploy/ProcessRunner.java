package com.idp.agent.deploy;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Harici süreç çalıştırıcı. Her zaman ARGÜMAN LİSTESİ alır (kabuk metni yok); zaman aşımında süreç
 * ağacı sonlandırılır. Testlerde sahte uygulama ile değiştirilir (macOS'ta Windows komutları yok).
 */
public interface ProcessRunner {

	record Result(int exitCode, String output, boolean timedOut) {}

	interface LineListener {
		void onLine(String line);
	}

	/**
	 * @param workDir  null ise agent'ın çalışma dizini
	 * @param extraEnv miras alınan ortama eklenir (değerleri loglanmaz)
	 * @param listener null olabilir; her çıktı satırı için çağrılır
	 * @throws CancelledException token iptal edilirse (süreç ağacı öldürülür)
	 * @throws DeployException    süreç başlatılamazsa
	 */
	Result run(List<String> command, Path workDir, Map<String, String> extraEnv, Duration timeout,
		LineListener listener, CancelToken cancel) throws DeployException;

	default Result run(List<String> command, Duration timeout) throws DeployException {
		return run(command, null, Map.of(), timeout, null, CancelToken.none());
	}
}
