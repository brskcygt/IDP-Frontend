package com.idp.agent.handlers.MessageHandlers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;

class RunDeployMessageHandlerTest {
  private static String decode(List<String> shell) {
    return new String(Base64.getDecoder().decode(shell.get(shell.size() - 1)), StandardCharsets.UTF_16LE);
  }

  @Test
  void keepsDoubleQuotesIntact() {
    String command = "Write-Output \"PATH uzunluk: $($env:Path.Length)\"";
    List<String> shell = RunDeployMessageHandler.windowsShell(command);

    assertEquals("-EncodedCommand", shell.get(shell.size() - 2));
    assertFalse(shell.get(shell.size() - 1).contains("\""));
    assertTrue(decode(shell).endsWith(command));
  }

  @Test
  void refreshesPathFromRegistryBeforeCommand() {
    String script = decode(RunDeployMessageHandler.windowsShell("npm install"));

    assertTrue(script.startsWith("$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')"));
    assertTrue(script.endsWith("\nnpm install"));
  }
}
