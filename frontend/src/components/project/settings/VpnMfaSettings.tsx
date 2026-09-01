import { KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import type { MfaType, ProjectConfig } from "@/types/project";

interface VpnMfaSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

/** MFA type, session caching, and TOTP secret for the active VPN connection. */
export const VpnMfaSettings = ({ config, onChange }: VpnMfaSettingsProps) => {
  const mfaConfig = config.vpnConfig?.mfaConfig;

  return (
    <div className="border-t border-border/50 pt-4 mt-2">
      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">MFA & Session Settings</h5>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">MFA Type</Label>
          <Select
            value={mfaConfig?.type || 'none'}
            onValueChange={(val) => {
              onChange({
                ...config,
                vpnConfig: {
                  ...config.vpnConfig,
                  mfaConfig: { ...mfaConfig, type: val as MfaType },
                },
              });
            }}
          >
            <SelectTrigger className="bg-accent/50 border-border/50 text-xs">
              <SelectValue placeholder="Select MFA Type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None / Password Only</SelectItem>
              <SelectItem value="push">Push Notification (Authenticator App)</SelectItem>
              <SelectItem value="totp">TOTP 6-Digit Code</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border bg-accent/50 text-primary focus:ring-primary/20"
            checked={mfaConfig?.rememberSession || false}
            onChange={(e) => onChange({
              ...config,
              vpnConfig: {
                ...config.vpnConfig,
                mfaConfig: { ...mfaConfig, rememberSession: e.target.checked },
              },
            })}
          />
          Remember session / cookie for subsequent deploys (Recommended)
        </label>

        {mfaConfig?.type === 'totp' && (
          <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="TOTP Secret Key (Optional for auto-generate)">
            <Input
              type="password"
              value={mfaConfig?.secret || ''}
              onChange={(e) => onChange({
                ...config,
                vpnConfig: {
                  ...config.vpnConfig,
                  mfaConfig: { ...mfaConfig, secret: e.target.value },
                },
              })}
              placeholder={mfaConfig?.hasSecret ? SAVED_SECRET_PLACEHOLDER : "JBSWY3DPEHPK3PXP"}
              className="bg-accent/50 border-border/50 text-xs"
            />
            <SecretHint show={!!mfaConfig?.hasSecret} />
          </SettingsField>
        )}
      </div>
    </div>
  );
};
