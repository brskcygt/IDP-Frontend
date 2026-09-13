package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;

/**
 * Aynı sürücüdeki dizinleri yeniden adlandırarak yer değiştirir (kopya yok; hepsi base-path altında
 * olduğundan aynı birimdedir). Windows'ta dosya kilitleri (IIS, antivirüs, servis kapanışı) için
 * artan beklemeyle yaklaşık {@code retryBudget} boyunca yeniden dener.
 */
final class DirectorySwapper {

	/** Yapılmış bir swap: {@code live} şimdi yeni içerik; eski içerik {@code archived}'de (yoksa null). */
	record Swap(Path live, Path incomingOrigin, Path archived) {}

	private final Duration retryBudget;
	private final Duration initialBackoff;
	private final Duration maxBackoff;

	DirectorySwapper() {
		this(Duration.ofSeconds(30), Duration.ofMillis(200), Duration.ofSeconds(3));
	}

	DirectorySwapper(Duration retryBudget, Duration initialBackoff, Duration maxBackoff) {
		this.retryBudget = retryBudget;
		this.initialBackoff = initialBackoff;
		this.maxBackoff = maxBackoff;
	}

	/**
	 * {@code live → archiveTo} (live varsa), sonra {@code incoming → live}. İkinci adım başarısız olursa
	 * eski dizin geri konur.
	 */
	Swap switchIn(Path live, Path incoming, Path archiveTo) throws DeployException {
		Path archived = null;
		if (Files.exists(live, LinkOption.NOFOLLOW_LINKS)) {
			createParent(archiveTo);
			move(live, archiveTo);
			archived = archiveTo;
		}
		try {
			move(incoming, live);
		} catch (DeployException ex) {
			if (archived != null) {
				try {
					move(archived, live);
				} catch (DeployException restore) {
					throw new DeployException("KRITIK: yeni surum yerlestirilemedi ve eski surum geri konamadi; eski surum "
						+ archived + " altinda (" + ex.getMessage() + "; " + restore.getMessage() + ")");
				}
			}
			throw ex;
		}
		return new Swap(live, incoming, archived);
	}

	/** Swap'ı geri alır: canlı dizin geldiği yere, arşivlenen eski dizin canlıya. */
	void revert(Swap swap) throws DeployException {
		if (Files.exists(swap.live(), LinkOption.NOFOLLOW_LINKS)) {
			Path back = swap.incomingOrigin();
			if (Files.exists(back, LinkOption.NOFOLLOW_LINKS)) {
				back = back.resolveSibling(back.getFileName() + "-reverted-" + System.nanoTime());
			}
			createParent(back);
			move(swap.live(), back);
		}
		if (swap.archived() != null) {
			try {
				move(swap.archived(), swap.live());
			} catch (DeployException ex) {
				throw new DeployException("KRITIK: onceki surum canliya geri konamadi; onceki surum " + swap.archived()
					+ " altinda (" + ex.getMessage() + ")");
			}
		}
	}

	void move(Path from, Path to) throws DeployException {
		if (Files.exists(to, LinkOption.NOFOLLOW_LINKS)) {
			throw new DeployException("yeniden adlandirma hedefi zaten var: " + to);
		}
		long deadline = System.nanoTime() + retryBudget.toNanos();
		long backoff = Math.max(1, initialBackoff.toMillis());
		int attempt = 0;
		while (true) {
			attempt++;
			try {
				Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
				return;
			} catch (NoSuchFileException | FileAlreadyExistsException | AtomicMoveNotSupportedException ex) {
				throw new DeployException("yeniden adlandirilamadi (" + from.getFileName() + " -> " + to.getFileName()
					+ "): " + SafeNames.describe(ex));
			} catch (IOException ex) {
				if (System.nanoTime() + Duration.ofMillis(backoff).toNanos() > deadline) {
					throw new DeployException("yeniden adlandirilamadi (" + attempt + " deneme; dosya kilidi olabilir): "
						+ from.getFileName() + " -> " + to.getFileName() + ": " + SafeNames.describe(ex));
				}
				try {
					Thread.sleep(backoff);
				} catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
					throw new DeployException("yeniden adlandirma kesildi: " + from.getFileName());
				}
				backoff = Math.min(backoff * 2, Math.max(1, maxBackoff.toMillis()));
			}
		}
	}

	private static void createParent(Path path) throws DeployException {
		try {
			Files.createDirectories(path.getParent());
		} catch (IOException ex) {
			throw new DeployException("dizin olusturulamadi: " + path.getParent() + ": " + SafeNames.describe(ex));
		}
	}
}
