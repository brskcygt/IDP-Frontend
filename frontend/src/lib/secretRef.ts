/**
 * Recognizes the `secret://<projectId>/<fieldPath>` reference strings the
 * backend leaves behind in `config.environments.*` after a save (T-50).
 *
 * Base-level secrets (`config.password`, etc.) never reach the client at
 * all — `redactProject` on the backend swaps them for `has*` booleans.
 * Environment-override secrets aren't covered by that redaction (they live
 * under a dynamic `environments.<name>.` path `redactProject` doesn't know
 * about), so the client sees the literal reference string instead of the
 * real value. This helper is what lets the settings UI treat that string
 * the same way it treats a `has*` flag: "something is saved here, don't
 * show it, don't blank it out unless the user actually types a replacement."
 */
const SECRET_REF_PREFIX = 'secret://';

export const isSecretRef = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(SECRET_REF_PREFIX);
