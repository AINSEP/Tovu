import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type test from 'node:test';
import type { ToolExecutionContext, ToolRegistration } from '@jini-ai/core';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock } from '@jini-ai/platform/system';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { discoverAllBuiltInThemes } from '../theme.js';
import { buildThemesRegistrations } from '../tool-registrations.js';
import type { ThemeToolDeps } from '../asset-operations.js';
import { applyBatchInputs } from '../../../assistant/batch-tool-inputs.js';
import { applyToolApprovalPolicy } from '../../../assistant/tool-approval-policy.js';

/**
 * @file A temp theme folder with the real theme tool registrations, for tests of same-file batch edits.
 * No module mocks: the folder is real and the permission check is a plain function the test can replace.
 */

export interface ThemeBatchFixture {
  deps: ThemeToolDeps;
  root: string;
  themeDir: string;
  registrations: ToolRegistration[];
  /** The same registrations before batch `items` wrapped their schemas: what an inner handler is registered with. */
  unbatched: ToolRegistration[];
  /** Runs one tool by id as the owner. */
  run(toolId: string, input: unknown): Promise<unknown>;
  read(file: string): string;
  write(file: string, content: string): void;
}

export function themeBatchFixture(t: test.TestContext, { files }: { files: Record<string, string> }): ThemeBatchFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-batch-'));
  const themeDir = path.join(root, 'copy');
  fs.mkdirSync(themeDir);
  fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify({ id: 'copy', name: 'Copy', version: '1.0.0', tier: 'static', engine: 1 }));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(themeDir, name), content);
  const deps: ThemeToolDeps = {
    workspaceId: 'ws', themesDir: root, themes: discoverAllBuiltInThemes({ dir: root, source: 'built-in' }),
    resolveActiveThemeId: async () => 'copy', authorize: async () => ({ allowed: true, reason: 'matched' }),
  };
  const controller = new AbortController();
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: { newId: () => 'approval' }, defaultChannel: 'mcp-ui' });
  t.after(() => { controller.abort(); fs.rmSync(root, { recursive: true, force: true }); });
  const unbatched = buildThemesRegistrations(deps, { surfaceExchanges: store })
    .map(registration => applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: store } }));
  const registrations = applyBatchInputs({ registrations: unbatched });
  const run = (toolId: string, input: unknown) => {
    const ctx: ToolExecutionContext = { executionId: 'exec', run: { id: 'run' }, principal: { id: 'owner' }, input, signal: controller.signal };
    return registrations.find(r => r.descriptor.id === toolId)!.handler(ctx, {});
  };
  return { deps, root, themeDir, registrations, unbatched, run, read: file => fs.readFileSync(path.join(themeDir, file), 'utf8'), write: (file, content) => fs.writeFileSync(path.join(themeDir, file), content) };
}

export const edit = (path: string, oldString: string, newString: string) => ({ themeId: 'copy', path, oldString, newString });
