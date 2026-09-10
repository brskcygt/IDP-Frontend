package com.idp.agent.managers.UpdateManagers.abstracts;

import java.util.List;

public interface UpdateManager {
  /**
   * @param payload sunucu mesajının payload'u; beklenen SHA-256 özetleri {@code sha256} alanında
   *                gelir (bkz. {@link com.idp.agent.security.Sha256Verifier}). Alan yoksa güncelleme
   *                reddedilir.
   */
  void handleUpdateProcessAsync(Object payload);

  /** @return güncelleme kurulduysa true; reddedildi ya da başarısız olduysa false */
  boolean handleUpdateProcess(Object payload);

  void handleUpdateConfigProcessAsync(List<String> configLines);
  void handleUpdateConfigProcess(List<String> configLines);
}
