import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Briefcase, FolderCog, KeyRound, Link as LinkIcon, Network, Server, Trash2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import { isSecretRef } from "@/lib/secretRef";
import type { ProjectConfig } from "@/types/project";

type OverrideTextField = "host" | "port" | "username" | "jobName" | "url" | "workDir";

const TEXT_FIELDS: ReadonlyArray<{ field: OverrideTextField; label: string; icon: LucideIcon; placeholder: string }> = [
  { field: "host", label: "Host", icon: Server, placeholder: "10.0.0.1" },
  { field: "port", label: "Port", icon: Network, placeholder: "22" },
  { field: "username", label: "Username", icon: User, placeholder: "deployer" },
  { field: "jobName", label: "Job Name", icon: Briefcase, placeholder: "my-pipeline-job" },
  { field: "url", label: "URL", icon: LinkIcon, placeholder: "https://example.com" },
  { field: "workDir", label: "Work Dir", icon: FolderCog, placeholder: "/opt/app" },
];

/** Blank means "not overridden" — the field key is dropped so the base value is inherited. */
const withTextField = (
  override: Partial<ProjectConfig>,
  field: OverrideTextField,
  value: string,
): Partial<ProjectConfig> => {
  const next = { ...override };
  if (value.trim() === "") {
    delete next[field];
  } else {
    next[field] = value;
  }
  return next;
};

interface EnvironmentEntryProps {
  name: string;
  override: Partial<ProjectConfig>;
  /** The shared base config — used only to render "tabandan: <value>" placeholders. */
  baseConfig: ProjectConfig;
  onChange: (nextOverride: Partial<ProjectConfig>) => void;
  onRemove: () => void;
}

/**
 * One environment's override card (T-50): host/port/username/password/
 * jobName/url/workDir, each inherited from the shared base config unless
 * explicitly set here.
 */
export const EnvironmentEntry = ({ name, override, baseConfig, onChange, onRemove }: EnvironmentEntryProps) => {
  // Captured once on mount so a user clearing the password field back to
  // empty restores the originally-loaded value (which may be a `secret://`
  // reference) instead of blanking it out — mirrors the pickSecret
  // protection `mergeProjectConfig` gives base-level secret fields, which
  // doesn't reach per-environment overrides.
  const originalPassword = useRef(override.password);
  const passwordIsSecret = isSecretRef(override.password);

  const handlePasswordChange = (value: string) => {
    const next = { ...override };
    if (value.trim() === "") {
      if (isSecretRef(originalPassword.current)) {
        next.password = originalPassword.current;
      } else {
        delete next.password;
      }
    } else {
      next.password = value;
    }
    onChange(next);
  };

  return (
    <div className="rounded-md border border-border/50 bg-accent/10 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">{name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-7 px-2 text-muted-foreground hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {TEXT_FIELDS.map(({ field, label, icon: Icon, placeholder }) => {
        const baseValue = baseConfig[field];
        return (
          <SettingsField key={field} icon={<Icon className="h-3.5 w-3.5" />} label={label}>
            <Input
              value={override[field] || ""}
              onChange={(e) => onChange(withTextField(override, field, e.target.value))}
              placeholder={typeof baseValue === "string" && baseValue ? `tabandan: ${baseValue}` : placeholder}
              className="bg-accent/50 border-border/50"
            />
          </SettingsField>
        );
      })}

      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="Password">
        <Input
          type="password"
          value={passwordIsSecret ? "" : override.password || ""}
          onChange={(e) => handlePasswordChange(e.target.value)}
          placeholder={passwordIsSecret ? SAVED_SECRET_PLACEHOLDER : "tabandan miras alınır"}
          className="bg-accent/50 border-border/50"
        />
        <SecretHint show={passwordIsSecret} />
      </SettingsField>
    </div>
  );
};
