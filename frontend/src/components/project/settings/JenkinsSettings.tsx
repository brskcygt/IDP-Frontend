import { Link, Server, User, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import type { ProjectConfig } from "@/types/project";

interface JenkinsSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

export const JenkinsSettings = ({ config, onChange }: JenkinsSettingsProps) => {
  return (
    <>
      <SettingsField icon={<Link className="h-3.5 w-3.5" />} label="Jenkins URL">
        <Input
          value={config.url || ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="http://jenkins.local:8080"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<Server className="h-3.5 w-3.5" />} label="Jenkins Job Name">
        <Input
          value={config.jobName || ''}
          onChange={(e) => onChange({ ...config, jobName: e.target.value })}
          placeholder="my-pipeline-job"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Username">
        <Input
          value={config.username || ''}
          onChange={(e) => onChange({ ...config, username: e.target.value })}
          placeholder="admin"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="API Token">
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
