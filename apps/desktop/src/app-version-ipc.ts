/** Thin Tovu adapter: Electron owns the version; this channel exposes only its string value. */
import { RUNNER_APP_VERSION_CHANNEL } from './contracts/app-version.ts';

/**
 * Register once before the sites home window opens. Native IPC/getVersion errors propagate.
 * @param required The native IPC registration and Electron app ports.
 * @returns Nothing; registers one read-only handler without caching the version.
 * @complexity O(1) time and space per registration and request.
 */
export function registerAppVersionIpc(
  { ipcMain, app }: {
    ipcMain: { handle: (channel: string, listener: () => string) => void };
    app: { getVersion: () => string };
  },
  _options = {},
): void {
  ipcMain.handle(RUNNER_APP_VERSION_CHANNEL, () => app.getVersion());
}
