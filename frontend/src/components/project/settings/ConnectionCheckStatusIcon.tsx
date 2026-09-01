import { Check, X, Minus } from "lucide-react";

interface ConnectionCheckStatusIconProps {
  /** `true` passed, `false` failed, `null` not tested — see ConnectionCheckResult. */
  ok: boolean | null;
}

/** Tri-state ✓/✗/– icon for a single connection-test check result. */
export const ConnectionCheckStatusIcon = ({ ok }: ConnectionCheckStatusIconProps) => {
  if (ok === true) {
    return <Check className="h-3.5 w-3.5 shrink-0 text-status-ok" aria-hidden="true" />;
  }
  if (ok === false) {
    return <X className="h-3.5 w-3.5 shrink-0 text-status-fail" aria-hidden="true" />;
  }
  return <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
};
