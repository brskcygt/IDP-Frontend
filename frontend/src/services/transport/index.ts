/**
 * Transport factory — the one place that decides which `Transport`
 * implementation the app is running against.
 *
 * T-91: when running inside the Electron shell, `desktop/preload/index.js`
 * exposes the full IPC business-logic bridge on `window.idp` — every
 * `Transport` operation goes through `ipcMain.handle` (see
 * `desktop/main/ipc/*.js`) instead of HTTP. T-90's embedded HTTP server is
 * gone; there is no backend origin to point `httpTransport` at anymore. In
 * a plain browser tab (`window.idp` undefined), behavior is unchanged:
 * relative `fetch`, proxied by Vite in dev.
 */
import { httpTransport } from './httpTransport';
import { ipcTransport } from './ipcTransport';
import type { Transport } from './types';
// `window.idp` is declared globally by `../../types/desktop.d.ts`; it needs
// no explicit import here — tsconfig.app.json's `"include": ["src"]` picks
// up every `.d.ts` file under `src/` automatically.

// Resolved once. `getTransport()` is called from ~20 places, several of them
// inside React Query callbacks that run on every fetch — rebuilding the whole
// transport object each time would allocate needlessly and hand out a new
// object identity, which is a trap for anything that puts it in a dependency
// array.
let resolved: Transport | null = null;

export function getTransport(): Transport {
  if (resolved) return resolved;

  resolved = typeof window !== 'undefined' && window.idp ? ipcTransport : httpTransport;

  return resolved;
}

/** Test/EOL hook: forget the cached instance so the next call re-resolves. */
export function resetTransport(): void {
  resolved = null;
}

export type * from './types';
