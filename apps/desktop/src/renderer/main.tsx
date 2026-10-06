/**
 * @file Renderer composition root: wires the real `document`, `createRoot` and `<App />` into
 * `mountRenderer` (tested in `mount-renderer.test.ts`). No logic of its own lives here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { mountRenderer } from './mount-renderer.js';
// `@jini-ai/chat`'s structural layout (opt-in: no colors or spacing), BEFORE `app.css` so the
// host's `.runner-chat-pane .jini-*` rules win. Without it the composer's native file input shows.
import '@jini-ai/chat/react/styles/reference.css';
import './app.css';
import './desktop-chat.css';

mountRenderer({
  document,
  createRoot,
  app: (
    <StrictMode>
      <App />
    </StrictMode>
  ),
});
