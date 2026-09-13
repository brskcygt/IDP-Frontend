package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.yaml.snakeyaml.Yaml;

class DeployConfigTest {
	@TempDir
	Path dir;

	private static DeployConfig parse(String yaml) {
		Map<?, ?> root = new Yaml().load(yaml);
		return DeployConfig.fromYaml(root);
	}

	private String base() {
		return dir.toString().replace("\\", "\\\\");
	}

	@Test
	void missingSectionOrBasePathIsNotConfigured() {
		DeployConfig none = parse("server:\n  url: wss://x\n");
		assertFalse(none.isConfigured());
		assertEquals("not_configured", none.notConfiguredError());
		assertNull(none.error());

		DeployConfig blank = parse("deploy:\n  base-path: \"  \"\n");
		assertFalse(blank.isConfigured());
		assertEquals("not_configured", blank.notConfiguredError());
		assertFalse(DeployConfig.fromYaml(null).isConfigured());
	}

	@Test
	void validConfigUsesDefaults() {
		DeployConfig config = parse("deploy:\n  base-path: \"" + base() + "\"\n");
		assertTrue(config.isConfigured(), config.describe());
		assertEquals(dir.normalize(), config.basePath());
		assertEquals(3, config.keepReleases());
		assertEquals(EnumSet.allOf(RuntimeType.class), config.allowedRuntimes());
		assertEquals(Set.of("node", "npm", "npx"), config.allowedHookCommands());
		assertTrue(config.isHookCommandAllowed("npm"));
		assertTrue(config.isHookCommandAllowed("NPM.cmd"));
		assertTrue(config.isHookCommandAllowed("node.exe"));
		assertFalse(config.isHookCommandAllowed("powershell"));
		assertEquals("nssm", config.nssmPath());
	}

	@Test
	void customValuesAreParsed() {
		DeployConfig config = parse("deploy:\n  base-path: \"" + base() + "\"\n  keep-releases: \"5\"\n"
			+ "  allowed-runtimes: [iis-static, nssm]\n  allowed-hook-commands: [node]\n  nssm-path: \"/opt/nssm\"\n");
		assertTrue(config.isConfigured(), config.describe());
		assertEquals(5, config.keepReleases());
		assertEquals(EnumSet.of(RuntimeType.IIS_STATIC, RuntimeType.NSSM), config.allowedRuntimes());
		assertFalse(config.isRuntimeAllowed(RuntimeType.SYSTEMD));
		assertEquals(Set.of("node"), config.allowedHookCommands());
		assertFalse(config.isHookCommandAllowed("npx"));
		assertEquals("/opt/nssm", config.nssmPath());

		DeployConfig noHooks = parse("deploy:\n  base-path: \"" + base() + "\"\n  allowed-hook-commands: []\n");
		assertTrue(noHooks.isConfigured());
		assertFalse(noHooks.isHookCommandAllowed("node"));
	}

	@Test
	void invalidValuesDisableArtifactDeployWithReason() {
		String[] bad = {
			"deploy:\n  base-path: \"relative/dir\"\n",
			"deploy:\n  base-path: \"/\"\n",
			"deploy:\n  base-path: \"" + base() + "/../etc\"\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  keep-releases: 0\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  keep-releases: 21\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  keep-releases: abc\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  allowed-runtimes: [nssm, docker]\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  allowed-runtimes: nssm\n",
			"deploy:\n  base-path: \"" + base() + "\"\n  allowed-hook-commands: [\"/bin/sh\"]\n",
			"deploy: yes\n",
		};
		for (String yaml : bad) {
			DeployConfig config = parse(yaml);
			assertFalse(config.isConfigured(), yaml);
			assertTrue(config.notConfiguredError().startsWith("not_configured"), yaml);
		}
		assertTrue(parse(bad[0]).notConfiguredError().contains("mutlak"));
		assertTrue(parse(bad[1]).notConfiguredError().contains("kok"));
	}
}
