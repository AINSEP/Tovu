/**
 * @file Renderer composition root: wires the real `document`, `createRoot` and `<App />` into
 * `mountRenderer` (tested in `mount-renderer.test.ts`). No logic of its own lives here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { mountRenderer } from './mount-renderer.js';
import './app.css';

mountRenderer({
  document,
  createRoot,
  app: (
    <StrictMode>
      <App />
    </StrictMode>
  ),
});
