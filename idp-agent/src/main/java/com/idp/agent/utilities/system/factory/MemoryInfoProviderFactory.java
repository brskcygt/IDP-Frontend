package com.idp.agent.utilities.system.factory;

import com.idp.agent.enums.OperatingSystem;
import com.idp.agent.utilities.system.abstracts.MemoryInfo;
import com.idp.agent.utilities.system.factory.readers.DarwinMemoryReader;
import com.idp.agent.utilities.system.factory.readers.LinuxMemoryReader;
import com.idp.agent.utilities.system.factory.readers.WindowsMemoryReader;

public class MemoryInfoProviderFactory {

  public static MemoryInfo createProvider() {
    OperatingSystem os = OperatingSystem.detect();

    return switch (os) {
      case LINUX -> new LinuxMemoryReader();
      case DARWIN -> new DarwinMemoryReader();
      default -> new WindowsMemoryReader();
    };
  }
  
}
