import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { RootKeyBanner } from './RootKeyBanner.js';
import './app.css';

const root = document.getElementById('root');
if (root == null) throw new Error('renderer: #root missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/*
      Above `<App/>` and OUTSIDE it, deliberately: a missing integrations root key is a condition of
      the whole install, not of any one screen, so it must not be able to disappear in a refactor of
      `App`'s tree — and it must be visible whichever screen the operator lands on. Renders nothing
      at all when a key is present. See `RootKeyBanner.tsx`.
    */}
    <RootKeyBanner />
    <App />
  </StrictMode>,
);
