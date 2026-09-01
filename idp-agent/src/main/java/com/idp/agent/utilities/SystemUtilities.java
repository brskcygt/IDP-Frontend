package com.idp.agent.utilities;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.util.Map;
import java.util.HashMap;
import java.lang.management.ManagementFactory;
import com.sun.management.OperatingSystemMXBean;

import com.idp.agent.utilities.system.CpuInfoProvider;
import com.idp.agent.utilities.system.JvmHeapInfoProvider;
import com.idp.agent.utilities.system.SystemLoadProvider;
import com.idp.agent.utilities.system.abstracts.MemoryInfo;
import com.idp.agent.utilities.system.factory.MemoryInfoProviderFactory;

public class SystemUtilities {

  private static SystemUtilities instance;
  private final MemoryInfo memoryProvider;
  private final OperatingSystemMXBean osBean;
  private final Map<String, Object> cachedStatus;

  private SystemUtilities() {
    this.osBean = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    this.memoryProvider = MemoryInfoProviderFactory.createProvider();
    this.cachedStatus = new HashMap<>();
  }

  public static synchronized SystemUtilities getInstance(){
    if(instance == null){
      instance = new SystemUtilities();
    }
    return instance;
  }

  public Map<String, Object> getSystemStatus() {
    try {
        long totalRam = osBean.getTotalMemorySize();
        long freeRam = memoryProvider.getAvailableMemory();
        long usedRam = totalRam - freeRam;

        cachedStatus.put("cpu_usage", CpuInfoProvider.getCpuUsage(osBean));
        cachedStatus.put("ram_usage", round((usedRam * 100.0) / totalRam));
        cachedStatus.put("used_memory_mb", usedRam / (1024 * 1024));
        cachedStatus.put("max_memory_mb", totalRam / (1024 * 1024));
        cachedStatus.put("system_load", SystemLoadProvider.getSystemLoad(osBean));
        cachedStatus.put("jvm_heap", JvmHeapInfoProvider.getJvmHeapInfo());
    } catch (Exception e) {
        cachedStatus.put("error", e.getMessage());
    }

    return cachedStatus;
  }

  // ---------------------------
  // Utils
  // ---------------------------
  private double round(double val) {
      return Math.round(val * 100.0) / 100.0;
  }
}