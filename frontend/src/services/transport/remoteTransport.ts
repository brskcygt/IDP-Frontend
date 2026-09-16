/**
 * remoteTransport — the Electron shell in remote mode (`IDP_SERVER_URL`).
 *
 * The renderer is loaded from `app://idp` (see `desktop/main/remoteBackend.js`):
 * the main process serves the bundled UI from local files and forwards
 * `app://idp/api/*` to the remote IDP server, keeping the session cookie in
 * its own in-memory jar. From the renderer's side the backend is therefore
 * plain same-origin HTTP — exactly what `httpTransport` already speaks, with
 * the default `''` base URL (relative `/api/...` resolves against app://idp,
 * and the SSE log stream's `EventSource` works the same way).
 *
 * `credentials` needs no change: every request is same-origin, and the real
 * session cookie never enters the renderer anyway.
 *
 * Only the desktop-only namespaces differ from `httpTransport`:
 *   - agentBuilder: builds and saves the JAR on THIS machine → IPC. The main
 *     process checks `project:write` against the remote session.
 *   - runners: backed by modules of the embedded (local) backend, which
 *     does not run in remote mode → explicit errors.
 *   - update: not part of `Transport`; components read `window.idp.update`
 *     directly, and the remote bridge still exposes it.
 */
import { createHttpTransport } from './httpTransport';
import { callIpc } from './ipcError';
import type { Transport, AgentBuildInput, AgentBuildResult } from './types';

function unsupported(feature: string): never {
  throw new Error(
    `${feature} uzak modda (IDP_SERVER_URL) desteklenmiyor; yalnızca yerel (gömülü backend) masaüstü modunda çalışır.`
  );
}

function remoteBridge() {
  const idp = typeof window === 'undefined' ? undefined : window.idp;
  if (!idp || idp.mode !== 'remote') {
    throw new Error('remoteTransport used outside the Electron remote-mode renderer.');
  }
  return idp;
}

export function createRemoteTransport(): Transport {
  const http = createHttpTransport('');

  return {
    ...http,

    agentBuilder: {
      async build(input: AgentBuildInput): Promise<AgentBuildResult> {
        return callIpc(remoteBridge().agentBuilder.build(input));
      },
    },

    runners: {
      async list() {
        return unsupported('Runner yönetimi');
      },
      async createEnrollment() {
        return unsupported('Runner kaydı');
      },
      async approveBootstrap() {
        return unsupported('Runner onayı');
      },
      async retire() {
        return unsupported('Runner kaldırma');
      },
      async getRelease() {
        return unsupported('Runner sürümleri');
      },
      async listReleases() {
        return unsupported('Runner sürümleri');
      },
      async activateRelease() {
        return unsupported('Runner sürüm etkinleştirme');
      },
      async createReleaseUploadToken() {
        return unsupported('Runner sürüm yayınlama');
      },
    },
  };
}
