import type { KnownHostKey } from "@/hooks/useHostKeys";
import { formatRelativeTime } from "@/lib/format";
import { ForgetHostKeyControl } from "./ForgetHostKeyControl";

type KnownHostKeyRowProps = {
  hostKey: KnownHostKey;
};

export const KnownHostKeyRow = ({ hostKey }: KnownHostKeyRowProps) => {
  return (
    <li className="flex flex-col gap-2.5 border-b border-line px-5 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">
              {hostKey.host}:{hostKey.port}
            </span>
            <span className="rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.09em] text-dim">
              {hostKey.keyType}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground" title={hostKey.fingerprint}>
            {hostKey.fingerprint}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] text-faint">
          first {formatRelativeTime(hostKey.firstSeen)} · last {formatRelativeTime(hostKey.lastSeen)}
        </p>
        <ForgetHostKeyControl host={hostKey.host} port={hostKey.port} />
      </div>
    </li>
  );
};
