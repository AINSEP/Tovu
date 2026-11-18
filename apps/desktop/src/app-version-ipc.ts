/** Thin Tovu adapter: Electron owns the version; this channel exposes only its string value. */
import { resolveOnPath } from '@jini-ai/agent-runtime';
import { registerAppVersionBridge } from '@jini-ai/desktop-host/electron';
import type { DescribeReleaseTag } from '@jini-ai/desktop-host/electron';
import { execFile } from 'node:child_process';
import { RUNNER_APP_VERSION_CHANNEL } from './contracts/app-version.ts';

/**
 * Resolves the nearest `desktop-v*` tag name, e.g. `desktop-v0.1.24`, or rejects.
 * Real git port. Async so a slow or missing git never holds up the window opening.
 */
export const describeDesktopTag: DescribeReleaseTag = ({ cwd }) => new Promise((resolve, reject) => {
  const command = resolveOnPath({ bin: 'git' });
  if (command === null) throw new Error('git executable is unavailable.');
  execFile(command, ['describe', '--tags', '--match', 'desktop-v*', '--abbrev=0'],
    { cwd, timeout: 5_000, windowsHide: true },
    (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
});

/** Tovu's release-tag convention: `desktop-v<version>`; anything else (or the bare prefix) is not a release tag. */
const desktopVersionFromTag = (tag: string): string | null =>
  tag.startsWith('desktop-v') && tag.length > 'desktop-v'.length ? tag.slice('desktop-v'.length) : null;

/**
 * Register once before the sites home window opens. Native IPC/getVersion errors propagate.
 * Packaged builds read app.getVersion() on each request; a dev launch starts one git read here.
 *
 * Release tags bump package.json only on the tag commit, so a dev launch from any branch showed
 * the last bumped version and passed for an older release (owner 2026-10-26). Dev therefore shows
 * the nearest `desktop-v*` tag plus `-dev`, or package.json's version plus `-dev` without git.
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
  { repoRoot = process.cwd(), describeTag }: { repoRoot?: string; describeTag?: DescribeReleaseTag } = {},
): void {
  registerAppVersionBridge({
    ipcMain,
    app,
    channel: RUNNER_APP_VERSION_CHANNEL,
    repoRoot,
    describeTag: describeTag ?? describeDesktopTag,
    versionFromTag: desktopVersionFromTag,
    devSuffix: '-dev',
  });
}
