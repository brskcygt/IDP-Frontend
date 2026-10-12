/**
 * An HTTP failure that keeps the backend's machine-readable `code` next to the
 * human message, for the few places the UI reacts to a specific refusal
 * instead of only showing it (e.g. PREVIEW_NOT_ALLOWED_ON_PROD).
 */
export class TransportError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'TransportError';
    this.status = status;
    this.code = code;
  }
}

/** The backend refuses to put a composed (preview) release on a production target. */
export const PREVIEW_NOT_ALLOWED_ON_PROD = 'PREVIEW_NOT_ALLOWED_ON_PROD';

export const errorCode = (cause: unknown): string | null =>
  cause instanceof TransportError ? cause.code : null;
