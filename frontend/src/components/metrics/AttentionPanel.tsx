import { CheckCircle2 } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { formatRelativeTimeTr } from "@/lib/format";
import { cn } from "@/lib/utils";

type AttentionPanelProps = {
  failed: Project[];
  /** Whether the role may re-run a legacy project's deployment. */
  canRetry: boolean;
  /** Legacy projects re-trigger; artifact projects open their workspace on Müşteriler. */
  onRetry: (project: Project) => void;
};

const VISIBLE_LIMIT = 3;

/** Failed deployments, most recent first — real state, not a placeholder. */
export const AttentionPanel = ({ failed, canRetry, onRetry }: AttentionPanelProps) => {
  const visible = failed.slice(0, VISIBLE_LIMIT);

  return (
    <section aria-label="Dikkat gerekenler" className="flex w-[320px] shrink-0 flex-col px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[10px] tracking-[0.1em] text-dim">DİKKAT GEREKENLER</h2>
        <span
          className={cn(
            "tabular font-mono text-xl font-medium leading-none",
            failed.length > 0 ? "text-status-fail" : "text-status-ok",
          )}
        >
          {failed.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-grow items-center gap-2.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-status-ok" aria-hidden="true" />
          Başarısız dağıtım yok.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between rounded-md border-l-2 border-status-fail bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{project.name}</p>
                <p className="font-mono text-[10px] text-dim">
                  {formatRelativeTimeTr(project.lastDeploy)}
                </p>
              </div>
              {(project.config?.artifactDeploy || canRetry) && (
                <button
                  type="button"
                  onClick={() => onRetry(project)}
                  className="font-mono text-[11px] font-semibold tracking-[0.06em] text-primary hover:underline"
                >
                  {project.config?.artifactDeploy ? "AÇ" : "TEKRAR DENE"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-grow" />
    </section>
  );
};
