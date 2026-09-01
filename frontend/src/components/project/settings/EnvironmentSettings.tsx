import { Layers } from "lucide-react";
import { EnvironmentEntry } from "@/components/project/settings/EnvironmentEntry";
import { EnvironmentAddControl } from "@/components/project/settings/EnvironmentAddControl";
import type { ProjectConfig } from "@/types/project";

interface EnvironmentSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

/**
 * "Ortamlar" settings tab (T-50). A project's `config` is the shared base
 * every environment deploys with by default; adding an environment here
 * lets it override just the fields that actually differ (host, credentials,
 * ...) instead of every environment silently hitting the same server. See
 * `backend/src/utils/environmentConfig.js` for the exact resolution rule
 * this UI edits, and TriggerModal for where the resulting distinction
 * becomes visible to whoever clicks "Deploy".
 */
export const EnvironmentSettings = ({ config, onChange }: EnvironmentSettingsProps) => {
  const environments = config.environments || {};
  const names = Object.keys(environments);

  const handleOverrideChange = (name: string, nextOverride: Partial<ProjectConfig>) => {
    onChange({ ...config, environments: { ...environments, [name]: nextOverride } });
  };

  const handleRemove = (name: string) => {
    const next = { ...environments };
    delete next[name];
    onChange({ ...config, environments: next });
  };

  const handleAdd = (name: string) => {
    if (environments[name]) return;
    onChange({ ...config, environments: { ...environments, [name]: {} } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-md border border-border/50 bg-accent/20 px-3.5 py-3">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Bu proje varsayılan olarak tek bir paylaşılan yapılandırma kullanır. Aşağıya bir ortam
          eklerseniz yalnızca doldurduğunuz alanlar geçersiz kılınır — boş bıraktığınız her alan
          tabandaki değeri miras alır.
        </p>
      </div>

      {names.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/80">
          Henüz ortam bazlı bir yapılandırma yok — Dev, Stage ve Prod hepsi aynı sunucuya deploy
          eder.
        </p>
      ) : (
        <div className="space-y-3">
          {names.map((name) => (
            <EnvironmentEntry
              key={name}
              name={name}
              override={environments[name] || {}}
              baseConfig={config}
              onChange={(next) => handleOverrideChange(name, next)}
              onRemove={() => handleRemove(name)}
            />
          ))}
        </div>
      )}

      <div className="border-t border-border/50 pt-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ortam Ekle
        </h5>
        <EnvironmentAddControl existingNames={names} onAdd={handleAdd} />
      </div>
    </div>
  );
};
