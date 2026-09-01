package com.idp.agent.utilities.system;

import com.sun.management.OperatingSystemMXBean;
// import java.lang.management.OperatingSystemMXBean;

public class SystemLoadProvider {
  public static double getSystemLoad(OperatingSystemMXBean osBean) {
    try {
      double load = osBean.getSystemLoadAverage();
    
      // Windows genellikle -1 döner (desteklemez).
      // Bu durumda CPU Load * Çekirdek Sayısı formülü ile yaklaşık bir "Load" değeri üretebiliriz.
      if (load < 0) {
        double cpu = osBean.getCpuLoad();
        if (cpu >= 0) {
          return Math.round(cpu * osBean.getAvailableProcessors() * 100.0) / 100.0;
        }
        return -1;
      }
      
      return Math.round(load * 100.0) / 100.0;
    } catch (Exception e) {
      return -1;
    }
  }
}
