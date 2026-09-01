package com.idp.agent.utilities.system.factory.readers;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

import com.idp.agent.utilities.system.abstracts.MemoryInfo;

public class LinuxMemoryReader implements MemoryInfo {
  private final String MEMINFO_PATH = "/proc/meminfo";

    @Override
    public long getAvailableMemory() {
      File memInfo = new File(MEMINFO_PATH);

      try (BufferedReader reader = new BufferedReader(new FileReader(memInfo))) {
        String line;

        while ((line = reader.readLine()) != null) {
          if (line.startsWith("MemAvailable:")) {
            String[] parts = line.split("\\s+");
            return Long.parseLong(parts[1]) * 1024;
          }
        }
      } catch (Exception ignore) {}

      return -1;
    }
}
