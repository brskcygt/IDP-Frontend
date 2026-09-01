import { cn } from "@/lib/utils";

type TerminalToolbarProps = {
  target: string;
  wrap: boolean;
  showTimestamps: boolean;
  onToggleWrap: () => void;
  onToggleTimestamps: () => void;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
};

const ACTION =
  "font-mono text-[10.5px] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm px-0.5";

export const TerminalToolbar = ({
  target,
  wrap,
  showTimestamps,
  onToggleWrap,
  onToggleTimestamps,
  onCopy,
  onDownload,
  copied,
}: TerminalToolbarProps) => (
  <div className="flex h-[30px] shrink-0 items-center justify-between border-b border-line bg-bar px-3.5 font-mono text-[10.5px] text-dim">
    <span className="truncate">{target}</span>
    <div className="flex shrink-0 items-center gap-4">
      <button
        type="button"
        onClick={onToggleTimestamps}
        aria-pressed={showTimestamps}
        className={cn(ACTION, showTimestamps && "text-primary")}
      >
        timestamps {showTimestamps ? "on" : "off"}
      </button>
      <button type="button" onClick={onToggleWrap} aria-pressed={wrap} className={cn(ACTION, wrap && "text-primary")}>
        wrap
      </button>
      <button type="button" onClick={onCopy} className={cn(ACTION, copied && "text-status-ok")}>
        {copied ? "copied" : "copy"}
      </button>
      <button type="button" onClick={onDownload} className={ACTION}>
        download
      </button>
    </div>
  </div>
);
