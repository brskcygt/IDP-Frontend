import { AlertTriangle, ShieldQuestion } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsField } from "@/components/project/settings/SettingsField";
import type { HostKeyPolicy, ProjectConfig } from "@/types/project";

interface HostKeyPolicyFieldProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
}

const POLICY_OPTIONS: { value: HostKeyPolicy; label: string; description: string }[] = [
  {
    value: 'tofu',
    label: 'TOFU (önerilen)',
    description: 'İlk bağlantıda öğren, sonra değişirse durdur (önerilen)',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Sadece daha önce kaydedilmiş anahtarı kabul et',
  },
  {
    value: 'insecure',
    label: 'Insecure',
    description: 'Doğrulama yok',
  },
];

/**
 * SSH host key verification policy selector (T-17b). Backend reads this
 * from `config.hostKeyPolicy`, defaulting to `'tofu'` when unset — see
 * `types/project.ts` for the policy semantics.
 */
export const HostKeyPolicyField = ({ config, onChange }: HostKeyPolicyFieldProps) => {
  const policy = config.hostKeyPolicy || 'tofu';
  const selected = POLICY_OPTIONS.find((option) => option.value === policy);

  return (
    <SettingsField icon={<ShieldQuestion className="h-3.5 w-3.5" />} label="Host Key Politikası">
      <Select
        value={policy}
        onValueChange={(value) => onChange({ ...config, hostKeyPolicy: value as HostKeyPolicy })}
      >
        <SelectTrigger className="bg-accent/50 border-border/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {POLICY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <p className="mt-1 text-[10px] text-muted-foreground/80">{selected.description}</p>
      )}

      {policy === 'insecure' && (
        <div className="mt-2 flex items-start gap-2.5 rounded-md border-l-2 border-red-500 bg-red-950/30 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <p className="text-[12.5px] leading-relaxed text-red-400">
            Sunucu kimliği doğrulanmayacak. Araya giren biri SSH parolanızı veya vault'tan çekilen
            üretim kimliğini ele geçirebilir.
          </p>
        </div>
      )}
    </SettingsField>
  );
};
