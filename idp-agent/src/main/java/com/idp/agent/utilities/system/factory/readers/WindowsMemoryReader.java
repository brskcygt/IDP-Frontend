package com.idp.agent.utilities.system.factory.readers;

import java.lang.management.ManagementFactory;
import com.sun.management.OperatingSystemMXBean;

import com.idp.agent.utilities.system.abstracts.MemoryInfo;

public class WindowsMemoryReader implements MemoryInfo {
  @Override
  public long getAvailableMemory() {
    OperatingSystemMXBean osBean = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    return osBean.getFreeMemorySize();
  }
}
