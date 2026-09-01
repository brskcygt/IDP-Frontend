import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `fileURLToPath` rather than `new URL(...).pathname` — the latter percent-encodes
// characters like spaces, which breaks the alias when the project lives in a path
// such as ".../Internal Developer Platform (IDP)/".
const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  // Relative base (T-91): the Electron production build is loaded via
  // `win.loadFile('frontend/dist/index.html')` — a `file://` URL. Vite's
  // default `base: '/'` emits `<script src="/assets/...">`, which under
  // `file://` resolves to the FILESYSTEM ROOT (`file:///assets/...`), not
  // relative to index.html — the asset 404s, the bundle never loads, and
  // the window renders a blank white page (React never mounts). `'./'`
  // makes every emitted asset reference relative to index.html itself,
  // which resolves correctly both under `file://` (Electron) and when
  // served over HTTP (the browser build, unaffected — a relative path
  // still resolves the same way from a server root). Vite's dev server is
  // unaffected either way; this only changes emitted `build` output.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // NOTE: the /socket.io proxy was removed along with the dead WebSocket
      // transport (T-41). Deployment logs stream over SSE via /api/deploy/logs.
    },
  },
});
