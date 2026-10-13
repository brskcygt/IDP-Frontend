import { GitBranch, Layers, Link, Server, User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import type { JenkinsJobType, ProjectConfig } from "@/types/project";

interface JenkinsSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

export const JenkinsSettings = ({ config, onChange }: JenkinsSettingsProps) => {
  const multibranch = config.jobType === 'multibranch';
  return (
    <>
      <SettingsField icon={<Link className="h-3.5 w-3.5" />} label="Jenkins adresi">
        <Input
          value={config.url || ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="http://jenkins.local:8080"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<Layers className="h-3.5 w-3.5" />} label="Job türü">
        <Select
          value={config.jobType ?? 'standard'}
          onValueChange={(value) => onChange({ ...config, jobType: value as JenkinsJobType })}
        >
          <SelectTrigger className="bg-accent/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Pipeline (tek job, branch parametreyle gider)</SelectItem>
            <SelectItem value="multibranch">Multibranch Pipeline (her branch ayrı job)</SelectItem>
          </SelectContent>
        </Select>
        {multibranch && (
          <p className="text-xs text-muted-foreground">
            Derleme, seçilen branch'in ya da tag'in alt job'unda çalışır. Jenkins'in henüz görmediği bir branch için
            önce repo taraması başlatılır. Tag derlemek için multibranch ayarlarında tag keşfi açık olmalı.
          </p>
        )}
      </SettingsField>
      <SettingsField icon={<Server className="h-3.5 w-3.5" />} label={multibranch ? "Multibranch job adı" : "Jenkins job adı"}>
        <Input
          value={config.jobName || ''}
          onChange={(e) => onChange({ ...config, jobName: e.target.value })}
          placeholder={multibranch ? "jetsrm-multibranch" : "my-pipeline-job"}
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      {multibranch && (
        <SettingsField icon={<GitBranch className="h-3.5 w-3.5" />} label="Varsayılan branch">
          <Input
            value={config.defaultBranch || ''}
            onChange={(e) => onChange({ ...config, defaultBranch: e.target.value })}
            placeholder="main"
            className="bg-accent/50 border-border/50"
          />
          <p className="text-xs text-muted-foreground">Branch seçilmeden başlatılan derlemeler bu branch'in job'unda çalışır.</p>
        </SettingsField>
      )}
      <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Kullanıcı adı">
        <Input
          value={config.username || ''}
          onChange={(e) => onChange({ ...config, username: e.target.value })}
          placeholder="admin"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="API token">
        <Input
          type="password"
          value={config.apiToken || ''}
          onChange={(e) => onChange({ ...config, apiToken: e.target.value })}
          placeholder={config.hasApiToken ? SAVED_SECRET_PLACEHOLDER : "••••••••••••"}
          className="bg-accent/50 border-border/50"
        />
        <SecretHint show={!!config.hasApiToken} />
      </SettingsField>
    </>
  );
};
