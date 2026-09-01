import { useMemo } from "react";
import { parseLogLine } from "@/lib/logParser";
import { TerminalLogLine } from "./TerminalLogLine";

type LogTailProps = {
  logs: string[];
  lines?: number;
};

/** The last few stream lines, shown inline on the dashboard. */
export const LogTail = ({ logs, lines = 3 }: LogTailProps) => {
  const tail = useMemo(() => logs.slice(-lines).map((raw, index) => parseLogLine(raw, index)), [logs, lines]);

  return (
    <div className="max-h-full overflow-hidden rounded-md border border-line bg-surface-sunken px-3 py-2">
      {tail.length === 0 ? (
        <p className="font-mono text-[11px] leading-[22px] text-faint">Waiting for output…</p>
      ) : (
        tail.map((line) => <TerminalLogLine key={line.id} line={line} compact />)
      )}
    </div>
  );
};
