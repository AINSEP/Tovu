/**
 * @file P11 ST-1a.T — the isolated probe's packaged `main` (see `electron-builder.probe.yml`). Kept
 * separate from `main.ts` so the fixture tests can import the launcher without loading Electron.
 * The dispatch runs synchronously at module evaluation, so every profile path is set before `ready`.
 */
import { app, BrowserWindow, session } from "electron";

import { bootProbe } from "./electron-host.ts";

bootProbe({ electron: { app, BrowserWindow, session }, argv: process.argv });
