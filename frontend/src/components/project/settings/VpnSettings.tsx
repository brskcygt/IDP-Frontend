import { Link, Monitor, User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import { VpnMfaSettings } from "@/components/project/settings/VpnMfaSettings";
import { VpnActions } from "@/components/project/settings/VpnActions";
import type { ProjectConfig, VpnProviderType } from "@/types/project";

interface VpnSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
  projectId: string;
}

/** VPN & Gateway tab: provider selection, gateway credentials, MFA, and session actions. */
export const VpnSettings = ({ config, onChange, projectId }: VpnSettingsProps) => {
  const vpnConfig = config.vpnConfig;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">VPN Provider</Label>
        <Select
          value={config.vpnEnabled ? (vpnConfig?.type || 'none') : 'none'}
          onValueChange={(val) => {
            if (val === 'none') {
              onChange({ ...config, vpnEnabled: false });
            } else {
              onChange({
                ...config,
                vpnEnabled: true,
                vpnConfig: { ...vpnConfig, type: val as VpnProviderType },
              });
            }
          }}
        >
          <SelectTrigger className="bg-accent/50 border-border/50">
            <SelectValue placeholder="Select VPN..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (Direct Connection)</SelectItem>
            <SelectItem value="globalprotect">Palo Alto (GlobalProtect - Password)</SelectItem>
            <SelectItem value="globalprotect-saml">GlobalProtect (SAML)</SelectItem>
            <SelectItem value="anyconnect">Cisco AnyConnect</SelectItem>
            <SelectItem value="openvpn">OpenVPN</SelectItem>
            <SelectItem value="wireguard">WireGuard</SelectItem>
            <SelectItem value="fortinet">Fortinet</SelectItem>
            <SelectItem value="checkpoint">Check Point Endpoint Security</SelectItem>
            <SelectItem value="ssh-jump">SSH Bastion / SOCKS5</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.vpnEnabled && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <SettingsField icon={<Link className="h-3.5 w-3.5" />} label="Gateway Host / IP">
                <Input
                  value={vpnConfig?.host || ''}
                  onChange={(e) => onChange({ ...config, vpnConfig: { ...vpnConfig, host: e.target.value } })}
                  placeholder="vpn.company.com"
                  className="bg-accent/50 border-border/50"
                />
              </SettingsField>
            </div>
            <div className="col-span-1">
              <SettingsField icon={<Monitor className="h-3.5 w-3.5" />} label="Port">
                <Input
                  value={vpnConfig?.port || ''}
                  onChange={(e) => onChange({ ...config, vpnConfig: { ...vpnConfig, port: e.target.value } })}
                  placeholder="443"
                  className="bg-accent/50 border-border/50"
                />
              </SettingsField>
            </div>
          </div>

          {vpnConfig?.type !== 'wireguard' && (
            <>
              <SettingsField icon={<User className="h-3.5 w-3.5" />} label="VPN Username">
                <Input
                  value={vpnConfig?.username || ''}
                  onChange={(e) => onChange({ ...config, vpnConfig: { ...vpnConfig, username: e.target.value } })}
                  placeholder="jdoe"
                  className="bg-accent/50 border-border/50"
                />
              </SettingsField>
              <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="VPN Password">
                <Input
                  type="password"
                  value={vpnConfig?.password || ''}
                  onChange={(e) => onChange({ ...config, vpnConfig: { ...vpnConfig, password: e.target.value } })}
                  placeholder={vpnConfig?.hasPassword ? SAVED_SECRET_PLACEHOLDER : "••••••••••••"}
                  className="bg-accent/50 border-border/50"
                />
                <SecretHint show={!!vpnConfig?.hasPassword} />
              </SettingsField>
            </>
          )}

          {(vpnConfig?.type === 'openvpn' || vpnConfig?.type === 'wireguard') && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configuration Content (.ovpn / .conf)</Label>
              <Textarea
                value={vpnConfig?.configContent || ''}
                onChange={(e) => onChange({ ...config, vpnConfig: { ...vpnConfig, configContent: e.target.value } })}
                placeholder="Paste configuration file content here..."
                className="bg-accent/50 border-border/50 font-mono text-xs h-28 resize-y"
              />
            </div>
          )}

          <VpnMfaSettings config={config} onChange={onChange} />
          <VpnActions projectId={projectId} />
        </>
      )}
    </div>
  );
};
