/**
 * Turns the structured events the backend smuggles through the log stream into
 * a single percentage for the progress bar.
 *
 * The backend pushes them as `__EVENT__:{json}` log lines
 * (backend/src/core/deployment/progressEvents.js) because there is no separate
 * SSE channel. Nothing consumed them before, so they showed up as raw text in
 * the terminal — they are now pulled out of the stream here instead.
 *
 * Two kinds of producer exist:
 *  - the agent's artifact deploy, which names the stage it is in
 *    (backend/src/core/artifacts/contracts.js DEPLOY_STAGES); the stage is what
 *    tells us how far along the run is, since only some stages report a
 *    percentage of their own (a download does, a service restart does not);
 *  - Jenkins, which has no stages and reports an elapsed-vs-estimate figure
 *    (backend/src/adapters/jenkinsProgress.js); that number is used as-is.
 */

const EVENT_LINE_PREFIX = '__EVENT__:';

export type DeployProgress = {
  /** Component the event belongs to, e.g. 'backend' — null for build events. */
  component: string | null;
  /** Stage name as reported, e.g. 'downloading' or 'building'. */
  stage: string;
  /** 'started' | 'progress' | 'done' | 'failed' | 'skipped' as reported. */
  status: string;
  /** 0-100; never decreasing while the run stays on the same component. */
  percent: number;
  message: string | null;
};

/**
 * Where each artifact-deploy stage begins and ends on the bar. The spans are
 * rough but ordered, and a stage reporting its own progress interpolates inside
 * its span — that is as honest as it gets without timing every step.
 */
const STAGE_SPAN: Record<string, readonly [number, number]> = {
  accepted: [0, 4],
  downloading: [4, 38],
  verifying: [38, 48],
  extracting: [48, 60],
  preserving: [60, 65],
  configuring: [65, 71],
  stopping: [71, 75],
  switching: [75, 81],
  pre_start: [81, 85],
  starting: [85, 91],
  health_check: [91, 98],
  cleanup: [98, 100],
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/** True for the lines that carry an event rather than console output. */
export const isDeploymentEventLine = (line: string) => line.includes(EVENT_LINE_PREFIX);

type RawEvent = { type: string; payload?: Record<string, unknown> };

/** Parses one log line into its event, or null when it is ordinary output. */
export const parseDeploymentEventLine = (line: string): RawEvent | null => {
  const at = line.indexOf(EVENT_LINE_PREFIX);
  if (at === -1) return null;
  try {
    const parsed = JSON.parse(line.slice(at + EVENT_LINE_PREFIX.length)) as RawEvent;
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

const asString = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null);
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Percentage for one event, or null when the event says nothing about position
 * (an unknown stage without its own number).
 */
const percentFor = (stage: string, status: string, reported: number | null): number | null => {
  const span = STAGE_SPAN[stage];
  if (!span) return reported === null ? null : clampPercent(reported);
  const [start, end] = span;
  if (status === 'done' || status === 'skipped') return end;
  if (reported === null) return start;
  return clampPercent(start + (clampPercent(reported) / 100) * (end - start));
};

/**
 * Folds an event line into the run's progress.
 *
 * Returns `current` unchanged for lines that are not events. The bar never
 * moves backwards *within* a component — a rollback walks back through the
 * stages and would otherwise rewind it — but it does restart when the run moves
 * on to the next component, because a deploy replays every stage once per
 * component and the number of components is not known up front. The component
 * name is always shown next to the number for that reason.
 */
export const advanceProgress = (current: DeployProgress | null, line: string): DeployProgress | null => {
  const event = parseDeploymentEventLine(line);
  if (!event) return current;

  const payload = event.payload ?? {};
  const stage = asString(payload.stage);
  if (!stage) return current;

  const component = asString(payload.component);
  const status = asString(payload.status) ?? 'progress';
  const percent = percentFor(stage, status, asNumber(payload.progress));
  const sameComponent = current !== null && current.component === component;
  const floor = sameComponent ? current.percent : 0;

  return {
    component,
    stage,
    status,
    percent: Math.max(floor, percent ?? (sameComponent ? current.percent : 0)),
    message: asString(payload.message),
  };
};

/** Human-readable stage names; unknown stages fall back to the raw name. */
const STAGE_LABEL: Record<string, string> = {
  accepted: 'Queued',
  downloading: 'Downloading artifact',
  verifying: 'Verifying checksum',
  extracting: 'Extracting',
  preserving: 'Preserving data',
  configuring: 'Writing runtime config',
  stopping: 'Stopping service',
  switching: 'Switching release',
  pre_start: 'Pre-start checks',
  starting: 'Starting service',
  health_check: 'Health check',
  rolling_back: 'Rolling back',
  cleanup: 'Cleanup',
  building: 'Building',
};

/** Short label for the bar, e.g. "backend · Health check". */
export const progressLabel = (progress: DeployProgress): string => {
  const stage = STAGE_LABEL[progress.stage] ?? progress.stage.replace(/_/g, ' ');
  return progress.component ? `${progress.component} · ${stage}` : stage;
};
