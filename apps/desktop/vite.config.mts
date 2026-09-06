import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The fleet renderer's build. Ported from Tovu-Runner's own `vite.config.ts`; the two deviations
 * from it are noted inline.
 *
 * `.mts` rather than `.ts` on purpose: it pins the config to ESM independently of this package's
 * `"type"` field, so the `import.meta.url` above can never be compiled into a CommonJS context.
 */
export default defineConfig({
  // The renderer is loaded over `file://` from the packaged app, so every asset reference has to be
  // relative — an absolute `/assets/...` would resolve to the filesystem root and 404.
  root: path.join(here, 'src/renderer'),
  base: './',
  // `@jini-ai/chat` brings its own React import graph. Force it and the app through this build's
  // single copy so hooks never cross React instances inside the Electron window.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
  build: {
    outDir: path.join(here, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    // Fixed and strict so a launcher can hand Electron this exact URL without probing for whatever
    // port Vite picked. Host pinned to the IPv4 loopback explicitly: on this machine the bare
    // `localhost` default resolves to `::1` only, so Electron's `loadURL` would connection-refuse
    // against `127.0.0.1`. Port 5175 — 5173 is Tovu admin's Vite and 5174 is Tovu-Runner's, and all
    // three can be running at once on this machine.
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    // Runner also allowed a sibling `../Jini` checkout here, because it consumed Jini through
    // `file:` dependencies. This package resolves `@jini-ai/chat` from the registry into its own
    // `node_modules`, so there is no out-of-tree path to allow.
    fs: {
      allow: [here],
    },
  },
});
