import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { cn } from "@/lib/utils";
import { deployStatusLabel } from "@/lib/deploymentStatus";

type TerminalStatusBarProps = {
  status: DeploymentStatus;
  accentClass: string;
  totalLines: number;
  errorCount: number;
  warnCount: number;
};

export const TerminalStatusBar = ({ status, accentClass, totalLines, errorCount, warnCount }: TerminalStatusBarProps) => (
  <div className="flex h-[34px] shrink-0 items-center justify-between border-t border-line bg-bar px-5 font-mono text-[10.5px] text-dim">
    <span className="tabular flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", accentClass, (status === 'running' || status === 'connecting') && 'animate-pulse')} />
      {deployStatusLabel(status)} · {totalLines} satır
      {errorCount > 0 && <> · {errorCount} hata</>}
      {warnCount > 0 && <> · {warnCount} uyarı</>}
    </span>
    <span>bu paneli kapatmak dağıtımı durdurmaz, arka planda sürer</span>
  </div>
);
