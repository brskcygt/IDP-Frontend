import { Search, X } from "lucide-react";
import type { LogLevel } from "@/lib/logParser";
import { cn } from "@/lib/utils";

export type LevelFilter = "all" | Extract<LogLevel, "error" | "warn">;

type TerminalSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  levelFilter: LevelFilter;
  onLevelFilterChange: (value: LevelFilter) => void;
};

const CHIP = "shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors";

const FILTERS: ReadonlyArray<{ value: LevelFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warn", label: "Warnings" },
];

export const TerminalSearchBar = ({
  query,
  onQueryChange,
  matchCount,
  levelFilter,
  onLevelFilterChange,
}: TerminalSearchBarProps) => (
  <div className="flex h-[34px] shrink-0 items-center gap-3 border-b border-line bg-bar px-3.5">
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" aria-hidden="true" />
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search logs…"
        aria-label="Search logs"
        className="w-full bg-transparent py-1 pl-5 pr-6 font-mono text-[11px] text-foreground placeholder:text-faint focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label="Clear search"
          className="absolute right-0 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>

    {query.trim() && (
      <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] text-dim">
        {matchCount} {matchCount === 1 ? "match" : "matches"}
      </span>
    )}

    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Filter by level">
      {FILTERS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onLevelFilterChange(value)}
          aria-pressed={levelFilter === value}
          className={cn(
            CHIP,
            levelFilter === value ? "bg-primary text-primary-foreground" : "bg-muted/60 text-dim hover:bg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
);
