/** Thin Tovu adapter: Electron owns the version; this channel exposes only its string value. */
import { resolveOnPath } from '@jini-ai/agent-runtime';
import { execFile } from 'node:child_process';
import { RUNNER_APP_VERSION_CHANNEL } from './contracts/app-version.ts';

/** Resolves the nearest `desktop-v*` tag name, e.g. `desktop-v0.1.24`, or rejects. */
export type DescribeDesktopTag = (input: { cwd: string }) => Promise<string>;

/** Real git port. Async so a slow or missing git never holds up the window opening. */
export const describeDesktopTag: DescribeDesktopTag = ({ cwd }) => new Promise((resolve, reject) => {
  const command = resolveOnPath({ bin: 'git' });
  if (command === null) throw new Error('git executable is unavailable.');
  execFile(command, ['describe', '--tags', '--match', 'desktop-v*', '--abbrev=0'],
    { cwd, timeout: 5_000, windowsHide: true },
    (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
});

/**
 * Release tags bump package.json only on the tag commit, so a dev launch from any branch showed
 * the last bumped version and passed for an older release (owner 2026-10-26). Dev therefore shows
 * the nearest `desktop-v*` tag plus `-dev`, or package.json's version plus `-dev` without git.
 * Never rejects. @complexity O(1) besides one git process.
 */
export async function devAppVersion(
  { repoRoot, packageVersion }: { repoRoot: string; packageVersion: string },
  { describeTag = describeDesktopTag }: { describeTag?: DescribeDesktopTag } = {},
): Promise<string> {
  try {
    const tag = (await describeTag({ cwd: repoRoot })).trim();
    if (tag.startsWith('desktop-v') && tag.length > 'desktop-v'.length) return `${tag.slice('desktop-v'.length)}-dev`;
  } catch { /* no git, not a checkout, or no tag: the package fallback below is still marked dev */ }
  return `${packageVersion}-dev`;
}

/**
 * Register once before the sites home window opens. Native IPC/getVersion errors propagate.
 * Packaged builds read app.getVersion() on each request; a dev launch starts one git read here.
 * @param required The native IPC registration and Electron app ports.
 * @param optional The repo root git runs in, and the git port for tests.
 * @returns Nothing; registers one read-only handler.
 * @complexity O(1) time and space per registration and request.
 */
export function registerAppVersionIpc(
  { ipcMain, app }: {
    ipcMain: { handle: (channel: string, listener: () => string | Promise<string>) => void };
    app: { getVersion: () => string; isPackaged: boolean };
  },
  { repoRoot = process.cwd(), describeTag }: { repoRoot?: string; describeTag?: DescribeDesktopTag } = {},
): void {
  if (app.isPackaged) {
    ipcMain.handle(RUNNER_APP_VERSION_CHANNEL, () => app.getVersion());
    return;
  }
  const dev = devAppVersion({ repoRoot, packageVersion: app.getVersion() }, { describeTag });
  ipcMain.handle(RUNNER_APP_VERSION_CHANNEL, () => dev);
}
