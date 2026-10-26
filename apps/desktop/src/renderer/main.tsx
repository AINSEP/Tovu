/**
 * @file Renderer composition root: wires the real `document`, `createRoot` and `<App />` into
 * `mountRenderer` (tested in `mount-renderer.test.ts`). No logic of its own lives here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipLayer } from '@jini-ai/ui';
import { App } from './App.js';
import { mountRenderer } from './mount-renderer.js';
// Before `app.css`, whose `.sites-settings-dialog` rules override it. Imported here rather than in
// `SitesFolders.tsx` so that module stays loadable (and testable) outside Vite.
import '@jini-ai/ui/tabbed-dialog.css';
import './app.css';
import './SharedKeys.css';

mountRenderer({
  document,
  createRoot,
  app: (
    <StrictMode>
      <App />
      <TooltipLayer />
    </StrictMode>
  ),
});
