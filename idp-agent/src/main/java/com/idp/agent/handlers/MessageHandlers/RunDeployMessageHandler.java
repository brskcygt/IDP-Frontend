package com.idp.agent.handlers.MessageHandlers;

import com.idp.agent.ConfigLoader;
import com.idp.agent.dto.Message;
import com.idp.agent.handlers.MessageHandlers.abstracts.MessageHandler;
import com.idp.agent.managers.WebSocketManager;

import java.io.File;
import java.io.Reader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class RunDeployMessageHandler implements MessageHandler {
  @Override
  public void handle(Message message) {
    Object rawPayload = message.getPayload();
    if (!(rawPayload instanceof Map<?, ?> payload) || !(payload.get("command") instanceof String command) || command.isBlank()) {
      sendResult(false, "Deployment komutu boş veya geçersiz.", -1);
      return;
    }

    Thread worker = new Thread(() -> run(command), "idp-deployment-command");
    worker.setDaemon(true);
    worker.start();
  }

  private void run(String command) {
    try {
      boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
      List<String> shell = windows
        ? List.of("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command)
        : List.of("/bin/sh", "-lc", command);
      ProcessBuilder builder = new ProcessBuilder(shell);
      builder.directory(new File(ConfigLoader.getInstance().getAppPath()));
      builder.redirectErrorStream(true);
      Process process = builder.start();

      long startedAt = System.nanoTime();
      ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "idp-deploy-heartbeat");
        thread.setDaemon(true);
        return thread;
      });
      heartbeat.scheduleAtFixedRate(() -> {
        long seconds = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - startedAt);
        sendLog("Komut çalışıyor… " + seconds + " saniye geçti.");
      }, 10, 10, TimeUnit.SECONDS);

      try (Reader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
        char[] chunk = new char[512];
        StringBuilder pending = new StringBuilder();
        int count;
        while ((count = reader.read(chunk)) != -1) {
          for (int index = 0; index < count; index++) {
            char value = chunk[index];
            if (value == '\n' || value == '\r') {
              flushLog(pending);
            } else {
              pending.append(value);
              if (pending.length() >= 512) flushLog(pending);
            }
          }
        }
        flushLog(pending);
      } finally {
        heartbeat.shutdownNow();
      }
      int exitCode = process.waitFor();
      sendResult(exitCode == 0, exitCode == 0 ? "Deployment tamamlandı." : "Deployment başarısız.", exitCode);
    } catch (Exception error) {
      sendResult(false, error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(), -1);
    }
  }

  private void sendLog(String line) {
    Map<String, Object> payload = new HashMap<>();
    payload.put("logs", List.of(line));
    WebSocketManager.getInstance().sendMessage("app_logs", payload);
  }

  private void flushLog(StringBuilder pending) {
    if (pending.length() == 0) return;
    String line = pending.toString().trim();
    pending.setLength(0);
    if (!line.isEmpty()) sendLog(line);
  }

  private void sendResult(boolean success, String output, int exitCode) {
    Map<String, Object> payload = new HashMap<>();
    payload.put("success", success);
    payload.put("output", output);
    payload.put("exitCode", exitCode);
    WebSocketManager.getInstance().sendMessage("command_execution_result", payload);
  }
}
