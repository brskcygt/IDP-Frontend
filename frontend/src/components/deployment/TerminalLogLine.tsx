import { format } from "date-fns";
import { LEVEL_MARK, LEVEL_TEXT_CLASS, type ParsedLogLine } from "@/lib/logParser";
import { splitByMatch } from "@/lib/highlightMatch";
import { cn } from "@/lib/utils";

type TerminalLogLineProps = {
  line: ParsedLogLine;
  /** Compact drops the timestamp and source columns for the dashboard tail. */
  compact?: boolean;
  /** Show the parsed timestamp column (ignored in compact mode). */
  showTimestamp?: boolean;
  /** Active search query — matched segments render inside `<mark>`. */
  query?: string;
};

const formatTimestamp = (timestamp: string | null): string => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : format(date, "HH:mm:ss");
};

export const TerminalLogLine = ({ line, compact = false, showTimestamp = false, query = "" }: TerminalLogLineProps) => {
  const withTimestamp = !compact && showTimestamp;
  const segments = splitByMatch(line.text, query);
  const isCommand = line.source === 'Agent:Command';
  const sourceClass = isCommand
    ? 'text-amber-300'
    : line.source === 'Agent'
      ? 'text-sky-400'
      : line.source === 'System'
        ? 'text-violet-400'
        : 'text-dim';
  const textClass = isCommand ? 'text-amber-200' : LEVEL_TEXT_CLASS[line.level];

  return (
    <div
      className={cn(
        "grid items-baseline gap-x-2 rounded-sm px-1 font-mono leading-[22px]",
        isCommand && "border-l-2 border-amber-400/70 bg-amber-400/[0.055]",
        !isCommand && line.level === 'error' && "bg-red-500/[0.035]",
        !isCommand && line.level === 'success' && "bg-emerald-500/[0.025]",
        compact && "grid-cols-[auto_1fr] text-[11px]",
        !compact && withTimestamp && "grid-cols-[68px_72px_22px_1fr] text-[11.5px]",
        !compact && !withTimestamp && "grid-cols-[72px_22px_1fr] text-[11.5px]",
      )}
    >
      {withTimestamp && <span className="tabular text-faint">{formatTimestamp(line.timestamp)}</span>}
      {!compact && <span className={cn("truncate", sourceClass)}>{isCommand ? 'COMMAND' : (line.source ?? "")}</span>}
      <span className={textClass}>{isCommand ? '$$' : LEVEL_MARK[line.level]}</span>
      <span className={cn("break-all", textClass, isCommand && 'font-medium')}>
        {segments.map((segment, index) =>
          segment.matched ? (
            <mark key={`${segment.text}-${index}`} className="rounded-sm bg-primary/30 text-foreground">
              {segment.text}
            </mark>
          ) : (
            <span key={`${segment.text}-${index}`}>{segment.text}</span>
          ),
        )}
      </span>
    </div>
  );
};
