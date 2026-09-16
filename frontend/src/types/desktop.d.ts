/**
 * Type declaration for the `window.idp` bridge exposed by the Electron
 * preload script (`desktop/preload/index.js`) via `contextBridge`.
 *
 * Business calls do not go through this bridge: the renderer is served from
 * `app://idp` and reaches the configured IDP server over same-origin HTTP
 * (`/api/*`, forwarded by the main process — see
 * `desktop/main/remoteBackend.js`). What is left here is the two
 * desktop-only features that have to run on the operator's machine.
 *
 * `window.idp` exists only inside the Electron shell; in a plain browser tab
 * it is `undefined`, and `getTransport()` (see `services/transport/index.ts`)
 * uses `httpTransport` instead.
 *
 * Every method here returns a `Promise`, backed by `ipcRenderer.invoke`.
 */

export type IdpUpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; currentVersion: string; notes: string }
  | { status: 'downloading'; version: string; notes: string; progress: number }
  | { status: 'installing'; version: string; notes: string; progress: number }
  | { status: 'error'; version: string; message: string };

export interface IdpDesktopBridge {
  mode: 'remote';
  agentBuilder: {
    build(input: import('@/services/transport/types').AgentBuildInput): Promise<import('@/services/transport/types').AgentBuildResult>;
  };
  update: {
    getVersion(): Promise<string>;
    getState(): Promise<IdpUpdateState>;
    install(): Promise<void>;
    dismiss(): Promise<void>;
    onState(callback: (state: IdpUpdateState) => void): () => void;
  };
}

declare global {
  interface Window {
    /** Present only inside the Electron renderer; absent in the browser. */
    idp?: IdpDesktopBridge;
  }
}
