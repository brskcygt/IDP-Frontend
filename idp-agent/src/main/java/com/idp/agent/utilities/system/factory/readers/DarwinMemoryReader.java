package com.idp.agent.utilities.system.factory.readers;

import java.io.BufferedReader;
import java.io.InputStreamReader;

import com.idp.agent.utilities.system.abstracts.MemoryInfo;

public class DarwinMemoryReader implements MemoryInfo {

  @Override
  public long getAvailableMemory() {
    long pagesFree = 0;
    long pagesInactive = 0;
    long pageSize = 4096;

    try {
      Process p = Runtime.getRuntime().exec("vm_stat");

      try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
        String line;

        while ((line = reader.readLine()) != null) {
          if (line.contains("page size of")) {
            pageSize = extractPageSize(line);
          } else if (line.startsWith("Pages free:")) {
            pagesFree = parsePages(line);
          } else if (line.startsWith("Pages inactive:")) {
            pagesInactive = parsePages(line);
          }
        }
      }

      p.waitFor();
      p.destroy();

      return (pagesFree + pagesInactive) * pageSize;

    } catch (Exception e) {
      return -1;
    }
  }

  public static long extractPageSize(String line) {
    try {
      // "Mach Virtual Memory Statistics: (page size of 4096 bytes)"
      int start = line.indexOf("page size of") + 12;
      int end = line.indexOf("bytes", start);
      if (start > 11 && end > start) {
        String val = line.substring(start, end).trim();
        return Long.parseLong(val);
      }
      return 4096;
    } catch (Exception e) {
      return 4096;
    }
  }

  public static long parsePages(String line) {
    try {
      // "Pages free:                               3634."
      int colon = line.indexOf(':');
      if (colon > 0) {
        String val = line.substring(colon + 1).trim();
        if (val.endsWith(".")) {
          val = val.substring(0, val.length() - 1);
        }
        return Long.parseLong(val);
      }
      return 0;
    } catch (Exception e) {
      return 0;
    }
  }
}
