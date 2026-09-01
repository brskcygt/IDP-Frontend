import { useEffect, useState } from "react";

export function useAppVersion() {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    window.idp?.update.getVersion().then(setVersion).catch(() => undefined);
  }, []);

  return version;
}
