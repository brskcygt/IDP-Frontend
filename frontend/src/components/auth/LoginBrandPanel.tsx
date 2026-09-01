import { Terminal } from "lucide-react";

const GRID_TEXTURE =
  "repeating-linear-gradient(0deg, hsl(var(--line)) 0 1px, transparent 1px 56px), repeating-linear-gradient(90deg, hsl(var(--line)) 0 1px, transparent 1px 56px)";

/** Left half of the sign-in screen: what this platform is, and nothing else. */
export const LoginBrandPanel = () => (
  <div className="relative hidden w-[44%] shrink-0 flex-col justify-between border-r border-line bg-bar px-14 py-14 lg:flex">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-60"
      style={{ backgroundImage: GRID_TEXTURE }}
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-32 top-32 h-[620px] w-[620px] rounded-full bg-primary/[0.08] blur-3xl"
    />

    <div className="relative flex items-center gap-3">
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Terminal className="h-[19px] w-[19px]" aria-hidden="true" />
      </div>
      <span className="font-mono text-xs tracking-[0.14em] text-muted-foreground">IDP</span>
    </div>

    <div className="relative">
      <h1 className="mb-6 text-[clamp(2.5rem,4vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.03em]">
        Internal
        <br />
        Developer
        <br />
        Platform
      </h1>
      <p className="max-w-[400px] text-[15px] leading-relaxed text-muted-foreground">
        Deploy, monitor and audit every internal service from one place — Jenkins pipelines, server
        targets and Windows hosts.
      </p>
      <div aria-hidden="true" className="mt-7 h-[3px] w-16 bg-primary" />
    </div>

    <p className="relative font-mono text-[11px] leading-relaxed text-faint">
      Every deployment is attributed to your account in the audit trail.
    </p>
  </div>
);
