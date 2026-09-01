import { LoaderCircle } from 'lucide-react';
import { formatDuration } from '@/lib/format';

export const TerminalActivityIndicator = ({ elapsedMs, compact = false }: { elapsedMs: number; compact?: boolean }) => (
  <div
    role="status"
    aria-live="polite"
    className={compact
      ? 'flex items-center gap-2 font-mono text-[10px] text-status-run'
      : 'my-1 flex items-center gap-2 rounded-sm border-l-2 border-status-run/70 bg-status-run/[0.045] px-2.5 py-2 font-mono text-[11px] text-status-run'}
  >
    <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
    <span className="font-semibold">Komut çalışıyor</span>
    <span className="flex gap-0.5" aria-hidden="true">
      <span className="animate-pulse [animation-delay:0ms]">·</span>
      <span className="animate-pulse [animation-delay:180ms]">·</span>
      <span className="animate-pulse [animation-delay:360ms]">·</span>
    </span>
    <span className="ml-auto tabular text-dim">{formatDuration(elapsedMs)}</span>
  </div>
);
