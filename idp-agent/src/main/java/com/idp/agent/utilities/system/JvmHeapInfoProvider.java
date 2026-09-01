package com.idp.agent.utilities.system;

import java.util.HashMap;
import java.util.Map;

public class JvmHeapInfoProvider {
  private static final Map<String, Object> cachedHeap = new HashMap<>();

  public static Map<String, Object> getJvmHeapInfo() {
    long max = Runtime.getRuntime().maxMemory();
    long total = Runtime.getRuntime().totalMemory();
    long free = Runtime.getRuntime().freeMemory();
    long used = total - free;

    cachedHeap.put("heap_max_mb", max / (1024 * 1024));
    cachedHeap.put("heap_total_mb", total / (1024 * 1024));
    cachedHeap.put("heap_used_mb", used / (1024 * 1024));
    cachedHeap.put("heap_usage", max > 0 ? Math.round((used * 10000.0) / max) / 100.0 : 0.0);

    return cachedHeap;
  }
}
