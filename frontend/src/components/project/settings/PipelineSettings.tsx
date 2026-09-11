import { Building2, FolderGit2, GitBranch, Hash, Hourglass, Link, Tag, Timer, Variable, Workflow } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { PipelineAuthFields } from "@/components/project/settings/PipelineAuthFields";
import { PipelineVariablesEditor } from "@/components/project/settings/PipelineVariablesEditor";
import {
  CI_DEFAULT_BASE_URL,
  CI_PLATFORM_OPTIONS,
  CI_POLL_INTERVAL_SECONDS,
  CI_REF_TYPE_OPTIONS,
  CI_TIMEOUT_MINUTES,
  getCiPlatformCopy,
  getPlatformChangePatch,
  parseOptionalNumber,
  pickOption,
} from "@/components/project/settings/ciPipelineOptions";
import type { CiConfig, ProjectConfig } from "@/types/project";

interface PipelineSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

const INPUT_CLASS = "bg-accent/50 border-border/50";
const HINT_CLASS = "text-[10px] text-muted-foreground/80 mt-1";
const ICON_CLASS = "h-3.5 w-3.5";

/**
 * Settings for the `Pipeline` provider: IDP triggers a Bitbucket Pipelines
 * custom pipeline or a GitHub Actions workflow_dispatch run and follows it.
 * Everything except the credentials is written (immutably) into
 * `config.ciConfig`; the token and Atlassian email are in PipelineAuthFields.
 */
export const PipelineSettings = ({ config, onChange }: PipelineSettingsProps) => {
  const ci: CiConfig = config.ciConfig ?? {};
  const { platform } = ci;
  const isBitbucket = platform === "bitbucket";
  const refType = ci.refType ?? "branch";
  const copy = getCiPlatformCopy(platform);

  const updateCi = (patch: Partial<CiConfig>) => onChange({ ...config, ciConfig: { ...ci, ...patch } });

  const refLabel = isBitbucket ? (refType === "tag" ? "Tag" : "Branch") : "Ref (branch or tag)";

  return (
    <>
      <SettingsField icon={<Workflow className={ICON_CLASS} />} label="CI Platform">
        <Select
          value={platform}
          onValueChange={(value) => updateCi(getPlatformChangePatch(platform, pickOption(CI_PLATFORM_OPTIONS, value)))}
        >
          <SelectTrigger className={INPUT_CLASS}>
            <SelectValue placeholder="Select a CI platform" />
          </SelectTrigger>
          <SelectContent>
            {CI_PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsField icon={<Building2 className={ICON_CLASS} />} label={copy.ownerLabel}>
          <Input
            value={ci.owner || ""}
            onChange={(e) => updateCi({ owner: e.target.value })}
            placeholder={copy.ownerPlaceholder}
            className={INPUT_CLASS}
          />
        </SettingsField>
        <SettingsField icon={<FolderGit2 className={ICON_CLASS} />} label="Repository">
          <Input
            value={ci.repo || ""}
            onChange={(e) => updateCi({ repo: e.target.value })}
            placeholder="my-repo"
            className={INPUT_CLASS}
          />
        </SettingsField>
      </div>

      <div className={isBitbucket ? "grid gap-4 sm:grid-cols-2" : undefined}>
        {isBitbucket && (
          <SettingsField icon={<Tag className={ICON_CLASS} />} label="Ref Type">
            <Select value={refType} onValueChange={(value) => updateCi({ refType: pickOption(CI_REF_TYPE_OPTIONS, value) })}>
              <SelectTrigger className={INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CI_REF_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
        )}
        <SettingsField icon={<GitBranch className={ICON_CLASS} />} label={refLabel}>
          <Input
            value={ci.ref || ""}
            onChange={(e) => updateCi({ ref: e.target.value })}
            placeholder={isBitbucket && refType === "tag" ? "v2.5.0" : "master"}
            className={INPUT_CLASS}
          />
        </SettingsField>
      </div>

      <SettingsField icon={<Workflow className={ICON_CLASS} />} label={copy.pipelineLabel}>
        <Input
          value={ci.pipeline || ""}
          onChange={(e) => updateCi({ pipeline: e.target.value })}
          placeholder={copy.pipelinePlaceholder}
          className={INPUT_CLASS}
        />
      </SettingsField>

      <PipelineAuthFields config={config} onChange={onChange} />

      <SettingsField icon={<Link className={ICON_CLASS} />} label="API Base URL (optional)">
        <Input
          value={ci.baseUrl || ""}
          onChange={(e) => updateCi({ baseUrl: e.target.value })}
          placeholder={CI_DEFAULT_BASE_URL[platform ?? "bitbucket"]}
          className={INPUT_CLASS}
        />
        <p className={HINT_CLASS}>Leave empty for the default. https:// only. GitHub Enterprise: https://HOST/api/v3</p>
      </SettingsField>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsField icon={<Timer className={ICON_CLASS} />} label="Poll Interval (s)">
          <Input
            type="number"
            min={CI_POLL_INTERVAL_SECONDS.min}
            max={CI_POLL_INTERVAL_SECONDS.max}
            step={1}
            value={ci.pollIntervalSeconds ?? ""}
            onChange={(e) => updateCi({ pollIntervalSeconds: parseOptionalNumber(e.target.value) })}
            placeholder={String(CI_POLL_INTERVAL_SECONDS.fallback)}
            className={INPUT_CLASS}
          />
        </SettingsField>
        <SettingsField icon={<Hourglass className={ICON_CLASS} />} label="Timeout (min)">
          <Input
            type="number"
            min={CI_TIMEOUT_MINUTES.min}
            max={CI_TIMEOUT_MINUTES.max}
            step={1}
            value={ci.timeoutMinutes ?? ""}
            onChange={(e) => updateCi({ timeoutMinutes: parseOptionalNumber(e.target.value) })}
            placeholder={String(CI_TIMEOUT_MINUTES.fallback)}
            className={INPUT_CLASS}
          />
          <p className={HINT_CLASS}>IDP stops watching after this, but does not cancel the run.</p>
        </SettingsField>
      </div>

      {platform === "github" && (
        <SettingsField icon={<Hash className={ICON_CLASS} />} label="Correlation input name (optional)">
          <Input
            value={ci.correlationInput || ""}
            onChange={(e) => updateCi({ correlationInput: e.target.value })}
            placeholder="idp_correlation_id"
            className={`${INPUT_CLASS} font-mono`}
          />
          <p className={HINT_CLASS}>
            For GitHub Enterprise versions that don't return the run id: a workflow input that receives IDP's
            correlation id. Include it in the workflow's run-name.
          </p>
        </SettingsField>
      )}

      <SettingsField icon={<Variable className={ICON_CLASS} />} label="Pipeline Variables">
        <PipelineVariablesEditor value={ci.variables} onChange={(variables) => updateCi({ variables })} />
      </SettingsField>
    </>
  );
};
