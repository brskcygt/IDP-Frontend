import { GitBranch } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { AUTO_DEPLOY_STATE, type AutoDeployItem } from "@/hooks/useAutoDeployFeed";
import { formatRelativeTimeTr } from "@/lib/format";
import { cn } from "@/lib/utils";

type AutoDeployPanelProps = {
  items: AutoDeployItem[];
  projects: Project[];
  isError: boolean;
  /** Opens the install's log in the live panel. */
  onWatch: (project: Project, deploymentId: string) => void;
  /** Opens the project's workspace, where customers and their branch live. */
  onOpenProject: (project: Project) => void;
};

const VISIBLE_LIMIT = 3;

/**
 * Builds Jenkins made on its own (a push) and what happened to them: installed
 * on the customers that follow the branch, skipped, failed — or nobody took
 * it. Without this the only trace was the activity log.
 */
export const AutoDeployPanel = ({ items, projects, isError, onWatch, onOpenProject }: AutoDeployPanelProps) => {
  const visible = items.slice(0, VISIBLE_LIMIT);
  const byId = new Map(projects.map((project) => [project.id, project]));
  const installing = items.filter((item) => item.state === "installing").length;

  return (
    <section aria-label="Otomatik kurulumlar" className="flex w-[320px] shrink-0 flex-col border-r border-line px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[10px] tracking-[0.1em] text-dim">OTOMATİK KURULUM · PUSH</h2>
        {installing > 0 && <span className="font-mono text-[11px] text-status-run">{installing} kuruluyor</span>}
      </div>

      {isError ? (
        <p className="text-xs text-muted-foreground">Etkinlik kaydı okunamadı (yetki gerekebilir).</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-grow items-start gap-2.5 text-xs text-muted-foreground">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Jenkins'ten push'la gelen sürüm yok.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => {
            const project = byId.get(item.projectId);
            const style = AUTO_DEPLOY_STATE[item.state];
            const canWatch = Boolean(project && item.deploymentId && item.state !== "skipped");
            return (
              <li key={item.id} className={cn("rounded-md border-l-2 bg-surface px-3 py-2", style.border)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-semibold">
                    {project?.name ?? "Proje"}{item.targetName ? ` → ${item.targetName}` : ""}
                  </p>
                  <span className={cn("shrink-0 font-mono text-[10px] font-semibold tracking-[0.06em]", style.text)}>{style.label}</span>
                </div>
                <p className="truncate font-mono text-[10px] text-dim" title={item.version}>
                  {item.ref ? `${item.ref} · ` : ""}{item.version} · {formatRelativeTimeTr(item.at)}
                </p>
                {item.detail && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground" title={item.detail}>{item.detail}</p>}
                {item.state === "unmatched" && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Bu branch için "Push'ta otomatik kur" açık müşteri yok.</p>
                )}
                {project && (canWatch || item.state === "unmatched") && (
                  <button
                    type="button"
                    onClick={() => (canWatch && item.deploymentId ? onWatch(project, item.deploymentId) : onOpenProject(project))}
                    className="mt-1 font-mono text-[11px] font-semibold tracking-[0.06em] text-primary hover:underline"
                  >
                    {canWatch ? "LOGU İZLE" : "MÜŞTERİLERİ AÇ"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex-grow" />
    </section>
  );
};
