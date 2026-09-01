import { Globe, Server, User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import { useToast } from "@/hooks/use-toast";
import { testPmpConnection } from "@/services/api";
import type { ProjectConfig } from "@/types/project";

interface PmpAuthFieldsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

/** ManageEngine PMP credential fields used as an auth mode for Server/SSH/WinRM. */
export const PmpAuthFields = ({ config, onChange }: PmpAuthFieldsProps) => {
  const { toast } = useToast();

  const handleTestConnection = async () => {
    try {
      const data = await testPmpConnection(config.pmpConfig || {});
      if (data.success) {
        toast({ title: '✅ Connection Verified', description: data.message });
      } else {
        toast({ title: '❌ Error', description: data.message || data.error, variant: 'destructive' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      toast({ title: '❌ Error', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 bg-accent/20 p-3 rounded border border-border/50">
      <SettingsField icon={<Globe className="h-3.5 w-3.5" />} label="PMP Base URL">
        <Input
          value={config.pmpConfig?.baseUrl || ''}
          onChange={(e) => onChange({ ...config, pmpConfig: { ...config.pmpConfig, baseUrl: e.target.value } })}
          placeholder="https://pmp.sirket.com:7272"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<Server className="h-3.5 w-3.5" />} label="Resource Name (Kaynak Adı)">
        <Input
          value={config.pmpConfig?.resourceName || ''}
          onChange={(e) => onChange({ ...config, pmpConfig: { ...config.pmpConfig, resourceName: e.target.value } })}
          placeholder="Azr-jetsrm"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Account Name (Kullanıcı Hesabı)">
        <Input
          value={config.pmpConfig?.accountName || ''}
          onChange={(e) => onChange({
            ...config,
            pmpConfig: { ...config.pmpConfig, accountName: e.target.value },
            username: e.target.value, // Keep synced for underlying adapter
          })}
          placeholder="jetsrmsupport"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="PMP API AuthToken">
        <Input
          type="password"
          value={config.pmpConfig?.authToken || ''}
          onChange={(e) => onChange({ ...config, pmpConfig: { ...config.pmpConfig, authToken: e.target.value } })}
          placeholder={config.pmpConfig?.hasAuthToken ? SAVED_SECRET_PLACEHOLDER : "••••••••••••••••"}
          className="bg-accent/50 border-border/50"
        />
        <SecretHint show={!!config.pmpConfig?.hasAuthToken} />
      </SettingsField>

      {/* Defaults to OFF. Disabling certificate verification exposes vault
          traffic — which carries production credentials — to interception, so
          it has to be a deliberate choice rather than the default. */}
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer mt-2">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border bg-accent/50 text-primary focus:ring-primary/20"
          checked={config.pmpConfig?.allowSelfSigned ?? false}
          onChange={(e) => onChange({
            ...config,
            pmpConfig: { ...config.pmpConfig, allowSelfSigned: e.target.checked }
          })}
        />
        <span>
          Allow Self-Signed SSL
          {config.pmpConfig?.allowSelfSigned && (
            <span className="block text-amber-500 mt-0.5">
              ⚠ Certificate verification is disabled for this vault connection.
              Prefer trusting your internal CA via NODE_EXTRA_CA_CERTS.
            </span>
          )}
        </span>
      </label>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTestConnection}
        className="w-full mt-2"
      >
        Test PMP Connection
      </Button>
    </div>
  );
};
