import { KeyValueEditor } from "@/components/settings/KeyValueEditor";

interface PipelineVariablesEditorProps {
  value: Record<string, string> | undefined;
  onChange: (nextVariables: Record<string, string>) => void;
}

/**
 * Key/value editor for `ciConfig.variables` — non-secret values passed to the
 * pipeline run. The editing behaviour lives in KeyValueEditor, which the build
 * parameters editor shares: both maps become environment variables in a build
 * and the backend validates them with the same rules.
 */
export const PipelineVariablesEditor = ({ value, onChange }: PipelineVariablesEditorProps) => (
  <KeyValueEditor
    value={value}
    onChange={onChange}
    noun="Değişken"
    emptyHint="Henüz değişken yok. Her biri pipeline çalışmasına gönderilir; örn. CUSTOMER ya da VERSION."
    footnote={
      "Değişkenler gizli değildir: projeyi görebilen herkes görür. Kimlik bilgilerini " +
      "Bitbucket / GitHub secured variable ya da secret olarak tutun."
    }
  />
);
