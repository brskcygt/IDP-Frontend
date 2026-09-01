package com.idp.agent.managers.UpdateManagers.abstracts;

import java.util.List;

public interface UpdateManager {
  void handleUpdateProcessAsync();
  void handleUpdateProcess();
  void handleUpdateConfigProcessAsync(List<String> configLines);
  void handleUpdateConfigProcess(List<String> configLines);
}