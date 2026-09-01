package com.idp.agent;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;
import static java.nio.file.StandardCopyOption.*;

public class Launcher {

  private static final int UPDATE_EXIT_CODE = 42;

  public static void main(String[] args) throws Exception {
    Path baseDir = Path.of(
      Launcher.class
        .getProtectionDomain()
        .getCodeSource()
        .getLocation()
        .toURI()
    ).getParent();

    System.out.println("[LAUNCHER] Base dir: " + baseDir);

    while (true) {
      int exitCode = startAgent(baseDir, args);

      if (exitCode == UPDATE_EXIT_CODE) {
        applyUpdate(baseDir);
        continue;
      }

      Thread.sleep(2000);
    }
  }

  private static int startAgent(Path baseDir, String[] args) throws Exception {
    Path agentJar = baseDir.resolve("idp-agent.jar");
    
    String xms = System.getenv().getOrDefault("AGENT_XMS", "256m");
    String xmx = System.getenv().getOrDefault("AGENT_XMX", "512m");

    List<String> command = new ArrayList<>();
    command.add("java");
    command.add("-Xms" + xms);
    command.add("-Xmx" + xmx);
    command.add("-jar");
    command.add(agentJar.toAbsolutePath().toString());

    boolean configFound = false;
    if (args != null) {
      for (String arg : args) {
        command.add(arg);
        if (arg.startsWith("--config=")) {
          configFound = true;
        }
      }
    }

    if (!configFound) {
      Path envYmlFile = baseDir.resolve("env.yml");
      command.add("--config=" + envYmlFile);
    }

    Process process = new ProcessBuilder(command)
    .directory(baseDir.toFile())
    .inheritIO()
    .start();

    return process.waitFor();
  }

  private static void applyUpdate(Path baseDir) throws Exception {
    Path next = baseDir.resolve("idp-agent.next.jar");
    Path current = baseDir.resolve("idp-agent.jar");
    Path backup = baseDir.resolve("idp-agent.old.jar");

    if (!Files.exists(next)) {
      System.out.println("[LAUNCHER] No update file found");
      return;
    }

    Files.move(current, backup, REPLACE_EXISTING);
    Files.move(next, current, REPLACE_EXISTING);

    System.out.println("[LAUNCHER] Update applied");
  }
}