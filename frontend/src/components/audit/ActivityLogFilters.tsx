import { AUDIT_CATEGORY_LABEL, type AuditCategory } from "@/lib/auditMeta";
import { cn } from "@/lib/utils";

type ActivityLogFiltersProps = {
  active: AuditCategory | null;
  onChange: (category: AuditCategory | null) => void;
};

const CATEGORIES: AuditCategory[] = ["deploy", "config", "auth"];

const CHIP = "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ActivityLogFilters = ({ active, onChange }: ActivityLogFiltersProps) => (
  <div className="flex h-[38px] shrink-0 items-center gap-1.5 border-b border-line bg-bar px-5">
    <button
      type="button"
      onClick={() => onChange(null)}
      className={cn(CHIP, active === null ? "border border-line-strong bg-accent" : "text-muted-foreground hover:bg-accent")}
    >
      All
    </button>
    {CATEGORIES.map((category) => (
      <button
        key={category}
        type="button"
        onClick={() => onChange(active === category ? null : category)}
        className={cn(
          CHIP,
          active === category
            ? "border border-line-strong bg-accent"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        {AUDIT_CATEGORY_LABEL[category]}
      </button>
    ))}
  </div>
);
