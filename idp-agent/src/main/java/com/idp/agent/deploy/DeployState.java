package com.idp.agent.deploy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * {@code <base>/.releases/state.json} içeriği. Sözleşmedeki alanlar ({@code version, deployedAt,
 * previousVersions}) yanında geri alma için gereken meta veri de tutulur (subdir, runtime, health,
 * preserve, önceki sürüm dizinleri). runtimeConfig değerleri, hook'lar ve token'lar YAZILMAZ.
 */
final class DeployState {
	int schema = 1;
	Map<String, ComponentState> components = new TreeMap<>();

	static final class ComponentState {
		String version;
		String deployedAt;
		String deployId;
		String subdir;
		String runtimeType;
		String serviceName;
		String appPool;
		String healthUrl;
		String healthExpectVersionPath;
		Integer healthTimeoutSec;
		List<String> preserve = new ArrayList<>();
		/** En yeni başta; {@link #previousReleases} ile aynı sıra ("unknown" = sürümü bilinmeyen eski kurulum). */
		List<String> previousVersions = new ArrayList<>();
		/** En yeni başta. */
		List<PreviousRelease> previousReleases = new ArrayList<>();

		void normalize() {
			if (preserve == null) {
				preserve = new ArrayList<>();
			}
			if (previousReleases == null) {
				previousReleases = new ArrayList<>();
			}
			previousReleases.removeIf(release -> release == null || release.dir == null
				|| !SafeNames.isSafeSegment(release.dir));
			syncPreviousVersions();
		}

		void syncPreviousVersions() {
			List<String> versions = new ArrayList<>();
			for (PreviousRelease release : previousReleases) {
				versions.add(release.version == null ? "unknown" : release.version);
			}
			previousVersions = versions;
		}
	}

	static final class PreviousRelease {
		String version;
		String dir;
		String archivedAt;

		PreviousRelease() {}

		PreviousRelease(String version, String dir, String archivedAt) {
			this.version = version;
			this.dir = dir;
			this.archivedAt = archivedAt;
		}
	}

	void normalize() {
		if (components == null) {
			components = new TreeMap<>();
		}
		components.entrySet().removeIf(entry -> entry.getValue() == null
			|| !DeployPayloads.COMPONENT.matcher(entry.getKey()).matches());
		for (ComponentState state : components.values()) {
			state.normalize();
		}
		if (!(components instanceof TreeMap)) {
			components = new TreeMap<>(components);
		}
	}
}
