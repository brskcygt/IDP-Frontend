import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Circle } from "lucide-react";

type ProjectBadgeProps = {
  status: 'Idle' | 'Deploying' | 'Succeeded' | 'Failed';
};

const statusConfig = {
  Idle: {
    icon: Circle,
    label: 'Idle',
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/15',
  },
  Deploying: {
    icon: Loader2,
    label: 'Deploying',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/15',
    animate: true,
  },
  Succeeded: {
    icon: CheckCircle2,
    label: 'Success',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15',
  },
  Failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15',
  },
};

export const ProjectBadge = ({ status }: ProjectBadgeProps) => {
  const config = statusConfig[status] || statusConfig.Idle;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1.5 px-2 py-0.5 text-[11px] font-medium border ${config.className}`}>
      <Icon className={`h-3 w-3 ${'animate' in config && config.animate ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
};
