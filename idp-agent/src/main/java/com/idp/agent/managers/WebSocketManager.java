package com.idp.agent.managers;

import com.google.gson.Gson;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

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

	private WebSocketClient wsClient;
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

	private final String serverUrl;
	private final String serverToken;
	private final String agentId;
	private final int RECONNECT_INTERVAL = 10_000; // 10 saniye
	
	// Message reuse pool
	private Message cachedPingMessage;

	private final Map<String, MessageHandler> messageHandlers = new HashMap<>();

	private WebSocketManager(String serverUrl, String serverToken, String agentId) {
		this.serverUrl = serverUrl;
		this.serverToken = serverToken;
		this.agentId = agentId;
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
	public static synchronized WebSocketManager getInstance(String serverUrl, String serverToken, String agentId) {
		if (instance == null) {
			instance = new WebSocketManager(serverUrl, serverToken, agentId);
		}
		return instance;
	}

	public static synchronized WebSocketManager getInstance() {
		if (instance == null) {
			throw new IllegalStateException("WebSocketManager henüz başlatılmamış!");
		}
		return instance;
	}

	// WebSocket’e bağlan
	public synchronized void connect() {
		if (wsClient != null && wsClient.isOpen()) {
			log.debug("Zaten bağlı; connect() çağrısı atlandı.");
			return;
		}

		try {
			Map<String, String> headers = new HashMap<>();
			if (serverToken != null && !serverToken.isBlank()) headers.put("Authorization", "Bearer " + serverToken);
			wsClient = new WebSocketClient(new URI(serverUrl), headers) {
				@Override
				public void onOpen(ServerHandshake handshakedata) {
					log.success("WebSocket sunucusuna bağlandı.");
					// Eğer bir reconnect görevi beklemede ise iptal et
					if (reconnectFuture != null && !reconnectFuture.isDone()) {
						reconnectFuture.cancel(true);
						reconnectFuture = null;
					}
					sendHandshake();
					startPingLoop();
				}

				@Override
				public void onMessage(String message) {
					handleMessage(message);
				}

				@Override
				public void onClose(int code, String reason, boolean remote) {
					log.warn("Sunucuyla bağlantı kapandı: " + reason + " (code=" + code + ")");
					stopPingLoop();
					scheduleReconnect();
				}

				@Override
				public void onError(Exception ex) {
					log.error("WebSocket hatası: " + ex.getMessage());
					log.warn("10 saniye içinde yeniden bağlanılacak.");
					stopPingLoop();
					scheduleReconnect();
				}
			};

			wsClient.connect();

		} catch (Exception e) {
			log.error("WebSocket bağlantısı başarısız: " + e.getMessage());
			scheduleReconnect();
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

	private void startPingLoop() {
		stopPingLoop();
		pingFuture = scheduler.scheduleAtFixedRate(() -> {
			if (wsClient != null && wsClient.isOpen()) {
				Map<String, Object> systemStatus = systemUtilities.getSystemStatus();
				log.debug("systemStatus --> " + systemStatus);
				if (cachedPingMessage == null) {
					cachedPingMessage = new Message(null, "agent", agentId, "ping", systemStatus);
				}
				cachedPingMessage.updatePayload(systemStatus);
				
				wsClient.send(gson.toJson(cachedPingMessage));
			}
		}, 3, 3, TimeUnit.SECONDS);
	}

	private void stopPingLoop() {
		if (pingFuture != null && !pingFuture.isDone()) {
			pingFuture.cancel(true);
		}
		pingFuture = null;
	}

	private void handleMessage(String message) {
		Message msg = gson.fromJson(message, Message.class);
		log.info("Sunucudan mesaj alındı.Tür: " + msg.getProcess());

		if(!msg.getType().equals("server")) {
			log.warn("Bilinmeyen kaynaktan mesaj geldi: " + message);
			return;
		}

		MessageHandler handler = messageHandlers.get(msg.getProcess());
		if (handler != null) {
			handler.handle(msg);
		} else {
			log.warn("Bilinmeyen mesaj türü: " + msg.getProcess());
		}
	}

	private void scheduleReconnect() {
		if (wsClient != null && wsClient.isOpen()) {
			return; // zaten bağlı
		}
		// Zaten planlanmış bir reconnect varsa tekrar ekleme
		if (reconnectFuture != null && !reconnectFuture.isDone()) {
			return;
		}
		reconnectFuture = scheduler.schedule(() -> {
			log.info("Yeniden bağlanma denemesi başlatıldı.");
			connect();
		}, RECONNECT_INTERVAL, TimeUnit.MILLISECONDS);
	}

	// Opsiyonel: dışarıdan kapatma için
	public void shutdown() {
		stopPingLoop();
		if (reconnectFuture != null && !reconnectFuture.isDone()) {
			reconnectFuture.cancel(true);
		}
		reconnectFuture = null;
		scheduler.shutdownNow();
	}

	public void sendMessage(String process, Map<String, ?> payload) {
		if (wsClient != null && wsClient.isOpen()) {

			Message sendMessage = new Message(
				LocalDateTime.now(),
				"agent",
				this.agentId,
				process,
				payload
			);

			wsClient.send(gson.toJson(sendMessage));
		}
	}
}
