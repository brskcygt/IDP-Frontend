import { CheckCircle2, XCircle, Loader2, Circle } from "lucide-react";
import type { ProjectStatus } from "@/lib/projectMeta";
import { PROJECT_STATUS_LABEL, STATUS_CLASS } from "@/lib/projectMeta";
import { cn } from "@/lib/utils";

const ICON = {
  Succeeded: CheckCircle2,
  Failed: XCircle,
  Deploying: Loader2,
  Idle: Circle,
} as const;

/** Status as a coloured mark beside the project name — no pill, no chrome. */
export const StatusMark = ({ status }: { status: ProjectStatus }) => {
  const Icon = ICON[status] ?? Circle;
  return (
    <>
      <Icon
        className={cn("h-[13px] w-[13px] shrink-0", STATUS_CLASS[status], status === "Deploying" && "animate-spin")}
        aria-hidden="true"
      />
      <span className="sr-only">{PROJECT_STATUS_LABEL[status] ?? status}:</span>
    </>
  );
};
