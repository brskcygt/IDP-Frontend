package com.idp.agent.deploy;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Tek bir deploy işleminin {@code deploy_event} mesajlarını ve TEK terminal {@code deploy_result}'ını
 * üretir. Tüm metinler {@link Redactor}'dan geçer; ilerleme olayları saniyede en fazla bir kez gönderilir.
 */
final class DeployReporter {
	static final String EVENT = "deploy_event";
	static final String RESULT = "deploy_result";
	static final int MAX_MESSAGE = 1000;

	enum Stage {
		ACCEPTED("accepted"),
		DOWNLOADING("downloading"),
		VERIFYING("verifying"),
		EXTRACTING("extracting"),
		PRESERVING("preserving"),
		CONFIGURING("configuring"),
		STOPPING("stopping"),
		SWITCHING("switching"),
		PRE_START("pre_start"),
		STARTING("starting"),
		HEALTH_CHECK("health_check"),
		ROLLING_BACK("rolling_back"),
		CLEANUP("cleanup");

		final String wire;

		Stage(String wire) {
			this.wire = wire;
		}
	}

	enum Status {
		STARTED, PROGRESS, DONE, FAILED, SKIPPED;

		String wire() {
			return name().toLowerCase(Locale.ROOT);
		}
	}

	/** Mesaj çıkışı (varsayılan: WebSocketManager, null alanlar korunarak). */
	interface Sink {
		void send(String process, Map<String, Object> payload);
	}

	private final Sink sink;
	private final DeployLog log;
	private final Redactor redactor;
	private final String deployId;
	private final String eventProcess;
	private final String resultProcess;
	private final long progressIntervalNanos;
	private final AtomicBoolean finished = new AtomicBoolean();
	private long lastProgressNanos;
	private boolean progressSent;

	DeployReporter(Sink sink, DeployLog log, Redactor redactor, String deployId, long progressIntervalMillis) {
		this(sink, log, redactor, deployId, progressIntervalMillis, EVENT, RESULT);
	}

	DeployReporter(Sink sink, DeployLog log, Redactor redactor, String deployId, long progressIntervalMillis,
			String eventProcess, String resultProcess) {
		this.sink = sink;
		this.log = log;
		this.redactor = redactor;
		this.deployId = deployId;
		this.eventProcess = eventProcess;
		this.resultProcess = resultProcess;
		this.progressIntervalNanos = Math.max(0, progressIntervalMillis) * 1_000_000L;
	}

	String clean(String message) {
		return SafeNames.printable(redactor.apply(message == null ? "" : message), MAX_MESSAGE);
	}

	void event(String component, Stage stage, Status status, Integer progress, String message) {
		String text = clean(message);
		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("deployId", deployId);
		payload.put("component", component);
		payload.put("stage", stage.wire);
		payload.put("status", status.wire());
		payload.put("progress", progress);
		payload.put("message", text);
		send(eventProcess, payload);
		if (status != Status.PROGRESS) {
			String line = "[artifact-deploy " + deployId + "] " + (component == null ? "" : component + " ")
				+ stage.wire + " " + status.wire() + (text.isEmpty() ? "" : ": " + text);
			if (status == Status.FAILED) {
				log.warn(line);
			} else {
				log.info(line);
			}
		}
	}

	/** Kısılmış ilerleme olayı (≤ 1/sn). */
	synchronized void progress(String component, Stage stage, int percent, String message) {
		long now = System.nanoTime();
		if (progressSent && now - lastProgressNanos < progressIntervalNanos) {
			return;
		}
		progressSent = true;
		lastProgressNanos = now;
		event(component, stage, Status.PROGRESS, Math.max(0, Math.min(100, percent)), message);
	}

	boolean isFinished() {
		return finished.get();
	}

	/** Terminal sonucu gönderir; ikinci çağrı yok sayılır (deployId başına tek sonuç). */
	boolean result(Map<String, Object> payload) {
		if (!finished.compareAndSet(false, true)) {
			log.warn("[artifact-deploy " + deployId + "] ikinci deploy_result engellendi");
			return false;
		}
		Object error = payload.get("error");
		if (error instanceof String text) {
			payload.put("error", clean(text));
		}
		send(resultProcess, payload);
		log.info("[artifact-deploy " + deployId + "] sonuc: success=" + payload.get("success")
			+ (payload.get("error") == null ? "" : ", error=" + payload.get("error")));
		return true;
	}

	private void send(String process, Map<String, Object> payload) {
		try {
			sink.send(process, payload);
		} catch (RuntimeException ex) {
			log.warn("[artifact-deploy " + deployId + "] '" + process + "' gonderilemedi: " + SafeNames.describe(ex));
		}
	}
}
