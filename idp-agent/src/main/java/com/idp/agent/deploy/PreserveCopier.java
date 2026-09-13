package com.idp.agent.deploy;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Sunucuya özgü dosyaları canlı bileşenden staging'e kopyalar (canlı olan kazanır).
 *
 * <p>Desen dili (bileşen köküne göreli, '/' ayraçlı): {@code *} bir segment içinde, {@code ?} tek
 * karakter, {@code **} herhangi derinlik. Bir dizini seçen desen (ör. {@code uploads} ya da
 * {@code config/**}) o dizinin tüm alt ağacını seçer. Sembolik bağlantı/junction kopyalanmaz
 * (kaydedilir ve atlanır). Windows'ta eşleşme büyük/küçük harf duyarsızdır.
 */
final class PreserveCopier {

	record Result(int files, int directories, List<String> skipped) {}

	private record Rule(Pattern regex, String literalPrefix, String dirSelf) {}

	private static final class Abort extends RuntimeException {
		private static final long serialVersionUID = 1L;
		final DeployException cause;

		Abort(DeployException cause) {
			super(cause.getMessage(), null, false, false);
			this.cause = cause;
		}
	}

	private final List<Rule> rules = new ArrayList<>();
	private final boolean caseInsensitive;

	PreserveCopier(List<String> patterns, boolean caseInsensitive) {
		this.caseInsensitive = caseInsensitive;
		for (String pattern : patterns) {
			rules.add(new Rule(toRegex(pattern, caseInsensitive), literalPrefix(pattern),
				pattern.endsWith("/**") ? pattern.substring(0, pattern.length() - 3) : null));
		}
	}

	static Pattern toRegex(String glob, boolean caseInsensitive) {
		StringBuilder regex = new StringBuilder("^");
		for (int i = 0; i < glob.length(); i++) {
			char c = glob.charAt(i);
			if (c == '*') {
				boolean doubleStar = i + 1 < glob.length() && glob.charAt(i + 1) == '*';
				if (doubleStar) {
					boolean slash = i + 2 < glob.length() && glob.charAt(i + 2) == '/';
					regex.append(slash ? "(?:.*/)?" : ".*");
					i += slash ? 2 : 1;
				} else {
					regex.append("[^/]*");
				}
			} else if (c == '?') {
				regex.append("[^/]");
			} else {
				regex.append(Pattern.quote(String.valueOf(c)));
			}
		}
		regex.append('$');
		return Pattern.compile(regex.toString(), caseInsensitive ? Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE : 0);
	}

	/** İlk joker içeren segmentten önceki kısım (alt ağaç budaması için). */
	private static String literalPrefix(String pattern) {
		List<String> literal = new ArrayList<>();
		for (String segment : pattern.split("/")) {
			if (segment.indexOf('*') >= 0 || segment.indexOf('?') >= 0) {
				break;
			}
			literal.add(segment);
		}
		return String.join("/", literal);
	}

	private String fold(String value) {
		return caseInsensitive ? value.toLowerCase(Locale.ROOT) : value;
	}

	/** Göreli yol (ya da atalarından biri) bir desenle eşleşiyor mu. */
	boolean selected(String relative) {
		for (Rule rule : rules) {
			if (rule.dirSelf() != null && fold(rule.dirSelf()).equals(fold(relative))) {
				return true;
			}
			String candidate = relative;
			while (true) {
				if (rule.regex().matcher(candidate).matches()) {
					return true;
				}
				int slash = candidate.lastIndexOf('/');
				if (slash < 0) {
					break;
				}
				candidate = candidate.substring(0, slash);
			}
		}
		return false;
	}

	/** Bu dizinin altında seçilebilecek bir şey olabilir mi (node_modules gibi büyük ağaçları atlamak için). */
	private boolean mayContainMatches(String relativeDir) {
		String dir = fold(relativeDir);
		for (Rule rule : rules) {
			String prefix = fold(rule.literalPrefix());
			if (prefix.isEmpty() || prefix.equals(dir) || prefix.startsWith(dir + "/") || dir.startsWith(prefix + "/")) {
				return true;
			}
		}
		return false;
	}

	Result copy(Path live, Path staging, CancelToken cancel) throws DeployException {
		if (rules.isEmpty() || !Files.isDirectory(live, LinkOption.NOFOLLOW_LINKS)) {
			return new Result(0, 0, List.of());
		}
		int[] counts = new int[2];
		List<String> skipped = new ArrayList<>();
		try {
			Files.walkFileTree(live, EnumSet.noneOf(FileVisitOption.class), Integer.MAX_VALUE, new SimpleFileVisitor<Path>() {
				@Override
				public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
					if (dir.equals(live)) {
						return FileVisitResult.CONTINUE;
					}
					checkCancel(cancel);
					String relative = relative(live, dir);
					if (attrs.isSymbolicLink() || attrs.isOther()) {
						if (selected(relative)) {
							skipped.add(relative);
						}
						return FileVisitResult.SKIP_SUBTREE;
					}
					if (selected(relative)) {
						Path target = inside(staging, relative);
						if (Files.exists(target, LinkOption.NOFOLLOW_LINKS) && !Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
							throw new Abort(new DeployException("korunan dizin yeni surumde dosya olarak var: " + relative));
						}
						Files.createDirectories(target);
						counts[1]++;
						return FileVisitResult.CONTINUE;
					}
					return mayContainMatches(relative) ? FileVisitResult.CONTINUE : FileVisitResult.SKIP_SUBTREE;
				}

				@Override
				public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
					String relative = relative(live, file);
					if (!selected(relative)) {
						return FileVisitResult.CONTINUE;
					}
					if (attrs.isSymbolicLink() || attrs.isOther() || !attrs.isRegularFile()) {
						skipped.add(relative);
						return FileVisitResult.CONTINUE;
					}
					Path target = inside(staging, relative);
					if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
						throw new Abort(new DeployException("korunan dosya yeni surumde dizin olarak var: " + relative));
					}
					Files.createDirectories(target.getParent());
					Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES,
						LinkOption.NOFOLLOW_LINKS);
					counts[0]++;
					return FileVisitResult.CONTINUE;
				}

				@Override
				public FileVisitResult visitFileFailed(Path file, IOException exc) throws IOException {
					throw exc;
				}
			});
		} catch (Abort abort) {
			throw abort.cause;
		} catch (IOException ex) {
			throw new DeployException("korunan dosyalar kopyalanamadi: " + SafeNames.describe(ex));
		}
		return new Result(counts[0], counts[1], skipped);
	}

	private static void checkCancel(CancelToken cancel) {
		try {
			cancel.throwIfCancelled();
		} catch (CancelledException ex) {
			throw new Abort(ex);
		}
	}

	private static String relative(Path root, Path path) {
		Path rel = root.relativize(path);
		StringBuilder out = new StringBuilder();
		for (Path part : rel) {
			if (out.length() > 0) {
				out.append('/');
			}
			out.append(part);
		}
		return out.toString();
	}

	private static Path inside(Path root, String relative) {
		Path target = root.resolve(relative).normalize();
		if (!target.startsWith(root) || target.equals(root)) {
			throw new Abort(new DeployException("unsafe_path: korunan yol staging disina cikiyor: " + relative));
		}
		return target;
	}
}
