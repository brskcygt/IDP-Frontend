import type { KnownHostKey } from "@/hooks/useHostKeys";
import { KnownHostKeyRow } from "./KnownHostKeyRow";

type KnownHostKeyListProps = {
  hostKeys: KnownHostKey[];
};

export const KnownHostKeyList = ({ hostKeys }: KnownHostKeyListProps) => {
  return (
    <ul>
      {hostKeys.map((hostKey) => (
        <KnownHostKeyRow key={`${hostKey.host}:${hostKey.port}`} hostKey={hostKey} />
      ))}
    </ul>
  );
};
