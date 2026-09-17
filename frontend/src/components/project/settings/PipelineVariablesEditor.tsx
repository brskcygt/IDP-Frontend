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
    noun="Variable"
    emptyHint="No variables yet. Each one is passed to the pipeline run, e.g. CUSTOMER or VERSION."
    footnote={
      "Variables are not secret: anyone who can view this project sees them. Keep credentials in " +
      "Bitbucket / GitHub secured variables or secrets."
    }
  />
);
