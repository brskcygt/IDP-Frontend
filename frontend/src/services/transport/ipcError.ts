/**
 * Error unwrapping for the handful of calls that still cross Electron's IPC
 * boundary — the desktop-only namespaces in `remoteTransport.ts`. Business
 * calls go over HTTP and never come through here.
 */

interface IdpErrorPayload {
  __idpError: true;
  kind: string;
  message: string;
  details?: unknown;
}

/** An `Error` reconstructed from a serialized `core/errors.js` typed error, carrying `.kind`/`.details` so callers can branch on it instead of only reading `.message`. */
export class IpcTransportError extends Error {
  kind: string;
  details?: unknown;

  constructor(payload: IdpErrorPayload) {
    super(payload.message);
    this.name = 'IpcTransportError';
    this.kind = payload.kind;
    this.details = payload.details;
  }
}

/**
 * Undoes Electron's IPC error wrapping and reconstructs a typed error.
 *
 * `ipcRenderer.invoke` rejects with a plain `Error` whose `.message` is
 * `"Error invoking remote method '<channel>': " + String(thrownError)`.
 * Since the main-process handler throws `new Error(JSON.stringify(...))`, the
 * tail of that message is exactly our JSON payload — extracted here by
 * scanning for the first `{`, which is safe because nothing follows the JSON
 * payload in the wrapped message.
 */
function parseIpcError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Unknown IPC error');
  }

  const start = err.message.indexOf('{');
  if (start === -1) return err;

  try {
    const parsed = JSON.parse(err.message.slice(start)) as IdpErrorPayload;
    if (parsed && parsed.__idpError) {
      return new IpcTransportError(parsed);
    }
  } catch {
    // Not our JSON payload — fall through to the raw error below.
  }
  return err;
}

/** Wraps a `window.idp.*` promise so every rejection becomes a `parseIpcError()`-processed `Error`. */
export async function callIpc<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    throw parseIpcError(err);
  }
}
