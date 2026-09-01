import { cn } from "@/lib/utils";

type StreamState = "idle" | "streaming" | "failed";

type StatusFooterProps = {
  visibleCount: number;
  totalCount: number;
  filterSummary: string;
  streamState: StreamState;
  version: string;
};

const STREAM_LABEL: Record<StreamState, string> = {
  idle: "stream idle",
  streaming: "streaming deployment",
  failed: "stream disconnected",
};

const STREAM_DOT: Record<StreamState, string> = {
  idle: "bg-faint",
  streaming: "bg-status-run",
  failed: "bg-status-fail",
};

export const StatusFooter = ({
  visibleCount,
  totalCount,
  filterSummary,
  streamState,
  version,
}: StatusFooterProps) => (
  <footer className="flex h-[30px] shrink-0 items-center justify-between border-t border-line bg-bar px-5 font-mono text-[11px] text-dim">
    <span className="tabular">
      {visibleCount} of {totalCount} projects
      {filterSummary && <> · {filterSummary}</>}
    </span>
    <div className="flex items-center gap-3">
      <span className="text-faint">© 2026 MDP Group</span>
      <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
      <span className="rounded border border-line-strong px-1.5 py-0.5 text-muted-foreground">
        IDP {version ? `v${version}` : "v—"}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", STREAM_DOT[streamState])} aria-hidden="true" />
        {STREAM_LABEL[streamState]}
      </span>
    </div>
  </footer>
);
