/**
 * @file Renderer composition root: wires the real `document`, `createRoot` and `<App />` into
 * `mountRenderer` (from `@jini-ai/ui/browser`, tested there). No logic of its own lives here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipLayer } from '@jini-ai/ui';
import { mountRenderer } from '@jini-ai/ui/browser';
import { UiKitProvider } from '@jini-ai/ui/react-kit';
import { uiKit } from './jini-kits.js';
import { ChatSurfacesProvider } from '@jini-ai/chat/react';
import { chatSurfaces } from './jini-surfaces.js';
import { App } from './App.js';
import { installShellErrorReporting } from './product-telemetry.js';
import { storageSheetSlot } from './storage-sheet-slot.js';
import { STORAGE_SHEET_ENABLED, type StorageSheetBridge } from '../contracts/storage-sheet.js';
// Before `app.css`, whose `.sites-settings-dialog` rules override it. Imported here rather than in
// `SitesFolders.tsx` so that module stays loadable (and testable) outside Vite.
import '@jini-ai/ui/tabbed-dialog.css';
import '@jini-ai/ui/site-card.css';
import './app.css';
import './SharedKeys.css';

installShellErrorReporting({ target: window });
// P11 ST-18a.T: undefined while STORAGE_SHEET_ENABLED is off, so the sites home shows no Storage entry.
const storageSheet = storageSheetSlot({ enabled: STORAGE_SHEET_ENABLED, bridge: (window as { tovuStorageSheet?: StorageSheetBridge }).tovuStorageSheet });
mountRenderer({
  document,
  createRoot,
  app: (
    <StrictMode>
      <UiKitProvider kit={uiKit}>
        <ChatSurfacesProvider surfaces={chatSurfaces}>
          <App sitesSettings={{ storageSheet }} />
        </ChatSurfacesProvider>
        <TooltipLayer />
      </UiKitProvider>
    </StrictMode>
  ),
});
