import { cn } from "@/lib/utils";

type FilterStripProps = {
  providers: string[];
  activeProvider: string | null;
  failedOnly: boolean;
  failedCount: number;
  summary: string;
  onProviderChange: (provider: string | null) => void;
  onToggleFailedOnly: () => void;
};

const CHIP = "rounded-md border border-transparent px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-line-strong bg-accent text-foreground";
const CHIP_OFF = "text-muted-foreground hover:bg-accent hover:text-foreground";

export const FilterStrip = ({
  providers,
  activeProvider,
  failedOnly,
  failedCount,
  summary,
  onProviderChange,
  onToggleFailedOnly,
}: FilterStripProps) => (
  <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-bar px-4">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onProviderChange(null)}
        aria-pressed={activeProvider === null}
        className={cn(CHIP, activeProvider === null ? CHIP_ON : CHIP_OFF)}
      >
        All
      </button>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => onProviderChange(provider)}
          aria-pressed={activeProvider === provider}
          className={cn(CHIP, activeProvider === provider ? CHIP_ON : CHIP_OFF)}
        >
          {provider}
        </button>
      ))}

      {failedCount > 0 && (
        <>
          <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line-strong" />
          <button
            type="button"
            onClick={onToggleFailedOnly}
            aria-pressed={failedOnly}
            className={cn(
              CHIP,
              "text-status-fail hover:bg-status-fail/10",
              failedOnly && "border-status-fail/40 bg-status-fail/10",
            )}
          >
            Failed only ({failedCount})
          </button>
        </>
      )}
    </div>

    <span className="tabular font-mono text-[11px] text-dim">{summary}</span>
  </div>
);
