import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from '@jini-ai/daemon';
import { delegatedToolExecuteRoute } from '@jini-ai/daemon/http';
import { buildFsFilesRegistrations } from '../tool-registrations.js';

/** Owner 2026-10-23: exercise actual delegated dispatch, not a schema visibility assertion. */
test('delegated filesystem tools preserve the active site boundary and hide outside canaries', async t => {
  const base = mkdtempSync(join(tmpdir(), 'fs-site-delegation-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const site = join(base, 'site'); const outside = join(base, 'site-peer');
  mkdirSync(site); mkdirSync(outside);
  writeFileSync(join(site, 'inside.txt'), 'INSIDE_CANARY');
  writeFileSync(join(outside, 'outside-name-canary.txt'), 'OUTSIDE_CONTENT_CANARY');
  if (process.platform !== 'win32') symlinkSync(outside, join(site, 'escape'));
  const registrations = buildFsFilesRegistrations({ workspaceId: 'fixture-workspace', siteBinding: { dir: site },
    authorize: async () => ({ allowed: true }) as never, resolveRoots: () => ({ site, repo: base, custom: outside }),
  });
  const registry = createToolRegistry({});
  for (const registration of registrations) registry.register(registration);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'site-boundary' });
  t.after(() => lifecycle.finish({ runId: run.id, status: 'succeeded', code: 0, signal: null, resumable: false }));
  const deps = { lifecycle, toolRegistry: registry, toolExecutor: createToolExecutor({ registry }),
    resolvePrincipal: () => ({ id: 'site-owner' }),
  };
  const execute = (toolId: string, input: Record<string, unknown>) => delegatedToolExecuteRoute.handle({ deps, input: {
    runId: run.id, toolUseId: `probe-${toolId}-${Math.random()}`, toolId, input, requireReadOnly: true,
  } });
  for (const toolId of ['fs_read_file', 'fs_list_files']) {
    for (const input of [
      { root: 'repo', path: 'site-peer/outside-name-canary.txt' },
      { root: 'custom', path: 'outside-name-canary.txt' },
      { root: 'site', path: '../site-peer/outside-name-canary.txt' },
      { root: 'site', path: join(outside, 'outside-name-canary.txt') },
      { root: 'site', path: 'inside.txt', site: 'peer' },
    ]) {
      const result = await execute(toolId, input);
      assert.equal(result.ok, false, 'A delegated outside read/list must be rejected');
      assert.ok(!JSON.stringify(result).includes('OUTSIDE_CONTENT_CANARY'));
    }
  }
  const read = await execute('fs_read_file', { root: 'site', path: 'inside.txt' });
  assert.ok(read.ok && read.value.result.status === 'completed');
  assert.ok(JSON.stringify(read).includes('INSIDE_CANARY'));
  const listing = await execute('fs_list_files', { root: 'site' });
  assert.ok(listing.ok && listing.value.result.status === 'completed');
  assert.ok(!JSON.stringify(listing).includes('outside-name-canary.txt'));
  assert.ok(!JSON.stringify(listing).includes('OUTSIDE_CONTENT_CANARY'));
  if (process.platform !== 'win32') {
    const escaped = await execute('fs_read_file', { root: 'site', path: 'escape/outside-name-canary.txt' });
    assert.equal(escaped.ok, false);
    assert.ok(!JSON.stringify(escaped).includes('OUTSIDE_CONTENT_CANARY'));
  }
});
