package com.idp.agent.managers;

import com.google.gson.Gson;
import com.google.gson.JsonParseException;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.handshake.ServerHandshake;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import com.idp.agent.connection.AgentConnectionConfig;
import com.idp.agent.connection.GatewayRejection;
import com.idp.agent.connection.ReconnectBackoff;
import com.idp.agent.dto.Message;
import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.logging.AdvancedLogger;
import com.idp.agent.utilities.SystemUtilities;
import com.idp.agent.handlers.MessageHandlers.AgentUpdateMessageHandler;
import com.idp.agent.handlers.MessageHandlers.GetAppConfigMessageHandler;
import com.idp.agent.handlers.MessageHandlers.GetAppLogsMessageHandler;
import com.idp.agent.handlers.MessageHandlers.HandshakeAckMessageHandler;
import com.idp.agent.handlers.MessageHandlers.PongMessageHandler;
import com.idp.agent.handlers.MessageHandlers.RestartAppMessageHandler;
import com.idp.agent.handlers.MessageHandlers.UpdateAppConfigMessageHandler;
import com.idp.agent.handlers.MessageHandlers.UpdateMessageHandler;
import com.idp.agent.handlers.MessageHandlers.UploadLanguagesMessageHandler;
import com.idp.agent.handlers.MessageHandlers.RunDeployMessageHandler;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.enums.MessageProcess;


public class WebSocketManager {
	private static WebSocketManager instance;

	/**
	 * Uygulama seviyesi ping aralığı. Cloudflare Tunnel / nginx boşta kalan WebSocket'i ~60-100 sn'de
	 * kapatabildiği için 60 sn'nin belirgin altında tutulur.
	 */
	static final long PING_INTERVAL_SECONDS = 20;
	static final long PING_INITIAL_DELAY_SECONDS = 3;

	private volatile WebSocketClient wsClient;
	private final AgentManager agentManager = AgentManager.getInstance();
	private final AdvancedLogger log = AdvancedLogger.getInstance();
	private final SystemUtilities systemUtilities = SystemUtilities.getInstance();

	private final Gson gson = new Gson();

	private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
		Thread t = new Thread(r, "ws-manager");
		t.setDaemon(true);
		return t;
	});

	private ScheduledFuture<?> pingFuture;
	private ScheduledFuture<?> reconnectFuture;

	private final AgentConnectionConfig connectionConfig;
	private final String agentId;
	private final ReconnectBackoff backoff = new ReconnectBackoff();

	// Message reuse pool
	private Message cachedPingMessage;

	private final Map<String, MessageHandler> messageHandlers = new HashMap<>();

	private WebSocketManager(AgentConnectionConfig connectionConfig) {
		this.connectionConfig = connectionConfig;
		this.agentId = connectionConfig.getAgentId();
		initializeHandlers();
	}

	private void initializeHandlers() {
		messageHandlers.put(MessageProcess.PONG.getValue(), new PongMessageHandler());
		messageHandlers.put(MessageProcess.HANDSHAKE_ACK.getValue(), new HandshakeAckMessageHandler());
		messageHandlers.put(MessageProcess.UPDATE.getValue(), new UpdateMessageHandler());
		messageHandlers.put(MessageProcess.GET_APP_CONFIG.getValue(), new GetAppConfigMessageHandler());
		messageHandlers.put(MessageProcess.UPDATE_APP_CONFIG.getValue(), new UpdateAppConfigMessageHandler());
		messageHandlers.put(MessageProcess.RESTART_APP.getValue(), new RestartAppMessageHandler());
		messageHandlers.put(MessageProcess.GET_APP_LOGS.getValue(), new GetAppLogsMessageHandler());
		messageHandlers.put(MessageProcess.UPDATE_AGENT.getValue(), new AgentUpdateMessageHandler());
		messageHandlers.put(MessageProcess.RUN_DEPLOY.getValue(), new RunDeployMessageHandler());
		messageHandlers.put(MessageProcess.UPLOAD_LANGUAGES.getValue(), new UploadLanguagesMessageHandler());
	}

	// Singleton getter
	public static synchronized WebSocketManager getInstance(AgentConnectionConfig connectionConfig) {
		if (instance == null) {
			instance = new WebSocketManager(connectionConfig);
		}
		return instance;
	}

	public static synchronized WebSocketManager getInstance() {
		if (instance == null) {
			throw new IllegalStateException("WebSocketManager henüz başlatılmamış!");
		}
		return instance;
	}

	/**
	 * server.proxy tanımlıysa bağlantıyı HTTP CONNECT proxy üzerinden kurar. DNS çözücü kapatılır ki
	 * hedef ad (agent.&lt;alan&gt;) yerelde değil proxy'de çözülsün; CONNECT satırına IP değil host adı
	 * yazılır. wss'de TLS, tünel içinde kütüphanenin varsayılan SSLContext'i ve hostname doğrulamasıyla
	 * kurulur (WebSocketClient.upgradeSocketToSSL / onSetSSLParameters).
	 */
	static void applyProxy(WebSocketClient client, AgentConnectionConfig config) {
		if (!config.hasProxy()) {
			return;
		}
		client.setProxy(new Proxy(Proxy.Type.HTTP,
			new InetSocketAddress(config.getProxyHost(), config.getProxyPort())));
		client.setDnsResolver(null);
	}

	// WebSocket’e bağlan
	public synchronized void connect() {
		if (wsClient != null && wsClient.isOpen()) {
			log.debug("Zaten bağlı; connect() çağrısı atlandı.");
			return;
		}

		try {
			WebSocketClient client = new WebSocketClient(
					new URI(connectionConfig.getServerUrl()), new HashMap<>(connectionConfig.upgradeHeaders())) {
				@Override
				public void onOpen(ServerHandshake handshakedata) {
					log.success("WebSocket sunucusuna bağlandı.");
					// Eğer bir reconnect görevi beklemede ise iptal et
					cancelPendingReconnect();
					sendHandshake();
					startPingLoop();
				}

				@Override
				public void onMessage(String message) {
					handleMessage(message);
				}

				@Override
				public void onClose(int code, String reason, boolean remote) {
					stopPingLoop();
					GatewayRejection rejection = GatewayRejection.classify(code, reason);
					if (rejection.isAuthFailure()) {
						String detail = rejection == GatewayRejection.POLICY_1008 && reason != null && !reason.isBlank()
							? " Sunucu nedeni: " + reason
							: "";
						log.error(rejection.logMessage() + detail);
						scheduleReconnect(true);
						return;
					}
					log.warn("Sunucuyla bağlantı kapandı: " + reason + " (code=" + code + ")");
					scheduleReconnect(false);
				}

				@Override
				public void onError(Exception ex) {
					log.error("WebSocket hatası: " + ex.getMessage());
					stopPingLoop();
					scheduleReconnect(false);
				}
			};
			applyProxy(client, connectionConfig);

			wsClient = client;
			client.connect();

		} catch (Exception e) {
			log.error("WebSocket bağlantısı başarısız: " + e.getMessage());
			scheduleReconnect(false);
		}
	}

	private void sendHandshake() {
		String detailedOsInfo = OperatingSystem.getDetailedInfo();
		String agentVersion = agentManager.getVersion();

		Map<String, Object> payload = new HashMap<>();
		payload.put("version", "");
		payload.put("os_info", detailedOsInfo);
		payload.put("agent_version", agentVersion);

		this.sendMessage("handshake", payload);
		log.info("El sıkışma (handshake) mesajı gönderildi. agentId=" + agentId);
	}

	private synchronized void startPingLoop() {
		stopPingLoop();
		pingFuture = scheduler.scheduleAtFixedRate(() -> {
			// scheduleAtFixedRate, görev bir kez exception fırlatırsa sessizce durur; bu yüzden korunur.
			try {
				WebSocketClient client = wsClient;
				if (client != null && client.isOpen()) {
					Map<String, Object> systemStatus = systemUtilities.getSystemStatus();
					log.debug("systemStatus --> " + systemStatus);
					if (cachedPingMessage == null) {
						cachedPingMessage = new Message(null, "agent", agentId, "ping", systemStatus);
					}
					cachedPingMessage.updatePayload(systemStatus);

					client.send(gson.toJson(cachedPingMessage));
				}
			} catch (WebsocketNotConnectedException ex) {
				log.debug("Ping gönderilemedi; bağlantı kapanıyor.");
			} catch (RuntimeException ex) {
				log.warn("Ping gönderilirken hata: " + ex.getMessage());
			}
		}, PING_INITIAL_DELAY_SECONDS, PING_INTERVAL_SECONDS, TimeUnit.SECONDS);
	}

	private synchronized void stopPingLoop() {
		if (pingFuture != null && !pingFuture.isDone()) {
			pingFuture.cancel(true);
		}
		pingFuture = null;
	}

	private void handleMessage(String message) {
		Message msg;
		try {
			msg = gson.fromJson(message, Message.class);
		} catch (JsonParseException ex) {
			log.warn("Sunucudan çözümlenemeyen mesaj geldi: " + ex.getMessage());
			return;
		}
		if (msg == null || msg.getProcess() == null) {
			log.warn("Sunucudan türü olmayan mesaj geldi.");
			return;
		}
		log.info("Sunucudan mesaj alındı.Tür: " + msg.getProcess());

		if (!"server".equals(msg.getType())) {
			log.warn("Bilinmeyen kaynaktan mesaj geldi: " + message);
			return;
		}

		MessageHandler handler = messageHandlers.get(msg.getProcess());
		if (handler != null) {
			handler.handle(msg);
		} else {
			log.warn("Bilinmeyen mesaj türü: " + msg.getProcess());
		}

		if (MessageProcess.HANDSHAKE_ACK.getValue().equals(msg.getProcess())) {
			// Gateway kimliği kabul etti: sonraki kopmada backoff baştan (10 sn) başlasın.
			backoff.reset();
		}
	}

	private synchronized void cancelPendingReconnect() {
		if (reconnectFuture != null && !reconnectFuture.isDone()) {
			reconnectFuture.cancel(false);
		}
		reconnectFuture = null;
	}

	/**
	 * @param authFailure gateway kimliği reddettiyse true: doğrudan üst sınır (300 sn) beklenir ve
	 *                    daha kısa süreli bekleyen bir deneme varsa onun yerine geçer.
	 */
	private synchronized void scheduleReconnect(boolean authFailure) {
		if (scheduler.isShutdown()) {
			return;
		}
		WebSocketClient client = wsClient;
		if (client != null && client.isOpen()) {
			return; // zaten bağlı
		}
		// Zaten planlanmış bir reconnect varsa tekrar ekleme (kimlik reddi hariç)
		if (reconnectFuture != null && !reconnectFuture.isDone()) {
			if (!authFailure) {
				return;
			}
			reconnectFuture.cancel(false);
		}

		long delayMillis = authFailure ? backoff.authFailureDelayMillis() : backoff.nextDelayMillis();
		log.warn("Yeniden bağlanma " + Math.round(delayMillis / 1000.0) + " sn sonra denenecek.");
		reconnectFuture = scheduler.schedule(() -> {
			log.info("Yeniden bağlanma denemesi başlatıldı.");
			connect();
		}, delayMillis, TimeUnit.MILLISECONDS);
	}

	// Opsiyonel: dışarıdan kapatma için
	public synchronized void shutdown() {
		stopPingLoop();
		cancelPendingReconnect();
		scheduler.shutdownNow();
	}

	public void sendMessage(String process, Map<String, ?> payload) {
		WebSocketClient client = wsClient;
		if (client == null || !client.isOpen()) {
			log.warn("Gateway bağlantısı yok; '" + process + "' mesajı gönderilemedi.");
			return;
		}

		Message sendMessage = new Message(
			LocalDateTime.now(),
			"agent",
			this.agentId,
			process,
			payload
		);

		try {
			client.send(gson.toJson(sendMessage));
		} catch (WebsocketNotConnectedException ex) {
			log.warn("Gateway bağlantısı koptu; '" + process + "' mesajı gönderilemedi.");
		}
	}
}
