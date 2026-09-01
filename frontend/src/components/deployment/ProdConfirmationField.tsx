import { Input } from "@/components/ui/input";

interface ProdConfirmationFieldProps {
  projectName: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Type-to-confirm field shown in TriggerModal when the target environment
 * is production (T-51). The backend requires `parameters.confirmation` to
 * equal the project's name exactly for a prod deploy — see TriggerModal for
 * where the match is enforced against the Deploy button and where the
 * value is attached to the outgoing request.
 */
export const ProdConfirmationField = ({ projectName, value, onChange }: ProdConfirmationFieldProps) => {
  return (
    <div className="mb-5 space-y-2">
      <label
        htmlFor="prod-confirmation-input"
        className="block text-[12.5px] leading-relaxed text-muted-foreground"
      >
        Onaylamak için proje adını yazın: <span className="font-semibold text-foreground">{projectName}</span>
      </label>
      <Input
        id="prod-confirmation-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={projectName}
        autoComplete="off"
        spellCheck={false}
        className="border-destructive/40 bg-destructive/[0.04] font-mono text-[12.5px] focus-visible:ring-destructive/40"
      />
    </div>
  );
};
