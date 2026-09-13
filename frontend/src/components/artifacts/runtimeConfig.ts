import type { ArtifactComponentConfig } from '@/types/project';
import type {
  ComponentTargetRuntimeConfig,
  TargetRuntimeConfig,
  TargetRuntimeConfigFormat,
} from '@/services/transport/types';

export interface RuntimeConfigEditorState {
  format: TargetRuntimeConfigFormat;
  text: string;
}

export type RuntimeConfigEditors = Record<string, RuntimeConfigEditorState>;

const isComponentConfig = (value: unknown): value is {
  format: TargetRuntimeConfigFormat;
  values: Record<string, string>;
} => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { format?: unknown; values?: unknown };
  return (candidate.format === 'frontend-config-js' || candidate.format === 'env-file')
    && Boolean(candidate.values)
    && typeof candidate.values === 'object'
    && !Array.isArray(candidate.values)
    && Object.values(candidate.values as Record<string, unknown>).every((entry) => typeof entry === 'string');
};

export const defaultRuntimeConfigFormat = (
  component: ArtifactComponentConfig,
): TargetRuntimeConfigFormat => component.runtime.type === 'iis-static' ? 'frontend-config-js' : 'env-file';

const valuesToText = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');

export const createRuntimeConfigEditors = (
  components: ArtifactComponentConfig[],
  runtimeConfig: TargetRuntimeConfig | null | undefined,
): RuntimeConfigEditors => {
  const raw = runtimeConfig ?? {};
  const componentAware = Object.values(raw).some(isComponentConfig);
  const legacyValues = componentAware ? {} : raw as Record<string, string>;
  const flaggedLegacyRecipients = components.filter((component) => component.writeRuntimeConfig);
  const fallbackLegacyRecipient = components.find((component) =>
    component.name.toLowerCase() === 'frontend' || component.runtime.type === 'iis-static'
  ) ?? components[0];
  const legacyRecipients = new Set(
    (flaggedLegacyRecipients.length > 0 ? flaggedLegacyRecipients : fallbackLegacyRecipient ? [fallbackLegacyRecipient] : [])
      .map((component) => component.name),
  );

  return Object.fromEntries(components.map((component) => {
    const saved = componentAware ? raw[component.name] : undefined;
    const spec = isComponentConfig(saved) ? saved : null;
    const values = spec?.values ?? (legacyRecipients.has(component.name) ? legacyValues : {});
    return [component.name, {
      format: spec?.format ?? defaultRuntimeConfigFormat(component),
      text: valuesToText(values),
    }];
  }));
};

export const parseRuntimeConfigEditors = (
  components: ArtifactComponentConfig[],
  editors: RuntimeConfigEditors,
): ComponentTargetRuntimeConfig => Object.fromEntries(components.map((component) => {
  const editor = editors[component.name] ?? {
    format: defaultRuntimeConfigFormat(component),
    text: '',
  };
  const values: Record<string, string> = {};

  for (const rawLine of editor.text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const separator = rawLine.indexOf('=');
    if (separator < 1) {
      throw new Error(`${component.name}: runtime config line must be KEY=value: ${rawLine}`);
    }
    const key = rawLine.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`${component.name}: invalid runtime config key: ${key}`);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`${component.name}: duplicate runtime config key: ${key}`);
    }
    values[key] = rawLine.slice(separator + 1);
  }

  return [component.name, { format: editor.format, values }];
}));
