package com.idp.agent.deploy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

@EnabledOnOs({ OS.MAC, OS.LINUX })
@Timeout(30)
class SystemProcessRunnerTest {
	@TempDir
	Path tmp;

	private final SystemProcessRunner runner = new SystemProcessRunner();

	@Test
	void argumentListExitCodeAndLines() throws Exception {
		List<String> lines = new CopyOnWriteArrayList<>();
		ProcessRunner.Result result = runner.run(List.of("sh", "-c", "echo a; echo b 1>&2; exit 4"), tmp, Map.of(),
			Duration.ofSeconds(10), lines::add, CancelToken.none());
		assertEquals(4, result.exitCode());
		assertFalse(result.timedOut());
		assertEquals(List.of("a", "b"), lines);
	}

	@Test
	void argumentsAreNotShellInterpreted() throws Exception {
		List<String> lines = new CopyOnWriteArrayList<>();
		runner.run(List.of("echo", "$(touch " + tmp.resolve("pwned") + ")", "; rm -rf /"), tmp, Map.of(),
			Duration.ofSeconds(10), lines::add, CancelToken.none());
		assertFalse(Files.exists(tmp.resolve("pwned")));
		assertTrue(lines.get(0).contains("$(touch"), lines.toString());
	}

	@Test
	void workingDirectoryAndEnvironment() throws Exception {
		List<String> lines = new CopyOnWriteArrayList<>();
		runner.run(List.of("sh", "-c", "echo $HOOK_VALUE; pwd -P"), tmp, Map.of("HOOK_VALUE", "from-env"),
			Duration.ofSeconds(10), lines::add, CancelToken.none());
		assertEquals("from-env", lines.get(0));
		assertEquals(tmp.toRealPath().toString(), lines.get(1));
	}

	@Test
	void nulBytesAreStripped() throws Exception {
		List<String> lines = new CopyOnWriteArrayList<>();
		runner.run(List.of("sh", "-c", "printf 'S\\000E\\000R\\000V\\000I\\000C\\000E\\000\\n'"), tmp, Map.of(),
			Duration.ofSeconds(10), lines::add, CancelToken.none());
		assertEquals(List.of("SERVICE"), lines);
	}

	@Test
	void timeoutKillsTheProcessTree() throws Exception {
		Path pidFile = tmp.resolve("child.pid");
		long started = System.nanoTime();
		ProcessRunner.Result result = runner.run(List.of("sh", "-c", "sleep 30 & echo $! > " + pidFile + "; wait"), tmp,
			Map.of(), Duration.ofMillis(700), null, CancelToken.none());
		assertTrue(result.timedOut());
		assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 15);
		long childPid = Long.parseLong(Files.readString(pidFile).trim());
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
		while (ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false) && System.nanoTime() < deadline) {
			Thread.sleep(50);
		}
		assertFalse(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false), "alt surec de sonlandirilmali");
	}

	@Test
	void cancelKillsAndThrows() throws Exception {
		CancelToken cancel = new CancelToken();
		Thread canceller = new Thread(() -> {
			try {
				Thread.sleep(300);
			} catch (InterruptedException ignored) {
				Thread.currentThread().interrupt();
			}
			cancel.cancel(CancelToken.Reason.TIMEOUT);
		});
		canceller.start();
		long started = System.nanoTime();
		CancelledException ex = assertThrows(CancelledException.class,
			() -> runner.run(List.of("sleep", "30"), tmp, Map.of(), Duration.ofSeconds(20), null, cancel));
		assertEquals("timeout", ex.getMessage());
		assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 10);
		canceller.join();
	}

	@Test
	void missingExecutableIsDeployException() {
		DeployException ex = assertThrows(DeployException.class, () -> runner.run(List.of(tmp.resolve("nope").toString()),
			Duration.ofSeconds(5)));
		assertTrue(ex.getMessage().contains("baslatilamadi"), ex.getMessage());
	}
}
