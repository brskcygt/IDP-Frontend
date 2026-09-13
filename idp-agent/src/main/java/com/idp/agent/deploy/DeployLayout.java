package com.idp.agent.deploy;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.CodeSource;

/**
 * Taban dizin düzeni ve yol hapsi. Tüm yollar {@code deploy.base-path}'in gerçek yolu (symlink
 * çözülmüş) altında kalır:
 *
 * <pre>
 * &lt;base&gt;/&lt;subdir&gt;                              canlı bileşen (ör. backend, frontend)
 * &lt;base&gt;/.releases/_downloads/&lt;deployId&gt;-&lt;name&gt;.tar.gz
 * &lt;base&gt;/.releases/&lt;version&gt;/&lt;name&gt;              staging
 * &lt;base&gt;/.releases/prev/&lt;name&gt;-&lt;version&gt;-&lt;ts&gt;     önceki sürümler
 * &lt;base&gt;/.releases/state.json
 * </pre>
 *
 * Canlı dizin ve .releases sembolik bağlantı / junction olamaz; agent'ın kendi JAR'ı ya da çalışma
 * dizini bir bileşen dizininin içindeyse deploy reddedilir.
 */
final class DeployLayout {
	static final String RELEASES = ".releases";
	static final String DOWNLOADS = "_downloads";
	static final String PREV = "prev";
	static final String STATE = "state.json";

	private final Path base;
	private final Path releases;
	private final Path downloads;
	private final Path prev;

	private DeployLayout(Path base, Path releases, Path downloads, Path prev) {
		this.base = base;
		this.releases = releases;
		this.downloads = downloads;
		this.prev = prev;
	}

	/** Taban dizini doğrular ve .releases iskeletini (yoksa) oluşturur. */
	static DeployLayout open(DeployConfig config) throws DeployException {
		if (!config.isConfigured()) {
			throw new DeployException(config.notConfiguredError());
		}
		Path configured = config.basePath();
		if (!Files.isDirectory(configured)) {
			throw new DeployException("not_configured: deploy.base-path mevcut degil ya da dizin degil (" + configured + ")");
		}
		Path base;
		try {
			base = configured.toRealPath();
		} catch (IOException ex) {
			throw new DeployException("not_configured: deploy.base-path okunamadi: " + SafeNames.describe(ex));
		}
		Path releases = ensureChildDir(base, RELEASES);
		Path downloads = ensureChildDir(releases, DOWNLOADS);
		Path prev = ensureChildDir(releases, PREV);
		return new DeployLayout(base, releases, downloads, prev);
	}

	/** Salt okuma: state.json yolu (dizin oluşturmadan). */
	static Path stateFileFor(DeployConfig config) throws IOException {
		return config.basePath().toRealPath().resolve(RELEASES).resolve(STATE);
	}

	private static Path ensureChildDir(Path parentReal, String name) throws DeployException {
		Path dir = parentReal.resolve(name);
		try {
			if (!Files.exists(dir, LinkOption.NOFOLLOW_LINKS)) {
				Files.createDirectory(dir);
			}
			BasicFileAttributes attrs = Files.readAttributes(dir, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
			if (attrs.isSymbolicLink() || attrs.isOther() || !attrs.isDirectory()) {
				throw new DeployException("unsafe_path: " + dir + " gercek bir dizin olmali (link/junction olamaz)");
			}
			if (!parentReal.equals(dir.toRealPath().getParent())) {
				throw new DeployException("unsafe_path: " + dir + " taban dizin disina cikiyor");
			}
		} catch (IOException ex) {
			throw new DeployException("unsafe_path: " + dir + " hazirlanamadi: " + SafeNames.describe(ex));
		}
		return dir;
	}

	Path base() {
		return base;
	}

	Path releases() {
		return releases;
	}

	Path downloads() {
		return downloads;
	}

	Path prev() {
		return prev;
	}

	Path stateFile() {
		return releases.resolve(STATE);
	}

	/**
	 * Canlı bileşen dizini: {@code <base>/<subdir>}. Varsa gerçek bir dizin olmalı ve gerçek yolu
	 * doğrudan tabanın altında kalmalı (symlink/junction ile kaçış yok).
	 */
	Path liveDir(String subdir) throws DeployException {
		if (!SafeNames.isSafeSegment(subdir)) {
			throw DeployException.invalidPayload("subdir gecersiz");
		}
		Path live = base.resolve(subdir).normalize();
		requireChild(base, live);
		Path real = live;
		if (Files.exists(live, LinkOption.NOFOLLOW_LINKS)) {
			try {
				BasicFileAttributes attrs = Files.readAttributes(live, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
				if (attrs.isSymbolicLink() || attrs.isOther()) {
					throw new DeployException("unsafe_path: " + live + " sembolik baglanti/junction olamaz");
				}
				if (!attrs.isDirectory()) {
					throw new DeployException("unsafe_path: " + live + " bir dizin degil");
				}
				real = live.toRealPath();
			} catch (IOException ex) {
				throw new DeployException("unsafe_path: " + live + " okunamadi: " + SafeNames.describe(ex));
			}
			if (!base.equals(real.getParent())) {
				throw new DeployException("unsafe_path: " + live + " taban dizin disina cikiyor");
			}
		}
		for (Path own : agentOwnPaths()) {
			if (own.startsWith(real) || own.startsWith(live)) {
				throw new DeployException("unsafe_path: agent'in kendi dosyalari " + live + " altinda; bu dizine deploy edilemez");
			}
		}
		return live;
	}

	Path stagingDir(String version, String name) throws DeployException {
		if (!SafeNames.isSafeSegment(version) || !SafeNames.isSafeSegment(name)) {
			throw DeployException.invalidPayload("surum ya da bilesen adi gecersiz");
		}
		Path staging = releases.resolve(version).resolve(name).normalize();
		requireInside(releases, staging);
		return staging;
	}

	Path downloadFile(String deployId, String name) throws DeployException {
		String fileName = deployId + "-" + name + ".tar.gz";
		if (!SafeNames.isSafeSegment(fileName)) {
			throw DeployException.invalidPayload("deployId gecersiz");
		}
		Path file = downloads.resolve(fileName).normalize();
		requireChild(downloads, file);
		return file;
	}

	/** {@code .releases/prev/<dirName>}; ad tek güvenli segment olmalı. */
	Path prevEntry(String dirName) throws DeployException {
		if (!SafeNames.isSafeSegment(dirName)) {
			throw new DeployException("unsafe_path: gecersiz onceki surum dizini adi");
		}
		Path entry = prev.resolve(dirName).normalize();
		requireChild(prev, entry);
		return entry;
	}

	static void requireChild(Path parent, Path child) throws DeployException {
		if (!parent.equals(child.getParent())) {
			throw new DeployException("unsafe_path: " + child + " beklenen dizinin (" + parent + ") dogrudan altinda degil");
		}
	}

	static void requireInside(Path root, Path path) throws DeployException {
		Path normalized = path.normalize();
		if (!normalized.startsWith(root) || normalized.equals(root)) {
			throw new DeployException("unsafe_path: " + path + " izinli dizin (" + root + ") disinda");
		}
	}

	/** Agent JAR'ının bulunduğu dizin ve süreç çalışma dizini (gerçek yollar). */
	private static Path[] agentOwnPaths() {
		Path code = null;
		try {
			CodeSource source = DeployLayout.class.getProtectionDomain().getCodeSource();
			if (source != null && source.getLocation() != null) {
				code = Paths.get(source.getLocation().toURI()).toRealPath();
			}
		} catch (IOException | URISyntaxException | RuntimeException ignored) {
			code = null;
		}
		Path cwd = null;
		try {
			cwd = Paths.get(System.getProperty("user.dir")).toRealPath();
		} catch (IOException | RuntimeException ignored) {
			cwd = null;
		}
		if (code == null && cwd == null) {
			return new Path[0];
		}
		if (code == null) {
			return new Path[] { cwd };
		}
		return cwd == null ? new Path[] { code } : new Path[] { code, cwd };
	}
}
