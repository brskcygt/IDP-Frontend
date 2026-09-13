import { Moon, Sun, MonitorCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const NEXT_THEME = { light: "dark", dark: "system", system: "light" } as const;

const LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

/** Rail-sized theme cycle: light → dark → system. */
export function ModeToggle({ expanded = false }: { expanded?: boolean }) {
  const { theme, setTheme } = useTheme();
  const current = (theme ?? "system") as keyof typeof NEXT_THEME;

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[current])}
      aria-label={`${LABEL[current]} — click to change`}
      title={`${LABEL[current]} — click to change`}
      className="flex h-10 w-full shrink-0 items-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex h-10 w-14 shrink-0 items-center justify-center">
        {current === "light" && <Sun className="h-[18px] w-[18px]" aria-hidden="true" />}
        {current === "dark" && <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
        {current === "system" && <MonitorCog className="h-[18px] w-[18px]" aria-hidden="true" />}
      </span>
      <span
        aria-hidden={!expanded}
        className={cn(
          "min-w-0 flex-1 truncate pr-2 text-left transition-[opacity,transform] duration-150 motion-reduce:transition-none",
          expanded ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
        )}
      >
        {LABEL[current]}
      </span>
    </button>
  );
}
