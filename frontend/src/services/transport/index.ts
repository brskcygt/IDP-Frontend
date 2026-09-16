/**
 * Transport factory — the one place that decides which `Transport`
 * implementation the app is running against.
 *
 * In the Electron shell (`window.idp` present) business calls are same-origin
 * HTTP against `app://idp`, which the main process forwards to the configured
 * IDP server — see `./remoteTransport.ts`. The shell only adds the two
 * desktop-only namespaces on top of `httpTransport`.
 *
 * In a plain browser tab (`window.idp` undefined): relative `fetch`, proxied
 * by Vite in dev.
 */
import { httpTransport } from './httpTransport';
import { createRemoteTransport } from './remoteTransport';
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

  const idp = typeof window !== 'undefined' ? window.idp : undefined;
  resolved = idp ? createRemoteTransport() : httpTransport;

  return resolved;
}

/** Test/EOL hook: forget the cached instance so the next call re-resolves. */
export function resetTransport(): void {
  resolved = null;
}

export type * from './types';
