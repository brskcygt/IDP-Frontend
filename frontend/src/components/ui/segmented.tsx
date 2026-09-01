import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Optional token class applied when this option is the selected one. */
  activeClassName?: string;
};

type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-[30px] text-[11px] px-2.5 tracking-[0.04em]",
  md: "h-[34px] text-xs px-4",
} as const;

/**
 * Segmented control used wherever a small, fully-visible choice beats a select
 * (environment switcher, deploy target). Keyboard and screen-reader semantics
 * come from the radiogroup role rather than being painted on.
 */
export const Segmented = <T extends string,>({
  options,
  value,
  onChange,
  label,
  size = "sm",
  className,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn(
      "inline-flex items-stretch overflow-hidden rounded-md border border-line-strong bg-surface font-mono",
      className,
    )}
  >
    {options.map((option, index) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => onChange(option.value)}
          className={cn(
            "font-medium uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            SIZE_CLASS[size],
            index > 0 && "border-l border-line-strong",
            isActive
              ? option.activeClassName ?? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
