/** @file Playwright boundary for Tovu's isolated live-verification app lifecycle. */
import { _electron as electron } from 'playwright';
import type { ElectronApplication as PlaywrightApplication } from 'playwright';
import path from 'node:path';

export type { Page } from 'playwright';
export type ElectronApplication = Pick<PlaywrightApplication, 'firstWindow' | 'evaluate' | 'close'>;

/**
 * Launch one isolated Tovu app, await its probe, and await cleanup even if the probe rejects.
 * @param required Desktop/profile paths and the probe receiving the limited app contract.
 * @param optional Caller environment, runner UI selection and injectable Playwright launcher.
 * @returns Resolves after cleanup; launch, probe and cleanup errors propagate.
 * @example await withTovuVerificationApp({ desktopDir, userDataDir, run });
 */
export async function withTovuVerificationApp(
  { desktopDir, userDataDir, run }: {
    desktopDir: string;
    userDataDir: string;
    run: (required: { app: ElectronApplication }) => Promise<void>;
  },
  { env = process.env, runner = false, launch = electron.launch }: {
    env?: NodeJS.ProcessEnv;
    runner?: boolean;
    launch?: (options: Parameters<typeof electron.launch>[0]) => Promise<ElectronApplication>;
  } = {},
): Promise<void> {
  const app = await launch.call(electron, {
    executablePath: path.join(desktopDir, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    cwd: desktopDir,
    env: { ...env, TOVU_DESKTOP_USER_DATA_DIR: userDataDir, ...(runner ? { TOVU_DESKTOP_UI: 'runner' } : {}) },
  });
  try {
    await run({ app });
  } finally {
    await app.close();
  }
}
