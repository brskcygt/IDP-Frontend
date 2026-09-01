import { CheckCircle2, XCircle, Loader2, Circle } from "lucide-react";
import type { ProjectStatus } from "@/lib/projectMeta";
import { STATUS_CLASS } from "@/lib/projectMeta";
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
    <Icon
      className={cn("h-[13px] w-[13px]", STATUS_CLASS[status], status === "Deploying" && "animate-spin")}
      aria-hidden="true"
    />
  );
};
