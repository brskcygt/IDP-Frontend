import { Moon, Sun, MonitorCog } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

const NEXT_THEME = { light: "dark", dark: "system", system: "light" } as const;

const LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

/** Rail-sized theme cycle: light → dark → system. */
export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const current = (theme ?? "system") as keyof typeof NEXT_THEME;

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[current])}
      title={`${LABEL[current]} — click to change`}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {current === "light" && <Sun className="h-[18px] w-[18px]" aria-hidden="true" />}
      {current === "dark" && <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
      {current === "system" && <MonitorCog className="h-[18px] w-[18px]" aria-hidden="true" />}
      <span className="sr-only">{LABEL[current]}</span>
    </button>
  );
}
