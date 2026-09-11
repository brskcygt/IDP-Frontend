import { KeyRound, ShieldCheck, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import {
  CI_AUTH_TYPE_OPTIONS,
  getCiTokenScopeHint,
  pickOption,
} from "@/components/project/settings/ciPipelineOptions";
import type { CiAuthType, ProjectConfig } from "@/types/project";

interface PipelineAuthFieldsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

const INPUT_CLASS = "bg-accent/50 border-border/50";

/**
 * Credentials for the CI Pipeline provider. The token reuses the shared
 * `apiToken` secret field (same saved-secret handling as Jenkins) and the
 * Atlassian email reuses `username`; only the auth mode lives in `ciConfig`.
 * GitHub always uses a bearer token, so the auth mode is Bitbucket-only.
 */
export const PipelineAuthFields = ({ config, onChange }: PipelineAuthFieldsProps) => {
  const ci = config.ciConfig ?? {};
  const isBitbucket = ci.platform === "bitbucket";
  const authType: CiAuthType = ci.authType ?? "bearer";
  const usesAtlassianEmail = isBitbucket && authType === "basic";

  return (
    <>
      {isBitbucket && (
        <SettingsField icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Authentication">
          <Select
            value={authType}
            onValueChange={(value) =>
              onChange({ ...config, ciConfig: { ...ci, authType: pickOption(CI_AUTH_TYPE_OPTIONS, value) } })
            }
          >
            <SelectTrigger className={INPUT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CI_AUTH_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
      )}

      {usesAtlassianEmail && (
        <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Atlassian Account Email">
          <Input
            type="email"
            value={config.username || ""}
            onChange={(e) => onChange({ ...config, username: e.target.value })}
            placeholder="you@company.com"
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </SettingsField>
      )}

      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="API Token">
        <Input
          type="password"
          value={config.apiToken || ""}
          onChange={(e) => onChange({ ...config, apiToken: e.target.value })}
          placeholder={config.hasApiToken ? SAVED_SECRET_PLACEHOLDER : "••••••••••••"}
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
        <SecretHint show={!!config.hasApiToken} />
        <p className="text-[10px] text-muted-foreground/80 mt-1">{getCiTokenScopeHint(ci.platform, authType)}</p>
      </SettingsField>
    </>
  );
};
