import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_CI_VARIABLES,
  MAX_CI_VARIABLE_KEY_LENGTH,
  MAX_CI_VARIABLE_VALUE_LENGTH,
  createVariableRow,
  getVariableRowIssues,
  rowsFromVariables,
  rowsToVariables,
  serializeVariables,
} from "@/components/project/settings/ciPipelineVariables";
import type { CiVariableRow } from "@/components/project/settings/ciPipelineVariables";

interface PipelineVariablesEditorProps {
  value: Record<string, string> | undefined;
  onChange: (nextVariables: Record<string, string>) => void;
}

const INPUT_CLASS = "h-8 text-xs bg-accent/50 border-border/50";

const ISSUE_MESSAGE = {
  invalid:
    `Invalid key: letters, digits and _ only, not starting with a digit, at most ${MAX_CI_VARIABLE_KEY_LENGTH} ` +
    "characters; __proto__, constructor and prototype are reserved. This row will not be saved.",
  duplicate: "Duplicate key: only the first row with this key is saved.",
} as const;

/**
 * Key/value editor for `ciConfig.variables` — non-secret values passed to the
 * pipeline run. Rows live in local state because the saved map can't hold a
 * half-typed or invalid row; only valid rows are written back via `onChange`.
 */
export const PipelineVariablesEditor = ({ value, onChange }: PipelineVariablesEditorProps) => {
  const serialized = serializeVariables(value);
  const [rows, setRows] = useState<CiVariableRow[]>(() => rowsFromVariables(value));
  const [syncedFrom, setSyncedFrom] = useState(serialized);

  // Re-seed rows only when the map changed from outside (e.g. another project
  // was loaded) — never in response to this editor's own writes.
  if (serialized !== syncedFrom) {
    setSyncedFrom(serialized);
    setRows(rowsFromVariables(value));
  }

  const commit = (nextRows: CiVariableRow[]) => {
    const nextVariables = rowsToVariables(nextRows);
    setRows(nextRows);
    setSyncedFrom(serializeVariables(nextVariables));
    onChange(nextVariables);
  };

  const updateRow = (id: string, patch: Partial<Pick<CiVariableRow, "key" | "value">>) => {
    commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    commit(rows.filter((row) => row.id !== id));
  };

  // A blank row doesn't change the saved map, so there's nothing to emit yet.
  const addRow = () => {
    if (rows.length >= MAX_CI_VARIABLES) return;
    setRows([...rows, createVariableRow()]);
  };

  const issues = getVariableRowIssues(rows);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground/80 italic">
          No variables yet. Each one is passed to the pipeline run, e.g. CUSTOMER or VERSION.
        </p>
      )}

      {rows.map((row, index) => {
        const issue = issues[index];
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => updateRow(row.id, { key: e.target.value })}
                placeholder="KEY"
                aria-label={`Variable ${index + 1} key`}
                aria-invalid={issue !== null}
                className={cn(INPUT_CLASS, "w-2/5 shrink-0 font-mono", issue && "border-destructive")}
              />
              <Input
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                maxLength={MAX_CI_VARIABLE_VALUE_LENGTH}
                placeholder="value"
                aria-label={`Variable ${index + 1} value`}
                className={INPUT_CLASS}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeRow(row.id)}
                aria-label={`Remove variable ${row.key || index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {issue && <p className="text-[10px] text-destructive">{ISSUE_MESSAGE[issue]}</p>}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={rows.length >= MAX_CI_VARIABLES}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Variable {rows.length > 0 ? `(${rows.length}/${MAX_CI_VARIABLES})` : ""}
      </Button>
      <p className="text-[10px] text-muted-foreground/80">
        Variables are not secret: anyone who can view this project sees them. Keep credentials in
        Bitbucket / GitHub secured variables or secrets.
      </p>
    </div>
  );
};
