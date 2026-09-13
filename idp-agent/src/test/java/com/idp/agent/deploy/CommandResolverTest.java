package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import com.idp.agent.enums.OperatingSystem;

class CommandResolverTest {
	@TempDir
	Path tmp;

	private Path executable(Path dir, String name) throws Exception {
		Files.createDirectories(dir);
		Path file = dir.resolve(name);
		Files.writeString(file, "#!/bin/sh\n");
		try {
			Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rwxr-xr-x"));
		} catch (UnsupportedOperationException ignored) {
			// Windows
		}
		return file;
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void resolvesToAbsoluteRealPathAndSkipsRelativeEntries() throws Exception {
		Path bin = tmp.resolve("bin");
		Path tool = executable(bin, "mytool");
		CommandResolver resolver = new CommandResolver(OperatingSystem.LINUX, () -> "relative/bin::" + bin);
		CommandResolver.Resolved resolved = resolver.resolve("mytool", List.of("x"), null);
		assertEquals(List.of(tool.toRealPath().toString()), resolved.prefix());
		assertNull(resolved.effectivePath());
	}

	@Test
	@EnabledOnOs({ OS.MAC, OS.LINUX })
	void nonExecutableAndArtifactProvidedCommandsAreSkipped() throws Exception {
		Path base = tmp.resolve("jetsrm");
		executable(base.resolve("backend/node_modules/.bin"), "node");
		Path plain = Files.createDirectories(tmp.resolve("plain"));
		Files.writeString(plain.resolve("node"), "not executable");
		CommandResolver resolver = new CommandResolver(OperatingSystem.LINUX,
			() -> base.resolve("backend/node_modules/.bin") + ":" + plain);
		DeployException ex = assertThrows(DeployException.class,
			() -> resolver.resolve("node", List.of(), base.toRealPath()));
		assertTrue(ex.getMessage().contains("bulunamadi"), ex.getMessage());
	}

	@Test
	void windowsNpmCmdRunsNodeWithCliScriptWithoutCmdExe() throws Exception {
		Path nodejs = tmp.resolve("nodejs");
		Files.createDirectories(nodejs.resolve("node_modules/npm/bin"));
		Files.writeString(nodejs.resolve("npm.cmd"), "@echo off");
		Files.writeString(nodejs.resolve("npx.cmd"), "@echo off");
		Files.writeString(nodejs.resolve("node.exe"), "MZ");
		Files.writeString(nodejs.resolve("node_modules/npm/bin/npm-cli.js"), "//");
		CommandResolver resolver = new CommandResolver(OperatingSystem.WINDOWS, () -> "C:\\missing;" + nodejs);

		CommandResolver.Resolved npm = resolver.resolve("npm", List.of("run", "migrate & calc"), null);
		assertEquals(List.of(nodejs.resolve("node.exe").toRealPath().toString(),
			nodejs.resolve("node_modules/npm/bin/npm-cli.js").toRealPath().toString()), npm.prefix());
		assertEquals("C:\\missing;" + nodejs, npm.effectivePath());

		CommandResolver.Resolved node = resolver.resolve("node", List.of(), null);
		assertEquals(List.of(nodejs.resolve("node.exe").toRealPath().toString()), node.prefix());

		DeployException npx = assertThrows(DeployException.class, () -> resolver.resolve("npx", List.of(), null));
		assertTrue(npx.getMessage().contains("npx-cli.js"), npx.getMessage());
	}

	@Test
	void windowsGenericCmdRequiresStrictlySafeArguments() throws Exception {
		Path tools = Files.createDirectories(tmp.resolve("tools"));
		Files.writeString(tools.resolve("migrate.cmd"), "@echo off");
		CommandResolver resolver = new CommandResolver(OperatingSystem.WINDOWS, tools::toString);
		// macOS/Linux'ta temp yolu sürücü harfi içermez → cmd.exe için güvenli yol değil.
		DeployException ex = assertThrows(DeployException.class, () -> resolver.resolve("migrate", List.of("up"), null));
		assertTrue(ex.getMessage().contains("cmd.exe"), ex.getMessage());

		assertTrue(CommandResolver.CMD_SAFE_ARG.matcher("db:migrate").matches());
		assertTrue(CommandResolver.CMD_SAFE_ARG.matcher("--env=production").matches());
		assertTrue(CommandResolver.CMD_SAFE_PATH.matcher("C:\\tools\\migrate.cmd").matches());
		for (String bad : List.of("a&b", "a|b", "%PATH%", "!x!", "a b", "\"q\"", "a^b", "(x)", "a<b", "a>b", "")) {
			assertFalse(CommandResolver.CMD_SAFE_ARG.matcher(bad).matches(), bad);
		}
		assertFalse(CommandResolver.CMD_SAFE_PATH.matcher("C:\\Program Files\\x.cmd").matches());
	}

	@Test
	void emptyPathIsNotFound() {
		CommandResolver resolver = new CommandResolver(OperatingSystem.LINUX, () -> null);
		assertThrows(DeployException.class, () -> resolver.resolve("node", List.of(), null));
	}
}
