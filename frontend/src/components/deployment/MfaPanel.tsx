import { cn } from "@/lib/utils";

type MfaPanelProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

/** Shared shell for every MFA challenge so the three variants stay identical. */
export const MfaPanel = ({ title, description, children, footer, className }: MfaPanelProps) => (
  <div
    role="dialog"
    aria-label={title}
    className={cn(
      "w-full max-w-[440px] rounded-lg border border-line-strong bg-popover px-8 py-7 text-center shadow-2xl",
      className,
    )}
  >
    <p className="mb-3.5 font-mono text-[10px] tracking-[0.14em] text-primary">MFA REQUIRED</p>
    <h3 className="mb-2 text-lg font-bold tracking-tight">{title}</h3>
    <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
    {children}
    {footer && <div className="mt-6">{footer}</div>}
  </div>
);
