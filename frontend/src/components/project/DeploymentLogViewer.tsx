import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useDeploymentLogsArchive } from "@/hooks/useDeploymentHistory";
import { Button } from "@/components/ui/button";

const COPY_RESET_MS = 1500;

type DeploymentLogViewerProps = {
  deploymentId: string;
};

/**
 * Archived log body for one finished deployment (T-70). No virtualization —
 * the archive is already capped server-side (deploymentRepository's
 * truncateLogText) — just a bounded-height scroll region so one long log
 * doesn't blow out the history sheet's layout.
 */
export const DeploymentLogViewer = ({ deploymentId }: DeploymentLogViewerProps) => {
  const { data: logText, isLoading, isError, refetch, isFetching } = useDeploymentLogsArchive(deploymentId);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!logText) return;
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard permission denied or unavailable — nothing more to do here.
    }
  };

  if (isLoading) {
    return <p className="font-mono text-[11px] text-dim">Log yükleniyor…</p>;
  }

  if (isError || logText === undefined) {
    return <div className="flex items-center gap-3">
      <p className="text-[11px] text-status-fail">Bu dağıtımın logu yüklenemedi.</p>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
    </div>;
  }

  return (
    <div className="relative rounded-md border border-line-strong bg-bar">
      <button
        type="button"
        onClick={handleCopy}
        title="Logu kopyala"
        aria-label="Logu kopyala"
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-line-strong bg-background px-2 py-1 font-mono text-[10px] text-dim transition-colors hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words px-3 py-3 pr-16 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {logText || "(log boş)"}
      </pre>
    </div>
  );
};
