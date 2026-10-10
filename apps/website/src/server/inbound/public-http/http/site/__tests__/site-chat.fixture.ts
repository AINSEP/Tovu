import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

/** Real filesystem readiness fixtures; no module mocks and no dependency on a prior local build. */
export function useSiteChatBuild({ test, ready }: {
  test: TestContext; ready: boolean;
}, _options = {}): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'vsc-assets-'));
  const keys = ['TOVU_SITE_CHAT_DIST', 'TOVU_SITE_CHAT_DEV_PROXY_URL'] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.TOVU_SITE_CHAT_DIST = directory;
  delete process.env.TOVU_SITE_CHAT_DEV_PROXY_URL;
  if (ready) for (const name of ['site-assistant-loader.js', 'site-assistant.js', 'site-assistant.css', 'site-assistant-vanilla.js', 'site-assistant-vanilla.css']) writeFileSync(path.join(directory, name), 'fixture');
  test.after(() => {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    });
    rmSync(directory, { recursive: true, force: true });
  });
}
