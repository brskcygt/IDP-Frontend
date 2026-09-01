import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription } from "@/components/ui/sheet";
import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import type { DeploymentRunView } from "@/hooks/useDeploymentRun";
import { useStickyTerminalScroll } from "@/hooks/useStickyTerminalScroll";
import { parseLogLine } from "@/lib/logParser";
import { countMatches } from "@/lib/highlightMatch";
import { TerminalStreamHeader } from "./TerminalStreamHeader";
import { TerminalToolbar } from "./TerminalToolbar";
import { TerminalSearchBar, type LevelFilter } from "./TerminalSearchBar";
import { TerminalLogLine } from "./TerminalLogLine";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { NewLogsBadge } from "./NewLogsBadge";
import { DeploymentTabs } from "./DeploymentTabs";
import { cn } from "@/lib/utils";
import { TerminalActivityIndicator } from "./TerminalActivityIndicator";

type LiveTerminalStreamProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  runs: DeploymentRunView[];
  activeRunKey: string | null;
  onSelectRun: (runKey: string) => void;
  onCloseRun: (runKey: string) => void;
  onAbortRun: (runKey: string) => void;
  onBrowseSessions: () => void;
};

const ACCENT: Record<DeploymentStatus, string> = {
  idle: "bg-line-strong",
  connecting: "bg-status-run",
  running: "bg-status-run",
  succeeded: "bg-status-ok",
  failed: "bg-status-fail",
  aborted: "bg-status-warn",
};

// Stable reference so `logs` doesn't change identity every render when there
// is no active run — a fresh `[]` literal each render would otherwise defeat
// the useMemo below.
const EMPTY_LOGS: string[] = [];

export const LiveTerminalStream = ({
  isOpen,
  onOpenChange,
  runs,
  activeRunKey,
  onSelectRun,
  onCloseRun,
  onAbortRun,
  onBrowseSessions,
}: LiveTerminalStreamProps) => {
  const [wrap, setWrap] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  const activeRun = runs.find((run) => run.runKey === activeRunKey) ?? runs[0] ?? null;
  const project = activeRun?.project ?? null;
  const logs = activeRun?.logs ?? EMPTY_LOGS;
  const status: DeploymentStatus = activeRun?.status ?? "idle";
  const elapsedMs = activeRun?.elapsedMs ?? 0;
  const deploymentId = activeRun?.deploymentId ?? null;

  const isActive = status === "running" || status === "connecting";
  const accentClass = ACCENT[status];

  const parsed = useMemo(() => logs.map((raw, index) => parseLogLine(raw, index)), [logs]);
  const errorCount = useMemo(() => parsed.filter((line) => line.level === "error").length, [parsed]);
  const warnCount = useMemo(() => parsed.filter((line) => line.level === "warn").length, [parsed]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return parsed.filter((line) => {
      if (levelFilter !== "all" && line.level !== levelFilter) return false;
      if (!needle) return true;
      return line.text.toLowerCase().includes(needle) || (line.source ?? "").toLowerCase().includes(needle);
    });
  }, [parsed, query, levelFilter]);

  const matchCount = useMemo(
    () => (query.trim() ? filtered.reduce((sum, line) => sum + countMatches(line.text, query), 0) : 0),
    [filtered, query],
  );

  const { terminalRef, isPinnedToBottom, pendingCount, handleScroll, jumpToBottom } = useStickyTerminalScroll(
    logs.length,
    filtered.length,
    activeRun?.runKey ?? deploymentId,
  );

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project?.name ?? "deployment"}-${deploymentId ?? "log"}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[70vh] flex-col gap-0 border-t-line-strong bg-background p-0">
        <div aria-hidden="true" className={cn("h-0.5 w-full shrink-0", accentClass)} />

        {runs.length > 0 && (
          <DeploymentTabs
            runs={runs}
            activeRunKey={activeRun?.runKey ?? null}
            onSelect={onSelectRun}
            onClose={onCloseRun}
            onBrowseSessions={onBrowseSessions}
          />
        )}

        <TerminalStreamHeader
          project={project}
          deploymentId={deploymentId}
          elapsedMs={elapsedMs}
          isActive={isActive}
          accentClass={accentClass}
          onAbort={() => activeRun && onAbortRun(activeRun.runKey)}
        />

        <SheetDescription className="sr-only">Real-time output from the deployment adapter.</SheetDescription>

        <div className="relative m-4 flex min-h-0 flex-grow flex-col overflow-hidden rounded-md border border-line bg-surface-sunken">
          <TerminalToolbar
            target={project ? `${project.provider.toLowerCase()} · ${project.name}` : "deployment stream"}
            wrap={wrap}
            showTimestamps={showTimestamps}
            copied={copied}
            onToggleWrap={() => setWrap((prev) => !prev)}
            onToggleTimestamps={() => setShowTimestamps((prev) => !prev)}
            onCopy={handleCopy}
            onDownload={handleDownload}
          />

          <TerminalSearchBar
            query={query}
            onQueryChange={setQuery}
            matchCount={matchCount}
            levelFilter={levelFilter}
            onLevelFilterChange={setLevelFilter}
          />

          <div
            ref={terminalRef}
            onScroll={handleScroll}
            className={cn("min-h-0 flex-grow overflow-y-auto px-3.5 py-2.5", !wrap && "overflow-x-auto")}
          >
            {filtered.length === 0 && !isActive ? (
              <p className="font-mono text-[11.5px] italic text-faint">
                {parsed.length === 0 ? "Waiting for output…" : "No log lines match the current filters."}
              </p>
            ) : (
              filtered.map((line) => (
                <TerminalLogLine key={line.id} line={line} showTimestamp={showTimestamps} query={query} />
              ))
            )}
            {isActive && <TerminalActivityIndicator elapsedMs={elapsedMs} />}
          </div>

          {!isPinnedToBottom && pendingCount > 0 && <NewLogsBadge count={pendingCount} onClick={jumpToBottom} />}
        </div>

        <TerminalStatusBar
          status={status}
          accentClass={accentClass}
          totalLines={logs.length}
          errorCount={errorCount}
          warnCount={warnCount}
        />
      </SheetContent>
    </Sheet>
  );
};
