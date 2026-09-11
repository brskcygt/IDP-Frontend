/**
 * Pure helpers for the CI Pipeline variables editor. Limits mirror the
 * backend's ciConfig validation (backend/src/validation/projectSchemas.js):
 * key pattern, values of at most 2000 characters, at most 25 entries.
 */
export const MAX_CI_VARIABLES = 25;
export const MAX_CI_VARIABLE_VALUE_LENGTH = 2000;
export const CI_VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Matches the pattern but can't round-trip as a plain object key. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['__proto__']);

export interface CiVariableRow {
  id: string;
  key: string;
  value: string;
}

/** `null` = fine (a blank key is simply not saved yet). */
export type CiVariableRowIssue = 'invalid' | 'duplicate' | null;

let rowCounter = 0;

export const createVariableRow = (key = '', value = ''): CiVariableRow => ({
  id: `ci-var-${rowCounter++}`,
  key,
  value,
});

export const rowsFromVariables = (variables: Record<string, string> | undefined): CiVariableRow[] =>
  Object.entries(variables ?? {}).map(([key, value]) => createVariableRow(key, value));

/** Per-row issue, index-aligned with `rows`. The first row of a repeated key wins. */
export const getVariableRowIssues = (rows: readonly CiVariableRow[]): CiVariableRowIssue[] => {
  const seen = new Set<string>();
  return rows.map(({ key }) => {
    if (key === '') return null;
    if (!CI_VARIABLE_KEY_PATTERN.test(key) || RESERVED_KEYS.has(key)) return 'invalid';
    if (seen.has(key)) return 'duplicate';
    seen.add(key);
    return null;
  });
};

/** Only rows with a non-blank, valid, first-occurrence key end up in the saved map. */
export const rowsToVariables = (rows: readonly CiVariableRow[]): Record<string, string> => {
  const issues = getVariableRowIssues(rows);
  const variables: Record<string, string> = {};
  rows.forEach((row, index) => {
    if (row.key !== '' && issues[index] === null) variables[row.key] = row.value;
  });
  return variables;
};

/** Stable string form used to tell an external config change apart from the editor's own edits. */
export const serializeVariables = (variables: Record<string, string> | undefined): string =>
  JSON.stringify(variables ?? {});
