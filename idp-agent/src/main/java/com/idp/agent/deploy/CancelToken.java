package com.idp.agent.deploy;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * İşbirlikçi iptal bayrağı. Adımlar arasında {@link #throwIfCancelled()} ile kontrol edilir; süren
 * indirme / hook süreci gibi bloklayan işler {@link #onCancel(Runnable)} ile kaydolup kesilir.
 */
public final class CancelToken {

	public enum Reason {
		CANCELLED("cancelled"),
		TIMEOUT("timeout");

		private final String code;

		Reason(String code) {
			this.code = code;
		}

		public String code() {
			return code;
		}
	}

	/** Kayıt; kapatınca listener silinir. */
	public interface Registration extends AutoCloseable {
		@Override
		void close();
	}

	private final Object lock = new Object();
	private final List<Runnable> listeners = new ArrayList<>();
	private final CountDownLatch latch = new CountDownLatch(1);
	private volatile Reason reason;

	/** Hiç kimsenin iptal etmediği bir token (geri alma adımları iptal edilemez). */
	public static CancelToken none() {
		return new CancelToken();
	}

	/** @return ilk iptal çağrısında true; sonrakiler yok sayılır (ilk neden kalır). */
	public boolean cancel(Reason why) {
		List<Runnable> toRun;
		synchronized (lock) {
			if (reason != null) {
				return false;
			}
			reason = why;
			toRun = new ArrayList<>(listeners);
			listeners.clear();
		}
		latch.countDown();
		for (Runnable listener : toRun) {
			try {
				listener.run();
			} catch (RuntimeException ignored) {
				// Listener hatası iptali durdurmaz.
			}
		}
		return true;
	}

	public boolean isCancelled() {
		return reason != null;
	}

	public Reason reason() {
		return reason;
	}

	public void throwIfCancelled() throws CancelledException {
		Reason current = reason;
		if (current != null) {
			throw new CancelledException(current);
		}
	}

	/** Listener'ı kaydeder; token zaten iptal edildiyse hemen çalıştırır. */
	public Registration onCancel(Runnable listener) {
		synchronized (lock) {
			if (reason == null) {
				listeners.add(listener);
				return () -> {
					synchronized (lock) {
						listeners.remove(listener);
					}
				};
			}
		}
		listener.run();
		return () -> { };
	}

	/** Süre dolana ya da iptal gelene kadar bekler; iptalde {@link CancelledException}. */
	public void sleep(Duration duration) throws CancelledException {
		try {
			latch.await(Math.max(0, duration.toMillis()), TimeUnit.MILLISECONDS);
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new CancelledException(Reason.CANCELLED);
		}
		throwIfCancelled();
	}
}
