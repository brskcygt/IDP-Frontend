export type LogLevel = 'error' | 'warn' | 'success' | 'info';

export type ParsedLogLine = {
  /** Stable across re-renders and filtering — never the raw array index alone. */
  id: string;
  /** ISO-8601 timestamp the adapter stamped on the line, when present. */
  timestamp: string | null;
  /** Subsystem tag (`VPN`, `Jenkins`, `SSH:Bash`, `SSH:Bash:stderr`, ...), when present. */
  source: string | null;
  level: LogLevel;
  /** Line with the timestamp/source prefixes stripped off. */
  text: string;
  /** The untouched line exactly as the adapter emitted it. */
  raw: string;
};

// Adapters stamp every line via `[${new Date().toISOString()}] ...`.
const TIMESTAMP_PATTERN = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]\s*/;
// Subsystem tag: `[VPN]`, `[Jenkins]`, `[SSH:Bash]`, `[SSH:Bash:stderr]`, `[WinRM]`, `[PMP]`, `[System]`, `[MFA]`...
const SOURCE_PATTERN = /^\[([^\]]+)\]\s*/;

const ERROR_PATTERN = /✗|\bERROR\b|\bstderr\b|\bfailed\b/i;
const WARN_PATTERN = /⚠|\bWARNING\b|\bwarn\b/i;
const SUCCESS_PATTERN = /✓/;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

/** Small, dependency-free string hash — good enough to disambiguate duplicate lines. */
const hashText = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const detectLevel = (raw: string): LogLevel => {
  if (ERROR_PATTERN.test(raw)) return 'error';
  if (WARN_PATTERN.test(raw)) return 'warn';
  if (SUCCESS_PATTERN.test(raw)) return 'success';
  return 'info';
};

/**
 * Turns one raw stream line into the structured columns the terminal renders.
 *
 * Adapters emit free-form text (`[ISO timestamp] [Source] message`), so every
 * field beyond `text` / `raw` is optional: a line missing a timestamp or
 * source prefix still parses cleanly, it just leaves those columns empty
 * instead of inventing a value.
 *
 * `index` is folded into `id` purely to disambiguate two identical lines —
 * callers must not rely on it for ordering, and rendering code must still key
 * off `id`, never off the array index directly.
 */
export const parseLogLine = (raw: string, index: number): ParsedLogLine => {
  let rest = raw.replace(ANSI_PATTERN, '');
  let timestamp: string | null = null;
  let source: string | null = null;

  const timeMatch = rest.match(TIMESTAMP_PATTERN);
  if (timeMatch) {
    timestamp = timeMatch[1];
    rest = rest.slice(timeMatch[0].length);
  }

  const sourceMatch = rest.match(SOURCE_PATTERN);
  if (sourceMatch) {
    source = sourceMatch[1];
    rest = rest.slice(sourceMatch[0].length);
  }

  return {
    id: `${index}-${hashText(raw)}`,
    timestamp,
    source,
    level: detectLevel(rest),
    text: rest.trimEnd(),
    raw,
  };
};

export const LEVEL_MARK: Readonly<Record<LogLevel, string>> = {
  error: 'xx',
  warn: '!!',
  success: 'ok',
  info: '>>',
};

export const LEVEL_TEXT_CLASS: Readonly<Record<LogLevel, string>> = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  success: 'text-emerald-400',
  info: 'text-zinc-300',
};
