package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.idp.agent.deploy.DeployPayloads.RuntimeSpec;
import com.idp.agent.enums.OperatingSystem;

/** Windows/systemd komutlarının argüman listeleri ve durum bekleme mantığı; sahte süreç çalıştırıcıyla. */
class SystemRuntimeControllerTest {

	/** Komutun (ilk öğe hariç) birleşimine göre sıralı yanıt verir; son yanıt tekrarlanır. */
	private static final class ScriptedRunner implements ProcessRunner {
		final List<List<String>> commands = new ArrayList<>();
		final Map<String, Deque<Result>> responses = new HashMap<>();

		ScriptedRunner on(String key, Result... results) {
			responses.computeIfAbsent(key, k -> new ArrayDeque<>()).addAll(List.of(results));
			return this;
		}

		@Override
		public Result run(List<String> command, Path workDir, Map<String, String> extraEnv, Duration timeout,
				LineListener listener, CancelToken cancel) {
			commands.add(command);
			String key = String.join(" ", command.subList(1, command.size()));
			Deque<Result> queue = responses.get(key);
			if (queue == null || queue.isEmpty()) {
				return new Result(0, "", false);
			}
			return queue.size() > 1 ? queue.poll() : queue.peek();
		}
	}

	private static ProcessRunner.Result ok(String output) {
		return new ProcessRunner.Result(0, output, false);
	}

	private static SystemRuntimeController controller(ScriptedRunner runner, OperatingSystem os) {
		return new SystemRuntimeController(runner, os, "nssm", Duration.ofSeconds(5), Duration.ofMillis(300), Duration.ofMillis(5));
	}

	private static final RuntimeSpec NSSM = new RuntimeSpec(RuntimeType.NSSM, "jetsrm-backend", null);

	@Test
	void nssmStopWaitsForStoppedEvenIfStopExitCodeIsNonZero() throws Exception {
		ScriptedRunner runner = new ScriptedRunner()
			.on("stop jetsrm-backend", new ProcessRunner.Result(1, "The service has not been started.", false))
			.on("status jetsrm-backend", ok("SERVICE_STOP_PENDING"), ok("SERVICE_STOPPED"));
		controller(runner, OperatingSystem.WINDOWS).stop(NSSM);
		assertEquals(List.of("nssm", "stop", "jetsrm-backend"), runner.commands.get(0));
		assertEquals(List.of("nssm", "status", "jetsrm-backend"), runner.commands.get(1));
		assertEquals(3, runner.commands.size());
	}

	@Test
	void nssmStartWaitsForRunningAndFailsOnTimeout() throws Exception {
		ScriptedRunner runner = new ScriptedRunner().on("status jetsrm-backend", ok("SERVICE_START_PENDING"), ok("SERVICE_RUNNING"));
		controller(runner, OperatingSystem.WINDOWS).start(NSSM);
		assertEquals(List.of("nssm", "start", "jetsrm-backend"), runner.commands.get(0));

		ScriptedRunner stuck = new ScriptedRunner().on("status jetsrm-backend", ok("SERVICE_PAUSED"));
		DeployException ex = assertThrows(DeployException.class, () -> controller(stuck, OperatingSystem.WINDOWS).start(NSSM));
		assertTrue(ex.getMessage().contains("SERVICE_RUNNING"), ex.getMessage());
	}

	@Test
	void nssmMissingServiceFailsFast() {
		ScriptedRunner runner = new ScriptedRunner().on("status jetsrm-backend",
			new ProcessRunner.Result(3, "Can't open service!", false));
		DeployException ex = assertThrows(DeployException.class, () -> controller(runner, OperatingSystem.WINDOWS).stop(NSSM));
		assertTrue(ex.getMessage().contains("nssm status"), ex.getMessage());
	}

	@Test
	void customNssmPathIsUsed() throws Exception {
		ScriptedRunner runner = new ScriptedRunner().on("status svc", ok("SERVICE_STOPPED"));
		new SystemRuntimeController(runner, OperatingSystem.WINDOWS, "C:\\tools\\nssm.exe", Duration.ofSeconds(5),
			Duration.ofMillis(100), Duration.ofMillis(5)).stop(new RuntimeSpec(RuntimeType.NSSM, "svc", null));
		assertEquals("C:\\tools\\nssm.exe", runner.commands.get(0).get(0));
	}

	@Test
	void windowsServiceUsesAbsoluteScExeAndStateCodes() throws Exception {
		RuntimeSpec spec = new RuntimeSpec(RuntimeType.WINDOWS_SERVICE, "JetSrmApi", null);
		ScriptedRunner runner = new ScriptedRunner()
			.on("stop JetSrmApi", new ProcessRunner.Result(1062, "[SC] ControlService FAILED 1062", false))
			.on("query JetSrmApi", ok("SERVICE_NAME: JetSrmApi\n        STATE              : 1  STOPPED"));
		controller(runner, OperatingSystem.WINDOWS).stop(spec);
		assertTrue(runner.commands.get(0).get(0).endsWith("\\System32\\sc.exe"), runner.commands.get(0).get(0));
		assertEquals(List.of("stop", "JetSrmApi"), runner.commands.get(0).subList(1, 3));

		ScriptedRunner starting = new ScriptedRunner()
			.on("query JetSrmApi", ok("        DURUM              : 2  START_PENDING"), ok("        DURUM              : 4  RUNNING"));
		controller(starting, OperatingSystem.WINDOWS).start(spec);

		ScriptedRunner denied = new ScriptedRunner().on("stop JetSrmApi", new ProcessRunner.Result(5, "Access is denied.", false));
		DeployException ex = assertThrows(DeployException.class, () -> controller(denied, OperatingSystem.WINDOWS).stop(spec));
		assertTrue(ex.getMessage().contains("cikis 5"), ex.getMessage());
	}

	@Test
	void scStateParsing() {
		assertEquals(4, SystemRuntimeController.scState("STATE              : 4  RUNNING \n (STOPPABLE)"));
		assertEquals(1, SystemRuntimeController.scState("ZUSTAND            : 1  STOPPED"));
		assertEquals(-1, SystemRuntimeController.scState("garbage"));
	}

	@Test
	void iisStaticRecyclesAppPoolOnlyWhenConfigured() throws Exception {
		ScriptedRunner runner = new ScriptedRunner();
		SystemRuntimeController controller = controller(runner, OperatingSystem.WINDOWS);
		controller.stop(new RuntimeSpec(RuntimeType.IIS_STATIC, null, "JetsrmPool"));
		assertTrue(runner.commands.isEmpty(), "iis-static durdurulmaz");
		controller.start(new RuntimeSpec(RuntimeType.IIS_STATIC, null, "JetsrmPool"));
		List<String> recycle = runner.commands.get(0);
		assertTrue(recycle.get(0).endsWith("\\System32\\inetsrv\\appcmd.exe"), recycle.get(0));
		assertEquals(List.of("recycle", "apppool", "/apppool.name:JetsrmPool"), recycle.subList(1, 4));
		controller.start(new RuntimeSpec(RuntimeType.IIS_STATIC, null, null));
		assertEquals(1, runner.commands.size());
	}

	@Test
	void appPoolWithSpacesIsOneArgument() throws Exception {
		ScriptedRunner runner = new ScriptedRunner();
		controller(runner, OperatingSystem.WINDOWS).start(new RuntimeSpec(RuntimeType.IIS_STATIC, null, "JetSRM Frontend Pool"));
		List<String> recycle = runner.commands.get(0);
		assertEquals(4, recycle.size(), recycle.toString());
		assertEquals("/apppool.name:JetSRM Frontend Pool", recycle.get(3));
		assertThrows(DeployException.class, () -> controller(runner, OperatingSystem.WINDOWS)
			.start(new RuntimeSpec(RuntimeType.IIS_STATIC, null, "pool & calc")));
	}

	@Test
	void systemdStopAndStart() throws Exception {
		RuntimeSpec spec = new RuntimeSpec(RuntimeType.SYSTEMD, "jetsrm-backend.service", null);
		ScriptedRunner runner = new ScriptedRunner()
			.on("is-active jetsrm-backend.service", ok("deactivating"), ok("inactive"));
		controller(runner, OperatingSystem.LINUX).stop(spec);
		assertEquals(List.of("stop", "jetsrm-backend.service"), runner.commands.get(0).subList(1, 3));

		ScriptedRunner failed = new ScriptedRunner().on("is-active jetsrm-backend.service", ok("failed"));
		DeployException ex = assertThrows(DeployException.class, () -> controller(failed, OperatingSystem.LINUX).start(spec));
		assertTrue(ex.getMessage().contains("failed"), ex.getMessage());
	}

	@Test
	void platformCompatibilityIsValidated() {
		ScriptedRunner runner = new ScriptedRunner();
		DeployException nssmOnMac = assertThrows(DeployException.class, () -> controller(runner, OperatingSystem.DARWIN).validate(NSSM));
		assertEquals("runtime_not_supported:nssm", nssmOnMac.getMessage());
		DeployException systemdOnWindows = assertThrows(DeployException.class, () -> controller(runner, OperatingSystem.WINDOWS)
			.validate(new RuntimeSpec(RuntimeType.SYSTEMD, "x", null)));
		assertEquals("runtime_not_supported:systemd", systemdOnWindows.getMessage());
		assertDoesNotThrow(() -> controller(runner, OperatingSystem.DARWIN).validate(new RuntimeSpec(RuntimeType.NONE, null, null)));
		assertThrows(DeployException.class, () -> controller(runner, OperatingSystem.WINDOWS)
			.validate(new RuntimeSpec(RuntimeType.NSSM, "bad name & calc", null)));
		assertTrue(runner.commands.isEmpty());
	}
}
