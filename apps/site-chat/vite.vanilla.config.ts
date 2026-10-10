import path from 'node:path';
import { defineConfig } from 'vite';
import { forbidAdminImports } from './vite-public-guard';

/** No React plugin or React runtime enters this standalone visitor bundle. */
export default defineConfig({
  plugins: [forbidAdminImports, { name: 'site-chat-vanilla-import-guard',
    load(id) {
      if (/\/node_modules\/(?:react|react-dom)\//.test(id) || /\/packages\/chat\/dist\/react\//.test(id) || /remixicon\.(?:css|woff2)/.test(id)) {
        throw new Error('Vanilla chat must not include React or the RemixIcon webfont');
      }
    },
  }],
  build: { outDir: 'dist', emptyOutDir: false, copyPublicDir: false, cssCodeSplit: false,
    lib: { entry: path.resolve(import.meta.dirname, 'src/vanilla-entry.ts'), name: 'TovuSiteAssistantVanilla', formats: ['iife'], fileName: () => 'site-assistant-vanilla.js' },
    rollupOptions: { output: { assetFileNames: 'site-assistant-vanilla.[ext]' } },
  },
});
