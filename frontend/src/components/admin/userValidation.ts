export const MIN_PASSWORD_LENGTH = 8;
export const MIN_USERNAME_LENGTH = 3;

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidUsername(username: string): boolean {
  const value = username.trim();
  return value.length >= MIN_USERNAME_LENGTH && value.length <= 64 && USERNAME_PATTERN.test(value);
}

type ValidationDetail = {
  path?: unknown;
  message?: unknown;
};

/** Preserves field-level validation returned through the Electron IPC bridge. */
export function formatUserError(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  if (Array.isArray(details)) {
    const messages = details
      .map((detail: ValidationDetail) => {
        if (typeof detail?.message !== 'string') return null;
        const field = typeof detail.path === 'string' && detail.path ? `${detail.path}: ` : '';
        return `${field}${detail.message}`;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) return messages.join(' ');
  }

  return error instanceof Error ? error.message : 'Unknown error.';
}
