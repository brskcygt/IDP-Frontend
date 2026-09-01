package com.idp.agent.enums;

import java.util.List;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;

/**
 * İşletim sistemi türlerini temsil eden enum
 */
public enum OperatingSystem {
	WINDOWS("windows"),
	LINUX("linux"),
	DARWIN("darwin");

	private final String identifier;

	OperatingSystem(String identifier) {
		this.identifier = identifier;
	}

	public String getIdentifier() {
		return identifier;
	}

	/**
	 * Mevcut işletim sistemini algılar
	 * @return Algılanan işletim sistemi
	 * @throws UnsupportedOperationException Desteklenmeyen OS için
	 */
	public static OperatingSystem detect() {
		String osName = System.getProperty("os.name").toLowerCase();

		if (osName.contains("win")) {
			return WINDOWS;
		} else if (osName.contains("mac") || osName.contains("darwin")) {
			return DARWIN;
		} else if (osName.contains("nix") || osName.contains("nux") || osName.contains("aix") || osName.contains("linux")) {
			return LINUX;
		}

		throw new UnsupportedOperationException("Desteklenmeyen işletim sistemi: " + osName);
	}

	/**
	 * Verilen string'e göre OS döndürür
	 * @param identifier OS tanımlayıcısı ("windows", "linux", "darwin")
	 * @return Eşleşen OS veya null
	 */
	public static OperatingSystem fromIdentifier(String identifier) {
		for (OperatingSystem os : values()) {
			if (os.identifier.equalsIgnoreCase(identifier)) {
				return os;
			}
		}
		return null;
	}

	/**
	 * İşletim sistemi hakkında detaylı bilgi döndürür.
	 * Windows için: Windows Server 2019, Windows 10 vb.
	 * Linux için: Ubuntu 20.04.1 LTS, CentOS Linux 7 vb.
	 * macOS için: Mac OS X 10.15.7 vb.
	 */
	public static String getDetailedInfo() {
		String osName = System.getProperty("os.name");
		String osVersion = System.getProperty("os.version");
		String osArch = System.getProperty("os.arch");

		try {
			if (detect() == LINUX) {
				String distro = getLinuxDistroInfo();
				return (distro != null ? distro : osName + " " + osVersion) + " (" + osArch + ")";
			}
		} catch (Exception ignored) {}
		
		return osName + " " + osVersion + " (" + osArch + ")";
	}

	private static String getLinuxDistroInfo() {
		try {
			Path path = Paths.get("/etc/os-release");
			if (Files.exists(path)) {
				List<String> lines = Files.readAllLines(path);
				for (String line : lines) {
					if (line.startsWith("PRETTY_NAME=")) {
						return line.substring("PRETTY_NAME=".length()).replace("\"", "");
					}
				}
			}
		} catch (Exception ignored) {}
		return null;
	}
}
