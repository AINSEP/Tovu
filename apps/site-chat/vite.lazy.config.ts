import path from 'node:path';
import { defineConfig } from 'vite';
import { forbidAdminImports } from './vite-public-guard';

/** Build-only wiring: coordinator builds Jini first; the running React dev entry is unaffected. */
export default defineConfig({
  plugins: [forbidAdminImports],
  build: { outDir: 'dist', emptyOutDir: false, copyPublicDir: false,
    lib: { entry: path.resolve(import.meta.dirname, 'src/loader-entry.ts'), name: 'TovuSiteChatLoader', formats: ['iife'], fileName: () => 'site-assistant-loader.js' },
  },
});
