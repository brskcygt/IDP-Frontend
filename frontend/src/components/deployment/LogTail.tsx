import { useMemo } from "react";
import { useStickyTerminalScroll } from "@/hooks/useStickyTerminalScroll";
import { parseLogLine } from "@/lib/logParser";
import { TerminalLogLine } from "./TerminalLogLine";

/** Enough history to scroll back through on the dashboard; the full log is in the stream sheet. */
const DEFAULT_LINES = 300;

type LogTailProps = {
  logs: string[];
  lines?: number;
  /** Resets the "stay at the bottom" tracking when another run is shown. */
  resetKey?: unknown;
};

/**
 * The latest stream lines, shown inline on the dashboard. Fills whatever
 * height its container gives it and stays scrolled to the newest line unless
 * the user has scrolled up to read something.
 */
export const LogTail = ({ logs, lines = DEFAULT_LINES, resetKey }: LogTailProps) => {
  const tail = useMemo(() => logs.slice(-lines).map((raw, index) => parseLogLine(raw, index)), [logs, lines]);
  const { terminalRef, handleScroll } = useStickyTerminalScroll(logs.length, tail.length, resetKey);

  return (
    <div
      ref={terminalRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto rounded-md border border-line bg-surface-sunken px-3 py-2"
    >
      {tail.length === 0 ? (
        <p className="font-mono text-[11px] leading-[22px] text-faint">Çıktı bekleniyor…</p>
      ) : (
        tail.map((line) => <TerminalLogLine key={line.id} line={line} compact />)
      )}
    </div>
  );
};
