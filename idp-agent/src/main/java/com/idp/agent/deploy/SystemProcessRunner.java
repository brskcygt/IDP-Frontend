package com.idp.agent.deploy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * {@link ProcessBuilder} tabanlı çalıştırıcı: argüman listesi, stdin kapalı, stdout+stderr
 * birleşik, satır satır okuma. Çıktıdaki NUL baytları atılır (nssm gibi araçlar pipe'a UTF-16LE
 * yazar; ASCII metin böylece okunur kalır). Zaman aşımı ya da iptalde önce alt süreçler, sonra
 * kendisi zorla sonlandırılır.
 */
public final class SystemProcessRunner implements ProcessRunner {
	static final int MAX_CAPTURED_OUTPUT = 64 * 1024;

	@Override
	public Result run(List<String> command, Path workDir, Map<String, String> extraEnv, Duration timeout,
			LineListener listener, CancelToken cancel) throws DeployException {
		cancel.throwIfCancelled();
		ProcessBuilder builder = new ProcessBuilder(command);
		if (workDir != null) {
			builder.directory(workDir.toFile());
		}
		builder.redirectErrorStream(true);
		if (extraEnv != null && !extraEnv.isEmpty()) {
			builder.environment().putAll(extraEnv);
		}
		Process process;
		try {
			process = builder.start();
		} catch (IOException ex) {
			throw new DeployException("komut baslatilamadi: " + commandName(command) + " (" + SafeNames.describe(ex) + ")");
		}
		try {
			process.getOutputStream().close();
		} catch (IOException ignored) {
			// stdin kapatılamasa da süreç çalışır.
		}

		OutputCollector collector = new OutputCollector(process.getInputStream(), listener);
		Thread reader = new Thread(collector, "deploy-process-output");
		reader.setDaemon(true);
		reader.start();

		boolean timedOut = false;
		try (CancelToken.Registration ignored = cancel.onCancel(() -> killTree(process))) {
			if (!process.waitFor(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS)) {
				timedOut = true;
				killTree(process);
				process.waitFor(10, TimeUnit.SECONDS);
			}
		} catch (InterruptedException ex) {
			killTree(process);
			Thread.currentThread().interrupt();
			throw new CancelledException(CancelToken.Reason.CANCELLED);
		}
		try {
			reader.join(5000);
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
		cancel.throwIfCancelled();
		int exitCode;
		try {
			exitCode = timedOut ? -1 : process.exitValue();
		} catch (IllegalThreadStateException ex) {
			exitCode = -1;
		}
		return new Result(exitCode, collector.text(), timedOut);
	}

	/** Önce alt süreçlerin anlık görüntüsü alınır, sonra hepsi ve kendisi zorla sonlandırılır. */
	static void killTree(Process process) {
		List<ProcessHandle> descendants;
		try {
			descendants = process.descendants().collect(Collectors.toList());
		} catch (RuntimeException ex) {
			descendants = List.of();
		}
		process.destroyForcibly();
		for (ProcessHandle handle : descendants) {
			try {
				handle.destroyForcibly();
			} catch (RuntimeException ignored) {
				// Zaten bitmiş olabilir.
			}
		}
	}

	private static String commandName(List<String> command) {
		if (command.isEmpty()) {
			return "?";
		}
		String first = command.get(0);
		int slash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
		return slash >= 0 ? first.substring(slash + 1) : first;
	}

	private static final class OutputCollector implements Runnable {
		private final InputStream in;
		private final LineListener listener;
		private final StringBuilder captured = new StringBuilder();

		OutputCollector(InputStream in, LineListener listener) {
			this.in = in;
			this.listener = listener;
		}

		@Override
		public void run() {
			ByteArrayOutputStream line = new ByteArrayOutputStream();
			byte[] buffer = new byte[8192];
			try (InputStream stream = in) {
				int read;
				while ((read = stream.read(buffer)) != -1) {
					for (int i = 0; i < read; i++) {
						byte b = buffer[i];
						if (b == '\n') {
							emit(line);
						} else if (b != 0) {
							line.write(b);
							if (line.size() >= 4096) {
								emit(line);
							}
						}
					}
				}
			} catch (IOException ignored) {
				// Süreç öldürüldüğünde akış kapanır.
			}
			emit(line);
		}

		private void emit(ByteArrayOutputStream line) {
			if (line.size() == 0) {
				return;
			}
			String text = new String(line.toByteArray(), StandardCharsets.UTF_8);
			line.reset();
			if (text.endsWith("\r")) {
				text = text.substring(0, text.length() - 1);
			}
			synchronized (captured) {
				if (captured.length() < MAX_CAPTURED_OUTPUT) {
					captured.append(text, 0, Math.min(text.length(), MAX_CAPTURED_OUTPUT - captured.length())).append('\n');
				}
			}
			if (listener != null) {
				try {
					listener.onLine(text);
				} catch (RuntimeException ignored) {
					// Dinleyici hatası süreç çıktısını okumayı durdurmaz.
				}
			}
		}

		String text() {
			synchronized (captured) {
				return captured.toString();
			}
		}
	}
}
