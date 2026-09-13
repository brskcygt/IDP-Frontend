package com.idp.agent.deploy;

import java.io.IOException;
import java.net.URI;
import java.nio.file.AccessDeniedException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import com.idp.agent.ConfigLoader;
import com.idp.agent.connection.AgentConnectionConfig;
import com.idp.agent.deploy.DeployPayloads.ComponentSpec;
import com.idp.agent.deploy.DeployPayloads.DeployRequest;
import com.idp.agent.deploy.DeployPayloads.HealthSpec;
import com.idp.agent.deploy.DeployPayloads.HookSpec;
import com.idp.agent.deploy.DeployPayloads.RollbackRequest;
import com.idp.agent.deploy.DeployPayloads.RuntimeSpec;
import com.idp.agent.deploy.DeployReporter.Stage;
import com.idp.agent.deploy.DeployReporter.Status;
import com.idp.agent.deploy.DeployState.ComponentState;
import com.idp.agent.deploy.DeployState.PreviousRelease;
import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.managers.WebSocketManager;
import com.idp.agent.security.Sha256Verifier;

/**
 * {@code artifact_deploy} / {@code artifact_rollback} / {@code artifact_cancel} / {@code artifact_status}
 * işleyicisi.
 *
 * <p>Kilit: tek iş parçacıklı yürütücü + {@link #current}; bir işlem sürerken gelen ikinci istek
 * {@code deploy_result {success:false, error:"busy"}} alır. Her deployId için TAM OLARAK BİR terminal
 * {@code deploy_result} gönderilir (aynı deployId ikinci kez gelirse yok sayılır).
 *
 * <p>Akış iki fazlıdır: önce TÜM bileşenler hazırlanır (indir → sha256 → aç → koru → config.js), sonra
 * sırayla etkinleştirilir (durdur → swap → preStart hook'ları → başlat → health). Böylece örneğin
 * frontend indirmesi başarısız olursa backend hiç durdurulmaz. Etkinleştirmede bir hata ya da iptal
 * olursa o ana kadar dokunulan TÜM bileşenler geri alınır (hepsi ya da hiçbiri).
 */
public final class ArtifactDeployManager {
	static final String STATUS_RESULT = "artifact_status_result";
	static final int RECENT_IDS = 200;
	static final int MAX_HOOK_LINES = 200;
	static final int MAX_HOOK_LINE_LENGTH = 500;
	static final int HOOK_TAIL_LINES = 5;
	static final int DEFAULT_ROLLBACK_TIMEOUT_SEC = 1800;
	private static final DateTimeFormatter STAMP =
		DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssSSS'Z'").withZone(ZoneOffset.UTC);

	/** Bağımlılıklar (testlerde sahteleriyle değiştirilir). */
	static final class Deps {
		Supplier<DeployConfig> config;
		DeployReporter.Sink sink;
		DeployLog log;
		RuntimeController runtime;
		HealthChecker health;
		ArtifactDownloader downloader;
		ArtifactExtractor extractor = new ArtifactExtractor(ArtifactExtractor.DEFAULT_MAX_BYTES, ArtifactExtractor.DEFAULT_MAX_ENTRIES);
		DirectorySwapper swapper = new DirectorySwapper();
		ProcessRunner processRunner;
		CommandResolver commandResolver;
		boolean caseInsensitivePaths = OperatingSystem.detect() == OperatingSystem.WINDOWS;
		long progressIntervalMillis = 1000;
		Clock clock = Clock.systemUTC();
	}

	private enum Kind { DEPLOY, ROLLBACK }

	private static final class Run {
		final String id;
		final Kind kind;
		final CancelToken cancel = new CancelToken();

		Run(String id, Kind kind) {
			this.id = id;
			this.kind = kind;
		}
	}

	private record ResolvedHook(HookSpec spec, CommandResolver.Resolved resolved) {}

	/** Tek bir bileşen üzerindeki işlem bağlamı. */
	private static final class Target {
		final String name;
		final String subdir;
		final RuntimeSpec runtime;
		final HealthSpec health;
		final String newVersion;
		final String previousVersion;
		final Path live;
		final Path incoming;
		final Path archiveTo;
		final List<String> preserve;
		ComponentSpec spec;
		Path download;
		List<ResolvedHook> hooks = List.of();

		Stage stage;
		boolean attempted;
		boolean stopped;
		DirectorySwapper.Swap swap;
		boolean reverted;
		String error;
		String rollbackError;
		String currentHook;

		Target(String name, String subdir, RuntimeSpec runtime, HealthSpec health, String newVersion,
				String previousVersion, Path live, Path incoming, Path archiveTo, List<String> preserve) {
			this.name = name;
			this.subdir = subdir;
			this.runtime = runtime;
			this.health = health;
			this.newVersion = newVersion;
			this.previousVersion = previousVersion;
			this.live = live;
			this.incoming = incoming;
			this.archiveTo = archiveTo;
			this.preserve = preserve;
		}

		boolean touched() {
			return stopped || swap != null;
		}
	}

	private static final class Operation {
		final Kind kind;
		final String deployId;
		final String version;
		final int timeoutSec;
		final DeployLayout layout;
		final StateStore store;
		final DeployState state;
		final List<Target> targets;
		final int keepReleases;
		final List<String> warnings;
		final List<String> pruneDirs = new ArrayList<>();

		Operation(Kind kind, String deployId, String version, int timeoutSec, DeployLayout layout, StateStore store,
				DeployState state, List<Target> targets, int keepReleases, List<String> warnings) {
			this.kind = kind;
			this.deployId = deployId;
			this.version = version;
			this.timeoutSec = timeoutSec;
			this.layout = layout;
			this.store = store;
			this.state = state;
			this.targets = targets;
			this.keepReleases = keepReleases;
			this.warnings = warnings;
		}
	}

	private static ArtifactDeployManager instance;

	private final Deps deps;
	private final DeployLog log;
	private final AtomicReference<Run> current = new AtomicReference<>();
	private final Set<String> recentIds = new LinkedHashSet<>();
	private final ExecutorService worker = Executors.newSingleThreadExecutor(daemon("artifact-deploy"));
	private final ExecutorService statusWorker = Executors.newSingleThreadExecutor(daemon("artifact-status"));
	private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(daemon("artifact-deploy-timer"));

	ArtifactDeployManager(Deps deps) {
		this.deps = deps;
		this.log = deps.log;
	}

	public static synchronized ArtifactDeployManager getInstance() {
		if (instance == null) {
			instance = new ArtifactDeployManager(defaultDeps());
		}
		return instance;
	}

	private static Deps defaultDeps() {
		ConfigLoader loader = ConfigLoader.getInstance();
		AgentConnectionConfig connection = loader.getConnectionConfig();
		DeployConfig deployConfig = loader.getDeployConfig();
		OperatingSystem os = OperatingSystem.detect();
		SystemProcessRunner runner = new SystemProcessRunner();

		Deps deps = new Deps();
		deps.config = () -> deployConfig;
		deps.sink = (process, payload) -> WebSocketManager.getInstance().sendMessagePreservingNulls(process, payload);
		deps.log = DeployLog.advanced();
		deps.processRunner = runner;
		deps.runtime = new SystemRuntimeController(runner, os, deployConfig.nssmPath());
		deps.health = HttpHealthChecker.create();
		deps.downloader = new ArtifactDownloader(
			ArtifactDownloader.defaultClient(connection.hasProxy() ? connection.getProxyHost() : null, connection.getProxyPort()),
			3, Duration.ofSeconds(2), Duration.ofSeconds(60), connection.getAgentId());
		deps.commandResolver = CommandResolver.system(runner, os);
		return deps;
	}

	private static ThreadFactory daemon(String name) {
		return runnable -> {
			Thread thread = new Thread(runnable, name);
			thread.setDaemon(true);
			return thread;
		};
	}

	// ================================================================== mesaj girişleri

	public void handleDeploy(Object payload) {
		submit(payload, Kind.DEPLOY);
	}

	public void handleRollback(Object payload) {
		submit(payload, Kind.ROLLBACK);
	}

	public void handleCancel(Object payload) {
		String deployId = DeployPayloads.rawId(payload, "deployId");
		Run run = current.get();
		if (deployId == null || run == null || !run.id.equals(deployId)) {
			log.warn("[artifact-deploy] iptal istegi: eslesen calisan islem yok (" + (deployId == null ? "?" : deployId) + ")");
			return;
		}
		if (run.cancel.cancel(CancelToken.Reason.CANCELLED)) {
			log.warn("[artifact-deploy " + deployId + "] iptal istendi");
		}
	}

	public void handleStatus(Object payload) {
		try {
			statusWorker.execute(() -> status(payload));
		} catch (RejectedExecutionException ex) {
			log.warn("[artifact-deploy] artifact_status islenemedi: agent kapaniyor");
		}
	}

	/** Testler ve kapanış için. */
	void shutdown() {
		worker.shutdownNow();
		statusWorker.shutdownNow();
		timer.shutdownNow();
	}

	boolean isBusy() {
		return current.get() != null;
	}

	private void submit(Object payload, Kind kind) {
		String deployId = DeployPayloads.rawId(payload, "deployId");
		if (!DeployPayloads.isValidDeployId(deployId)) {
			log.warn("[artifact-deploy] reddedildi: deployId gecersiz");
			sendTerminal(deployId, rejection(deployId, DeployPayloads.versionHint(payload),
				"invalid_payload: deployId gecersiz", System.nanoTime()));
			return;
		}
		synchronized (recentIds) {
			if (recentIds.contains(deployId)) {
				log.warn("[artifact-deploy " + deployId + "] ayni deployId tekrar geldi; yok sayildi");
				return;
			}
			recentIds.add(deployId);
			if (recentIds.size() > RECENT_IDS) {
				Iterator<String> oldest = recentIds.iterator();
				oldest.next();
				oldest.remove();
			}
		}
		Run run = new Run(deployId, kind);
		if (!current.compareAndSet(null, run)) {
			Run busy = current.get();
			log.warn("[artifact-deploy " + deployId + "] reddedildi: baska bir islem suruyor ("
				+ (busy == null ? "?" : busy.id) + ")");
			sendTerminal(deployId, rejection(deployId, DeployPayloads.versionHint(payload), "busy", System.nanoTime()));
			return;
		}
		try {
			worker.execute(() -> execute(run, payload));
		} catch (RejectedExecutionException ex) {
			current.compareAndSet(run, null);
			sendTerminal(deployId, rejection(deployId, DeployPayloads.versionHint(payload), "agent_shutting_down", System.nanoTime()));
		}
	}

	private void sendTerminal(String deployId, Map<String, Object> result) {
		new DeployReporter(deps.sink, log, new Redactor(), deployId, 0).result(result);
	}

	// ================================================================== yürütme

	private void execute(Run run, Object payload) {
		long startedNanos = System.nanoTime();
		Redactor redactor = new Redactor();
		DeployReporter reporter = new DeployReporter(deps.sink, log, redactor, run.id, deps.progressIntervalMillis);
		Map<String, Object> result = null;
		ScheduledFuture<?> watchdog = null;
		try {
			Operation op;
			try {
				op = run.kind == Kind.DEPLOY ? prepareDeploy(run, payload, redactor) : prepareRollback(payload);
			} catch (DeployException ex) {
				log.warn("[artifact-deploy " + run.id + "] reddedildi: " + reporter.clean(ex.getMessage()));
				result = rejection(run.id, DeployPayloads.versionHint(payload), ex.getMessage(), startedNanos);
				return;
			}
			watchdog = timer.schedule(() -> {
				if (run.cancel.cancel(CancelToken.Reason.TIMEOUT)) {
					log.warn("[artifact-deploy " + run.id + "] zaman asimi (" + op.timeoutSec + " sn); geri aliniyor");
				}
			}, op.timeoutSec, TimeUnit.SECONDS);
			result = runOperation(op, run, reporter, startedNanos);
		} catch (Throwable unexpected) {
			log.error("[artifact-deploy " + run.id + "] beklenmeyen hata: " + reporter.clean(SafeNames.describe(unexpected)));
			if (result == null) {
				result = rejection(run.id, null, "internal_error: " + SafeNames.describe(unexpected), startedNanos);
			}
		} finally {
			if (watchdog != null) {
				watchdog.cancel(false);
			}
			// Kilit sonuçtan ÖNCE bırakılır: sunucu sonucu alır almaz yeni deploy gönderebilir.
			current.compareAndSet(run, null);
			reporter.result(result != null ? result
				: rejection(run.id, null, "internal_error", startedNanos));
		}
	}

	private Operation prepareDeploy(Run run, Object payload, Redactor redactor) throws DeployException {
		DeployConfig config = configured();
		DeployRequest request = DeployPayloads.parseDeploy(payload);
		for (ComponentSpec component : request.components()) {
			redactor.add(component.download().token());
			if (component.runtimeConfig() != null) {
				component.runtimeConfig().values().forEach(redactor::add);
			}
			for (HookSpec hook : component.preStartHooks()) {
				hook.env().values().forEach(redactor::add);
			}
		}
		for (ComponentSpec component : request.components()) {
			if (!config.isRuntimeAllowed(component.runtime().type())) {
				throw new DeployException("runtime_not_allowed:" + component.runtime().type().wire());
			}
			deps.runtime.validate(component.runtime());
			for (HookSpec hook : component.preStartHooks()) {
				if (!config.isHookCommandAllowed(hook.command())) {
					throw new DeployException("hook_not_allowed:" + hook.name());
				}
			}
		}

		DeployLayout layout = DeployLayout.open(config);
		StateStore store = new StateStore(layout.stateFile());
		List<String> warnings = new ArrayList<>();
		DeployState state = store.load(true, warnings::add);
		String stamp = STAMP.format(Instant.now(deps.clock));

		List<Target> targets = new ArrayList<>();
		for (ComponentSpec component : request.components()) {
			Path live = layout.liveDir(component.subdir());
			ComponentState existing = state.components.get(component.name());
			String previousVersion = existing == null ? null : existing.version;
			Path archiveTo = uniquePrev(layout, component.name() + "-" + dirVersion(previousVersion) + "-" + stamp);

			List<ResolvedHook> hooks = new ArrayList<>();
			for (HookSpec hook : component.preStartHooks()) {
				try {
					hooks.add(new ResolvedHook(hook, deps.commandResolver.resolve(hook.command(), hook.args(), layout.base())));
				} catch (DeployException ex) {
					log.warn("[artifact-deploy " + run.id + "] hook '" + hook.name() + "' komutu cozulemedi: " + ex.getMessage());
					throw new DeployException("hook_command_not_found:" + hook.name());
				}
			}

			Target target = new Target(component.name(), component.subdir(), component.runtime(), component.health(),
				component.version(), previousVersion, live, layout.stagingDir(component.version(), component.name()),
				archiveTo, component.preserve());
			target.spec = component;
			target.download = layout.downloadFile(request.deployId(), component.name());
			target.hooks = hooks;
			targets.add(target);
		}
		return new Operation(Kind.DEPLOY, request.deployId(), request.version(), request.timeoutSec(), layout, store,
			state, targets, config.keepReleases(), warnings);
	}

	private Operation prepareRollback(Object payload) throws DeployException {
		DeployConfig config = configured();
		RollbackRequest request = DeployPayloads.parseRollback(payload);
		DeployLayout layout = DeployLayout.open(config);
		StateStore store = new StateStore(layout.stateFile());
		List<String> warnings = new ArrayList<>();
		DeployState state = store.load(true, warnings::add);

		List<String> names = request.components();
		if (names == null) {
			names = new ArrayList<>();
			for (Map.Entry<String, ComponentState> entry : state.components.entrySet()) {
				if (!entry.getValue().previousReleases.isEmpty()) {
					names.add(entry.getKey());
				}
			}
			if (names.isEmpty()) {
				throw new DeployException("no_previous_release");
			}
		}

		String stamp = STAMP.format(Instant.now(deps.clock));
		List<Target> targets = new ArrayList<>();
		for (String name : names) {
			ComponentState existing = state.components.get(name);
			if (existing == null) {
				throw new DeployException("unknown_component:" + name);
			}
			if (existing.previousReleases.isEmpty()) {
				throw new DeployException("no_previous_release:" + name);
			}
			RuntimeType type = RuntimeType.fromWire(existing.runtimeType);
			if (type == null || existing.subdir == null) {
				throw new DeployException("invalid_state:" + name);
			}
			RuntimeSpec runtime = new RuntimeSpec(type, existing.serviceName, existing.appPool);
			if (!config.isRuntimeAllowed(type)) {
				throw new DeployException("runtime_not_allowed:" + type.wire());
			}
			deps.runtime.validate(runtime);
			HealthSpec health = null;
			if (existing.healthUrl != null) {
				try {
					health = new HealthSpec(URI.create(existing.healthUrl), existing.healthExpectVersionPath,
						existing.healthTimeoutSec == null ? DeployPayloads.DEFAULT_HEALTH_TIMEOUT_SEC : existing.healthTimeoutSec);
				} catch (IllegalArgumentException ex) {
					throw new DeployException("invalid_state:" + name);
				}
			}
			List<String> preserve = new ArrayList<>();
			for (String pattern : existing.preserve) {
				try {
					preserve.add(DeployPayloads.normalizePreservePattern(pattern, "preserve"));
				} catch (DeployException ignored) {
					warnings.add(name + ": state.json'daki gecersiz preserve deseni atlandi");
				}
			}
			PreviousRelease top = existing.previousReleases.get(0);
			Path incoming = layout.prevEntry(top.dir);
			if (!Files.isDirectory(incoming, LinkOption.NOFOLLOW_LINKS)) {
				throw new DeployException("missing_previous_release:" + name);
			}
			String targetVersion = top.version != null && DeployPayloads.VERSION.matcher(top.version).matches() ? top.version : null;
			Path archiveTo = uniquePrev(layout, name + "-" + dirVersion(existing.version) + "-" + stamp + "-rolledback");
			targets.add(new Target(name, existing.subdir, runtime, health, targetVersion, existing.version,
				layout.liveDir(existing.subdir), incoming, archiveTo, preserve));
		}
		return new Operation(Kind.ROLLBACK, request.deployId(), null, DEFAULT_ROLLBACK_TIMEOUT_SEC, layout, store, state,
			targets, config.keepReleases(), warnings);
	}

	private DeployConfig configured() throws DeployException {
		DeployConfig config = deps.config.get();
		if (config == null) {
			throw new DeployException("not_configured");
		}
		if (!config.isConfigured()) {
			throw new DeployException(config.notConfiguredError());
		}
		return config;
	}

	private Map<String, Object> runOperation(Operation op, Run run, DeployReporter reporter, long startedNanos) {
		CancelToken cancel = run.cancel;
		reporter.event(null, Stage.ACCEPTED, Status.DONE, null, op.kind == Kind.DEPLOY
			? op.targets.size() + " bilesen, surum " + op.version
			: "geri alma: " + String.join(", ", op.targets.stream().map(t -> t.name).toList()));
		for (String warning : op.warnings) {
			reporter.event(null, Stage.ACCEPTED, Status.PROGRESS, null, warning);
		}

		Target active = null;
		String failure = null;
		boolean success = false;
		try {
			for (Target target : op.targets) {
				active = target;
				if (op.kind == Kind.DEPLOY) {
					prepareComponent(op, target, cancel, reporter);
				} else {
					target.attempted = true;
					preserve(target, target.incoming, cancel, reporter);
				}
			}
			for (Target target : op.targets) {
				active = target;
				activate(op, target, cancel, reporter);
			}
			active = null;
			commit(op);
			success = true;
		} catch (CancelledException ex) {
			failure = ex.getMessage();
			markFailed(active, ex.getMessage(), reporter);
		} catch (DeployException ex) {
			failure = (active != null ? active.name + ": " : "") + ex.getMessage();
			markFailed(active, ex.getMessage(), reporter);
		} catch (RuntimeException ex) {
			String message = "beklenmeyen hata: " + SafeNames.describe(ex);
			failure = (active != null ? active.name + ": " : "") + message;
			markFailed(active, message, reporter);
		}

		if (!success) {
			List<Target> touched = new ArrayList<>();
			for (Target target : op.targets) {
				if (target.touched()) {
					touched.add(target);
				}
			}
			Collections.reverse(touched);
			for (Target target : touched) {
				restore(target, reporter);
			}
		}
		cleanup(op, reporter, success);
		return buildResult(op, success, failure, startedNanos);
	}

	// ------------------------------------------------------------------ faz 1: hazırlık

	private void prepareComponent(Operation op, Target target, CancelToken cancel, DeployReporter reporter)
			throws DeployException {
		ComponentSpec component = target.spec;
		cancel.throwIfCancelled();
		target.attempted = true;

		begin(target, Stage.DOWNLOADING, reporter, "indiriliyor (" + component.download().size() + " bayt)");
		ArtifactDownloader.deleteQuietly(target.download);
		deps.downloader.download(component.download(), target.download, cancel, new ArtifactDownloader.Listener() {
			@Override
			public void onProgress(long bytes, long total) {
				int percent = (int) Math.min(100, bytes * 100 / Math.max(1, total));
				reporter.progress(target.name, Stage.DOWNLOADING, percent, bytes + "/" + total + " bayt");
			}

			@Override
			public void onRetry(int attempt, String reason) {
				reporter.event(target.name, Stage.DOWNLOADING, Status.PROGRESS, null,
					"deneme " + attempt + " basarisiz (" + reason + "); tekrar deneniyor");
			}
		});
		done(target, reporter, "indirildi");

		cancel.throwIfCancelled();
		begin(target, Stage.VERIFYING, reporter, "sha256 dogrulaniyor");
		Sha256Verifier.Result verified = Sha256Verifier.verifyFile(target.download, target.name, component.download().sha256());
		if (!verified.ok()) {
			throw new DeployException(verified.message());
		}
		done(target, reporter, "sha256 dogrulandi");

		cancel.throwIfCancelled();
		begin(target, Stage.EXTRACTING, reporter, "aciliyor: " + op.layout.base().relativize(target.incoming));
		deleteTree(op.layout.releases(), target.incoming);
		ArtifactExtractor.Stats stats = deps.extractor.extract(target.download, target.incoming, cancel);
		ArtifactDownloader.deleteQuietly(target.download);
		done(target, reporter, stats.files() + " dosya, " + stats.bytes() + " bayt acildi");

		preserve(target, target.incoming, cancel, reporter);

		cancel.throwIfCancelled();
		if (component.runtimeConfig() == null) {
			skip(target, Stage.CONFIGURING, reporter, "runtimeConfig yok");
		} else {
			begin(target, Stage.CONFIGURING, reporter, RuntimeConfigWriter.FILE_NAME + " yaziliyor");
			RuntimeConfigWriter.write(target.incoming, component.runtimeConfig());
			done(target, reporter, RuntimeConfigWriter.FILE_NAME + " yazildi (" + component.runtimeConfig().size() + " anahtar)");
		}
	}

	private void preserve(Target target, Path destination, CancelToken cancel, DeployReporter reporter)
			throws DeployException {
		cancel.throwIfCancelled();
		if (target.preserve.isEmpty()) {
			skip(target, Stage.PRESERVING, reporter, "korunacak desen yok");
			return;
		}
		if (!Files.isDirectory(target.live, LinkOption.NOFOLLOW_LINKS)) {
			skip(target, Stage.PRESERVING, reporter, "canli surum yok (ilk kurulum)");
			return;
		}
		begin(target, Stage.PRESERVING, reporter, target.preserve.size() + " desen");
		PreserveCopier.Result copied = new PreserveCopier(target.preserve, deps.caseInsensitivePaths)
			.copy(target.live, destination, cancel);
		String message = copied.files() + " dosya, " + copied.directories() + " dizin korundu";
		if (!copied.skipped().isEmpty()) {
			message += "; atlanan baglantilar: " + String.join(", ", copied.skipped().subList(0, Math.min(5, copied.skipped().size())));
		}
		done(target, reporter, message);
	}

	// ------------------------------------------------------------------ faz 2: etkinleştirme

	private void activate(Operation op, Target target, CancelToken cancel, DeployReporter reporter) throws DeployException {
		cancel.throwIfCancelled();
		target.attempted = true;
		RuntimeType type = target.runtime.type();

		if (type == RuntimeType.NONE || type == RuntimeType.IIS_STATIC) {
			skip(target, Stage.STOPPING, reporter, "durdurma gerekmiyor (" + type.wire() + ")");
		} else {
			begin(target, Stage.STOPPING, reporter, type.wire() + " " + target.runtime.serviceName() + " durduruluyor");
			target.stopped = true;
			deps.runtime.stop(target.runtime);
			done(target, reporter, "durduruldu");
		}

		cancel.throwIfCancelled();
		begin(target, Stage.SWITCHING, reporter, "yeni surum yerlestiriliyor");
		target.swap = deps.swapper.switchIn(target.live, target.incoming, target.archiveTo);
		done(target, reporter, target.swap.archived() != null
			? "onceki surum .releases/prev/" + target.archiveTo.getFileName() + " olarak saklandi"
			: "ilk kurulum (onceki surum yok)");

		runHooks(op, target, cancel, reporter);

		cancel.throwIfCancelled();
		if (type == RuntimeType.NONE || (type == RuntimeType.IIS_STATIC && target.runtime.appPool() == null)) {
			skip(target, Stage.STARTING, reporter, "baslatma gerekmiyor (" + type.wire() + ")");
		} else {
			begin(target, Stage.STARTING, reporter, type == RuntimeType.IIS_STATIC
				? "app pool " + target.runtime.appPool() + " geri donusturuluyor"
				: type.wire() + " " + target.runtime.serviceName() + " baslatiliyor");
			deps.runtime.start(target.runtime);
			done(target, reporter, "baslatildi");
		}

		if (target.health == null) {
			skip(target, Stage.HEALTH_CHECK, reporter, "health tanimli degil");
		} else {
			cancel.throwIfCancelled();
			begin(target, Stage.HEALTH_CHECK, reporter, "yoklaniyor (en fazla " + target.health.timeoutSec() + " sn)");
			deps.health.check(target.health, expectedVersion(target.health, target.newVersion), cancel);
			done(target, reporter, "saglikli");
		}
	}

	private void runHooks(Operation op, Target target, CancelToken cancel, DeployReporter reporter) throws DeployException {
		if (target.hooks.isEmpty()) {
			// pre_start mesajı yalnızca hook adı taşır; hook yoksa boş.
			skip(target, Stage.PRE_START, reporter, "");
			return;
		}
		for (ResolvedHook hook : target.hooks) {
			cancel.throwIfCancelled();
			HookSpec spec = hook.spec();
			// started/done mesajı yalnızca hook adıdır (komut, argüman ve env değerleri event'e girmez).
			begin(target, Stage.PRE_START, reporter, spec.name());
			Map<String, String> env = new LinkedHashMap<>();
			if (hook.resolved().effectivePath() != null) {
				env.put("Path", hook.resolved().effectivePath());
			}
			env.putAll(spec.env());
			List<String> command = new ArrayList<>(hook.resolved().prefix());
			command.addAll(spec.args());
			target.currentHook = spec.name();
			int[] lines = { 0 };
			Deque<String> tail = new ArrayDeque<>();
			ProcessRunner.Result result = deps.processRunner.run(command, target.live, env,
				Duration.ofSeconds(spec.timeoutSec()), line -> {
					// Çıktı event'e girmez (pre_start mesajı yalnızca hook adı); maskelenmiş ve sınırlı olarak
					// yerel agent loguna yazılır, son satırlar hata mesajına eklenir.
					String clean = reporter.clean(SafeNames.printable(line, MAX_HOOK_LINE_LENGTH));
					synchronized (tail) {
						tail.addLast(clean);
						if (tail.size() > HOOK_TAIL_LINES) {
							tail.removeFirst();
						}
					}
					int count = ++lines[0];
					if (count <= MAX_HOOK_LINES) {
						log.info("[artifact-deploy " + op.deployId + "] " + target.name + " hook '" + spec.name() + "' | " + clean);
					} else if (count == MAX_HOOK_LINES + 1) {
						log.info("[artifact-deploy " + op.deployId + "] " + target.name + " hook '" + spec.name()
							+ "' | cikti kisaltildi (ilk " + MAX_HOOK_LINES + " satir loglandi)");
					}
				}, cancel);
			String outputTail;
			synchronized (tail) {
				outputTail = tail.isEmpty() ? "" : "; son cikti: " + String.join(" | ", tail);
			}
			if (result.timedOut()) {
				throw new DeployException("hook '" + spec.name() + "' " + spec.timeoutSec()
					+ " sn icinde bitmedi; surec agaci sonlandirildi" + outputTail);
			}
			if (result.exitCode() != 0) {
				throw new DeployException("hook '" + spec.name() + "' basarisiz (cikis kodu " + result.exitCode() + ")" + outputTail);
			}
			target.currentHook = null;
			done(target, reporter, spec.name());
		}
	}

	private void commit(Operation op) throws DeployException {
		String now = Instant.now(deps.clock).toString();
		for (Target target : op.targets) {
			if (op.kind == Kind.DEPLOY) {
				ComponentState state = op.state.components.computeIfAbsent(target.name, key -> new ComponentState());
				if (target.swap.archived() != null) {
					state.previousReleases.add(0, new PreviousRelease(target.previousVersion,
						target.swap.archived().getFileName().toString(), now));
				}
				state.version = target.newVersion;
				state.deployedAt = now;
				state.deployId = op.deployId;
				state.subdir = target.subdir;
				state.runtimeType = target.runtime.type().wire();
				state.serviceName = target.runtime.serviceName();
				state.appPool = target.runtime.appPool();
				state.healthUrl = target.health == null ? null : target.health.url().toString();
				state.healthExpectVersionPath = target.health == null ? null : target.health.expectVersionPath();
				state.healthTimeoutSec = target.health == null ? null : target.health.timeoutSec();
				state.preserve = new ArrayList<>(target.preserve);
				while (state.previousReleases.size() > op.keepReleases) {
					op.pruneDirs.add(state.previousReleases.remove(state.previousReleases.size() - 1).dir);
				}
				state.syncPreviousVersions();
			} else {
				ComponentState state = op.state.components.get(target.name);
				state.previousReleases.remove(0);
				state.version = target.newVersion;
				state.deployedAt = now;
				state.deployId = op.deployId;
				state.syncPreviousVersions();
				if (target.swap.archived() != null) {
					op.pruneDirs.add(target.swap.archived().getFileName().toString());
				}
			}
		}
		op.store.save(op.state);
	}

	// ------------------------------------------------------------------ geri alma ve temizlik

	/** Dokunulmuş bir bileşeni önceki durumuna döndürür. İptal edilemez; hatalar raporlanır. */
	private void restore(Target target, DeployReporter reporter) {
		reporter.event(target.name, Stage.ROLLING_BACK, Status.STARTED, null, target.swap != null
			? "onceki duruma donuluyor" + (target.previousVersion != null ? " (" + target.previousVersion + ")" : "")
			: "servis yeniden baslatiliyor");
		List<String> problems = new ArrayList<>();
		RuntimeType type = target.runtime.type();
		boolean oldAvailable = true;
		if (target.swap != null) {
			if (type != RuntimeType.NONE && type != RuntimeType.IIS_STATIC) {
				try {
					deps.runtime.stop(target.runtime);
				} catch (DeployException ex) {
					problems.add("durdurma: " + ex.getMessage());
				}
			}
			try {
				deps.swapper.revert(target.swap);
				target.reverted = true;
			} catch (DeployException ex) {
				problems.add("geri alma: " + ex.getMessage());
			}
			oldAvailable = target.swap.archived() != null;
		}
		boolean restarted = false;
		if (oldAvailable && type != RuntimeType.NONE && (target.stopped || target.reverted)) {
			try {
				deps.runtime.start(target.runtime);
				restarted = true;
			} catch (DeployException ex) {
				problems.add("baslatma: " + ex.getMessage());
			}
		}
		if (oldAvailable && target.health != null && problems.isEmpty() && (restarted || target.reverted)) {
			try {
				deps.health.check(target.health, expectedVersion(target.health, target.previousVersion), CancelToken.none());
			} catch (DeployException ex) {
				problems.add("health: " + ex.getMessage());
			}
		}
		if (problems.isEmpty()) {
			reporter.event(target.name, Stage.ROLLING_BACK, Status.DONE, null, target.reverted
				? (oldAvailable ? "onceki surum geri yuklendi" : "yeni surum kaldirildi (onceki surum yoktu)")
				: "servis yeniden baslatildi");
		} else {
			target.rollbackError = String.join("; ", problems);
			reporter.event(target.name, Stage.ROLLING_BACK, Status.FAILED, null, target.rollbackError);
		}
	}

	private void cleanup(Operation op, DeployReporter reporter, boolean success) {
		List<String> problems = new ArrayList<>();
		int removed = 0;
		for (Target target : op.targets) {
			if (target.download != null) {
				try {
					Files.deleteIfExists(target.download);
				} catch (IOException ex) {
					problems.add(target.download.getFileName() + ": " + SafeNames.describe(ex));
				}
			}
			if (op.kind == Kind.DEPLOY && Files.exists(target.incoming, LinkOption.NOFOLLOW_LINKS)) {
				try {
					deleteTree(op.layout.releases(), target.incoming);
					removed++;
				} catch (DeployException ex) {
					problems.add(ex.getMessage());
				}
			}
			if (op.kind == Kind.DEPLOY) {
				deleteIfEmpty(target.incoming.getParent(), op.layout.releases());
			}
		}
		if (success) {
			for (String dir : op.pruneDirs) {
				try {
					Path entry = op.layout.prevEntry(dir);
					if (Files.exists(entry, LinkOption.NOFOLLOW_LINKS)) {
						deleteTree(op.layout.prev(), entry);
						removed++;
					}
				} catch (DeployException ex) {
					problems.add(ex.getMessage());
				}
			}
		}
		reporter.event(null, Stage.CLEANUP, Status.DONE, null, removed + " gecici/eski dizin silindi"
			+ (problems.isEmpty() ? "" : "; silinemeyenler: " + String.join("; ", problems)));
	}

	private Map<String, Object> buildResult(Operation op, boolean success, String failure, long startedNanos) {
		List<Map<String, Object>> components = new ArrayList<>();
		boolean anyRolledBack = false;
		for (Target target : op.targets) {
			boolean rolledBack = op.kind == Kind.DEPLOY ? target.reverted : success && target.swap != null;
			anyRolledBack |= rolledBack;
			Map<String, Object> component = new LinkedHashMap<>();
			component.put("name", target.name);
			component.put("success", success);
			component.put("rolledBack", rolledBack);
			component.put("previousVersion", target.previousVersion);
			component.put("error", success ? null : componentError(target));
			components.add(component);
		}
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("deployId", op.deployId);
		result.put("success", success);
		result.put("version", op.kind == Kind.DEPLOY ? op.version : commonVersion(op));
		result.put("rolledBack", anyRolledBack);
		result.put("durationMs", elapsedMillis(startedNanos));
		result.put("components", components);
		result.put("error", success ? null : (failure == null ? "bilinmeyen hata" : failure));
		return result;
	}

	private static String componentError(Target target) {
		String base;
		if (target.error != null) {
			base = target.error;
		} else if (target.reverted) {
			base = "baska bir bilesen basarisiz oldugu icin geri alindi";
		} else {
			base = "uygulanmadi (islem durduruldu)";
		}
		return target.rollbackError == null ? base : base + "; geri alma sorunu: " + target.rollbackError;
	}

	private static String commonVersion(Operation op) {
		String version = null;
		for (Target target : op.targets) {
			if (target.newVersion == null || (version != null && !version.equals(target.newVersion))) {
				return null;
			}
			version = target.newVersion;
		}
		return version;
	}

	private static Map<String, Object> rejection(String deployId, String version, String error, long startedNanos) {
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("deployId", deployId);
		result.put("success", false);
		result.put("version", version);
		result.put("rolledBack", false);
		result.put("durationMs", elapsedMillis(startedNanos));
		result.put("components", new ArrayList<>());
		result.put("error", error);
		return result;
	}

	private static long elapsedMillis(long startedNanos) {
		return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedNanos);
	}

	// ------------------------------------------------------------------ artifact_status

	private void status(Object payload) {
		String requestId = DeployPayloads.rawId(payload, "requestId");
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("requestId", requestId);
		result.put("basePath", null);
		result.put("components", new LinkedHashMap<String, Object>());
		DeployConfig config = deps.config.get();
		if (!DeployPayloads.isValidRequestId(requestId)) {
			result.put("error", "invalid_payload: requestId gecersiz");
		} else if (config == null || !config.isConfigured()) {
			result.put("error", config == null ? "not_configured" : config.notConfiguredError());
		} else {
			result.put("basePath", config.basePath().toString());
			try {
				DeployState state = new StateStore(DeployLayout.stateFileFor(config)).load(false, warning -> { });
				Map<String, Object> components = new LinkedHashMap<>();
				for (Map.Entry<String, ComponentState> entry : state.components.entrySet()) {
					Map<String, Object> component = new LinkedHashMap<>();
					component.put("version", entry.getValue().version);
					component.put("deployedAt", entry.getValue().deployedAt);
					component.put("previousVersions", new ArrayList<>(entry.getValue().previousVersions));
					components.put(entry.getKey(), component);
				}
				result.put("components", components);
			} catch (IOException ex) {
				result.put("error", "not_configured: deploy.base-path okunamadi");
			} catch (DeployException ex) {
				result.put("error", ex.getMessage());
			}
		}
		try {
			deps.sink.send(STATUS_RESULT, result);
		} catch (RuntimeException ex) {
			log.warn("[artifact-deploy] artifact_status_result gonderilemedi: " + SafeNames.describe(ex));
		}
	}

	// ------------------------------------------------------------------ yardımcılar

	private static void begin(Target target, Stage stage, DeployReporter reporter, String message) {
		target.stage = stage;
		reporter.event(target.name, stage, Status.STARTED, null, message);
	}

	private static void done(Target target, DeployReporter reporter, String message) {
		reporter.event(target.name, target.stage, Status.DONE, null, message);
	}

	private static void skip(Target target, Stage stage, DeployReporter reporter, String message) {
		reporter.event(target.name, stage, Status.SKIPPED, null, message);
	}

	private static void markFailed(Target target, String message, DeployReporter reporter) {
		if (target == null) {
			reporter.event(null, Stage.SWITCHING, Status.FAILED, null, message);
			return;
		}
		target.error = message;
		Stage stage = target.stage == null ? Stage.ACCEPTED : target.stage;
		// pre_start olayında mesaj yalnızca hook adıdır (sözleşme); ayrıntı sonuçtaki error alanında.
		String eventMessage = stage == Stage.PRE_START && target.currentHook != null ? target.currentHook : message;
		reporter.event(target.name, stage, Status.FAILED, null, eventMessage);
	}

	private static String expectedVersion(HealthSpec health, String version) {
		return health.expectVersionPath() == null ? null : version;
	}

	private static String dirVersion(String version) {
		return version != null && DeployPayloads.VERSION.matcher(version).matches() && SafeNames.isSafeSegment(version)
			? version : "unknown";
	}

	private static Path uniquePrev(DeployLayout layout, String name) throws DeployException {
		Path candidate = layout.prevEntry(name);
		for (int i = 2; Files.exists(candidate, LinkOption.NOFOLLOW_LINKS); i++) {
			candidate = layout.prevEntry(name + "-" + i);
		}
		return candidate;
	}

	private static void deleteIfEmpty(Path dir, Path root) {
		if (dir == null || !dir.startsWith(root) || dir.equals(root)) {
			return;
		}
		try (var entries = Files.list(dir)) {
			if (entries.findAny().isEmpty()) {
				Files.delete(dir);
			}
		} catch (IOException ignored) {
			// Boş değil ya da zaten yok.
		}
	}

	/** {@code root} altındaki bir ağacı bağlantıları izlemeden siler (salt okunur dosyalar dahil). */
	static void deleteTree(Path root, Path path) throws DeployException {
		if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
			return;
		}
		DeployLayout.requireInside(root, path);
		try {
			Files.walkFileTree(path, new SimpleFileVisitor<Path>() {
				@Override
				public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
					deleteOne(file);
					return FileVisitResult.CONTINUE;
				}

				@Override
				public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
					if (exc != null) {
						throw exc;
					}
					deleteOne(dir);
					return FileVisitResult.CONTINUE;
				}
			});
		} catch (IOException ex) {
			throw new DeployException(path.getFileName() + " silinemedi: " + SafeNames.describe(ex));
		}
	}

	private static void deleteOne(Path path) throws IOException {
		try {
			Files.delete(path);
		} catch (AccessDeniedException ex) {
			try {
				Files.setAttribute(path, "dos:readonly", false, LinkOption.NOFOLLOW_LINKS);
			} catch (IOException | UnsupportedOperationException | IllegalArgumentException ignored) {
				throw ex;
			}
			Files.delete(path);
		}
	}
}
