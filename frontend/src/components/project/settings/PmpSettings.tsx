import { Link, User, KeyRound, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import { PmpStepList } from "@/components/project/settings/PmpStepList";
import type { ProjectConfig } from "@/types/project";

interface PmpSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

/**
 * Settings for the PMP (Playwright portal automation) provider.
 *
 * SECURITY (SEC-03/T-12): automation is authored as a whitelisted step list
 * (`config.steps`), not free-form script text. The backend refuses to run
 * `config.scriptContent` — any project still carrying one is shown it
 * read-only below, with a prompt to rebuild it as steps.
 */
export const PmpSettings = ({ config, onChange }: PmpSettingsProps) => {
  const hasLegacyScript = !!config.scriptContent;

  return (
    <>
      <SettingsField icon={<Link className="h-3.5 w-3.5" />} label="Script Name">
        <Input
          value={config.script || ''}
          onChange={(e) => onChange({ ...config, script: e.target.value })}
          placeholder="deploy_pmp.js"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>

      {hasLegacyScript && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Bu format güvenlik nedeniyle kaldırıldı, adımlara dönüştürün
          </div>
          <Textarea
            value={config.scriptContent || ''}
            readOnly
            aria-readonly="true"
            className="bg-accent/30 border-destructive/40 font-mono text-xs h-28 resize-y cursor-not-allowed opacity-80"
          />
          <p className="text-[10px] text-muted-foreground/80">
            Bu serbest metin script sunucuda artık çalıştırılmıyor (yalnızca referans için gösteriliyor).
            Aynı otomasyonu aşağıdaki adım listesiyle yeniden oluşturun — adım listesi doluysa deploy
            sırasında o kullanılır.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          PMP Automation Steps
        </Label>
        <PmpStepList
          steps={config.steps || []}
          onChange={(steps) => onChange({ ...config, steps })}
        />
      </div>

      <SettingsField icon={<Link className="h-3.5 w-3.5" />} label="Portal URL">
        <Input
          value={config.url || ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="http://localhost:4000"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Portal Username">
        <Input
          value={config.username || ''}
          onChange={(e) => onChange({ ...config, username: e.target.value })}
          placeholder="portal_user"
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>
      <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="Portal Password">
        <Input
          type="password"
          value={config.password || ''}
          onChange={(e) => onChange({ ...config, password: e.target.value })}
          placeholder={config.hasPassword ? SAVED_SECRET_PLACEHOLDER : "••••••••••••"}
          className="bg-accent/50 border-border/50"
        />
        <SecretHint show={!!config.hasPassword} />
      </SettingsField>
    </>
  );
};
