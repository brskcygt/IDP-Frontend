package com.idp.agent.utilities.system;

import com.sun.management.OperatingSystemMXBean;

public class CpuInfoProvider {
  public static double getCpuUsage(OperatingSystemMXBean osBean) {
    double cpu = osBean.getCpuLoad();
    if (cpu < 0) return 0;

    return Math.round(cpu * 10000.0) / 100.0;
  }
}
