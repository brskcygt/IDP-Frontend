package com.idp.agent.deploy;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.idp.agent.deploy.DeployPayloads.RuntimeSpec;
import com.idp.agent.enums.OperatingSystem;

/**
 * Gerçek sistem komutlarıyla {@link RuntimeController}. Hepsi argüman listesiyle, zaman aşımıyla ve
 * çıkış kodu/durum denetimiyle çalışır:
 * <ul>
 *   <li>nssm: {@code nssm stop|start <svc>} + {@code nssm status <svc>} SERVICE_STOPPED/RUNNING bekler</li>
 *   <li>windows-service: {@code %SystemRoot%\System32\sc.exe stop|start <svc>} + {@code sc.exe query} (1=STOPPED, 4=RUNNING)</li>
 *   <li>iis-static: durdurma yok; başlatmada appPool varsa
 *       {@code %SystemRoot%\System32\inetsrv\appcmd.exe recycle apppool /apppool.name:<pool>}</li>
 *   <li>systemd: {@code systemctl stop|start <svc>} + {@code systemctl is-active <svc>}</li>
 * </ul>
 */
public final class SystemRuntimeController implements RuntimeController {
	private static final Pattern SC_STATE =
		Pattern.compile("\\b([1-7])\\s+(STOPPED|START_PENDING|STOP_PENDING|RUNNING|CONTINUE_PENDING|PAUSE_PENDING|PAUSED)\\b");
	private static final int SC_OK_NOT_ACTIVE = 1062;
	private static final int SC_CANNOT_ACCEPT_CONTROL = 1061;
	private static final int SC_ALREADY_RUNNING = 1056;

	private final ProcessRunner runner;
	private final OperatingSystem os;
	private final String nssm;
	private final Duration commandTimeout;
	private final Duration stateTimeout;
	private final Duration pollInterval;

	public SystemRuntimeController(ProcessRunner runner, OperatingSystem os, String nssmPath) {
		this(runner, os, nssmPath, Duration.ofSeconds(120), Duration.ofSeconds(90), Duration.ofSeconds(1));
	}

	SystemRuntimeController(ProcessRunner runner, OperatingSystem os, String nssmPath, Duration commandTimeout,
			Duration stateTimeout, Duration pollInterval) {
		this.runner = runner;
		this.os = os;
		this.nssm = nssmPath == null || nssmPath.isBlank() ? DeployConfig.DEFAULT_NSSM : nssmPath;
		this.commandTimeout = commandTimeout;
		this.stateTimeout = stateTimeout;
		this.pollInterval = pollInterval;
	}

	@Override
	public void validate(RuntimeSpec spec) throws DeployException {
		switch (spec.type()) {
			case NSSM, WINDOWS_SERVICE, IIS_STATIC -> {
				if (os != OperatingSystem.WINDOWS) {
					throw new DeployException("runtime_not_supported:" + spec.type().wire());
				}
			}
			case SYSTEMD -> {
				if (os != OperatingSystem.LINUX) {
					throw new DeployException("runtime_not_supported:" + spec.type().wire());
				}
			}
			case NONE -> { }
			default -> throw new DeployException("runtime_not_supported:" + spec.type().wire());
		}
		if (spec.type().requiresServiceName()
			&& (spec.serviceName() == null || !DeployPayloads.SERVICE.matcher(spec.serviceName()).matches())) {
			throw DeployException.invalidPayload("serviceName gecersiz");
		}
		if (spec.appPool() != null && !DeployPayloads.APP_POOL.matcher(spec.appPool()).matches()) {
			throw DeployException.invalidPayload("appPool gecersiz");
		}
	}

	@Override
	public void stop(RuntimeSpec spec) throws DeployException {
		validate(spec);
		String service = spec.serviceName();
		switch (spec.type()) {
			case NSSM -> {
				ProcessRunner.Result result = run(List.of(nssm, "stop", service));
				waitNssm(service, "SERVICE_STOPPED", result);
			}
			case WINDOWS_SERVICE -> {
				ProcessRunner.Result result = run(List.of(sc(), "stop", service));
				int code = result.exitCode();
				if (code != 0 && code != SC_OK_NOT_ACTIVE && code != SC_CANNOT_ACCEPT_CONTROL) {
					throw failure("sc.exe stop " + service, result);
				}
				waitSc(service, 1, "STOPPED");
			}
			case SYSTEMD -> {
				ProcessRunner.Result result = run(List.of(systemctl(), "stop", service));
				if (result.exitCode() != 0) {
					throw failure("systemctl stop " + service, result);
				}
				waitSystemd(service, false);
			}
			case IIS_STATIC, NONE -> { }
			default -> { }
		}
	}

	@Override
	public void start(RuntimeSpec spec) throws DeployException {
		validate(spec);
		String service = spec.serviceName();
		switch (spec.type()) {
			case NSSM -> {
				ProcessRunner.Result result = run(List.of(nssm, "start", service));
				waitNssm(service, "SERVICE_RUNNING", result);
			}
			case WINDOWS_SERVICE -> {
				ProcessRunner.Result result = run(List.of(sc(), "start", service));
				if (result.exitCode() != 0 && result.exitCode() != SC_ALREADY_RUNNING) {
					throw failure("sc.exe start " + service, result);
				}
				waitSc(service, 4, "RUNNING");
			}
			case SYSTEMD -> {
				ProcessRunner.Result result = run(List.of(systemctl(), "start", service));
				if (result.exitCode() != 0) {
					throw failure("systemctl start " + service, result);
				}
				waitSystemd(service, true);
			}
			case IIS_STATIC -> {
				if (spec.appPool() != null) {
					// Ad boşluk içerebilir: TEK liste öğesi; ProcessBuilder Windows'ta tamamını tırnaklar.
					ProcessRunner.Result result = run(List.of(appcmd(), "recycle", "apppool", "/apppool.name:" + spec.appPool()));
					if (result.exitCode() != 0) {
						throw failure("appcmd recycle apppool " + spec.appPool(), result);
					}
				}
			}
			case NONE -> { }
			default -> { }
		}
	}

	private ProcessRunner.Result run(List<String> command) throws DeployException {
		ProcessRunner.Result result = runner.run(command, commandTimeout);
		if (result.timedOut()) {
			throw new DeployException(String.join(" ", command.subList(1, command.size())) + " "
				+ commandTimeout.toSeconds() + " sn icinde bitmedi");
		}
		return result;
	}

	private void waitNssm(String service, String wanted, ProcessRunner.Result initial) throws DeployException {
		long deadline = System.nanoTime() + stateTimeout.toNanos();
		String last = "";
		while (true) {
			ProcessRunner.Result status = run(List.of(nssm, "status", service));
			last = status.output().trim();
			if (status.exitCode() == 0 && last.toUpperCase(Locale.ROOT).contains(wanted)) {
				return;
			}
			if (status.exitCode() != 0) {
				throw new DeployException("nssm status " + service + " basarisiz (cikis " + status.exitCode() + "): "
					+ SafeNames.printable(last, 300));
			}
			if (System.nanoTime() >= deadline) {
				throw new DeployException("servis " + service + " " + wanted + " durumuna gecmedi (son durum: "
					+ SafeNames.printable(last, 100) + "; komut cikisi " + initial.exitCode() + ": "
					+ SafeNames.printable(initial.output().trim(), 200) + ")");
			}
			pause();
		}
	}

	private void waitSc(String service, int wantedCode, String wantedName) throws DeployException {
		long deadline = System.nanoTime() + stateTimeout.toNanos();
		String last = "";
		while (true) {
			ProcessRunner.Result query = run(List.of(sc(), "query", service));
			last = query.output().trim();
			if (query.exitCode() != 0) {
				throw failure("sc.exe query " + service, query);
			}
			int state = scState(last);
			if (state == wantedCode) {
				return;
			}
			if (System.nanoTime() >= deadline) {
				throw new DeployException("servis " + service + " " + wantedName + " durumuna gecmedi (durum kodu " + state + ")");
			}
			pause();
		}
	}

	/** {@code sc.exe query} çıktısından durum kodu (1..7); bulunamazsa -1. Etiketler yerelleşse de kod sabittir. */
	static int scState(String output) {
		Matcher matcher = SC_STATE.matcher(output == null ? "" : output);
		return matcher.find() ? Integer.parseInt(matcher.group(1)) : -1;
	}

	private void waitSystemd(String service, boolean wantActive) throws DeployException {
		long deadline = System.nanoTime() + stateTimeout.toNanos();
		String last = "";
		while (true) {
			ProcessRunner.Result status = run(List.of(systemctl(), "is-active", service));
			last = status.output().trim();
			boolean active = last.equals("active");
			if (wantActive && active) {
				return;
			}
			if (!wantActive && !active && !last.equals("deactivating") && !last.equals("activating")) {
				return;
			}
			if (wantActive && last.equals("failed")) {
				throw new DeployException("servis " + service + " baslatilamadi (systemd: failed)");
			}
			if (System.nanoTime() >= deadline) {
				throw new DeployException("servis " + service + " beklenen duruma gecmedi (systemd: "
					+ SafeNames.printable(last, 50) + ")");
			}
			pause();
		}
	}

	private void pause() {
		try {
			Thread.sleep(Math.max(1, pollInterval.toMillis()));
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
	}

	private static DeployException failure(String what, ProcessRunner.Result result) {
		return new DeployException(what + " basarisiz (cikis " + result.exitCode() + "): "
			+ SafeNames.printable(result.output().trim(), 300));
	}

	static String systemRoot() {
		String root = System.getenv("SystemRoot");
		if (root == null || root.isBlank()) {
			root = System.getenv("windir");
		}
		return root == null || root.isBlank() ? "C:\\Windows" : root;
	}

	private String sc() {
		return systemRoot() + "\\System32\\sc.exe";
	}

	private String appcmd() {
		return systemRoot() + "\\System32\\inetsrv\\appcmd.exe";
	}

	private static String systemctl() {
		for (String candidate : List.of("/usr/bin/systemctl", "/bin/systemctl")) {
			if (Files.isExecutable(Paths.get(candidate))) {
				return candidate;
			}
		}
		return "systemctl";
	}
}
