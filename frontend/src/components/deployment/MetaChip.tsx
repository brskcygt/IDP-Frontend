import { cn } from "@/lib/utils";

type MetaChipProps = {
  children: React.ReactNode;
  className?: string;
};

/** Small monospace tag for environment, tenant and provider metadata. */
export const MetaChip = ({ children, className }: MetaChipProps) => (
  <span className={cn("rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[11px]", className)}>
    {children}
  </span>
);
