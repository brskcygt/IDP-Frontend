import { Activity } from "lucide-react";
import { SettingsField } from "@/components/project/settings/SettingsField";
import type { ProjectConfig } from "@/types/project";

interface TelemetryToggleFieldProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

/**
 * T-18b: server telemetry (CPU/RAM polling) is opt-in per project, defaulting
 * to OFF. Before this, every Server/SSH/WinRM project opened a real SSH/WinRM
 * session every 5 minutes whether anyone was watching the dashboard or not —
 * see `backend/src/services/TelemetryService.js` and
 * `backend/src/core/projects/projectService.js#getProjectTelemetry`, both of
 * which now refuse to open a connection unless this is exactly `true`.
 */
export const TelemetryToggleField = ({ config, onChange }: TelemetryToggleFieldProps) => {
  const enabled = config.telemetryEnabled === true;

  return (
    <SettingsField icon={<Activity className="h-3.5 w-3.5" />} label="Telemetri">
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border bg-accent/50 text-primary focus:ring-primary/20"
          checked={enabled}
          onChange={(e) => onChange({ ...config, telemetryEnabled: e.target.checked })}
        />
        <span>
          Sunucu telemetrisini izle (CPU/RAM)
          <span className="block text-[10px] text-muted-foreground/80 mt-0.5">
            Kapalıyken sunucuya bağlantı açılmaz. Açıkken 5 dakikada bir SSH/WinRM oturumu
            açılır; PMP kimliği kullanılıyorsa vault'tan okuma yapılır.
          </span>
        </span>
      </label>
    </SettingsField>
  );
};
