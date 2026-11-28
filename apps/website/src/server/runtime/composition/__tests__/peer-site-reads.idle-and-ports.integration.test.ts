/**
 * @file Peer-site read resolver edges the catalog tests do not reach: the read-only redirect port,
 * the peer's own clock, the fixed refusal for an unexpected open failure, and idle timers that
 * expire, fail to close, or fire while a read is still running.
 */
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from '@jini-ai/core';
import { REDIRECT_ENTITY_TYPE } from '@jini-ai/cms/trash/site/adapters/redirect';
import { openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { SqliteTrashRepo } from '#src/features/trash/index';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import { CrossSiteUnavailable, createPeerSiteReads } from '../peer-site-reads.js';
import { peerFixture } from './peer-site-reads.fixture.js';

const context = (): ToolExecutionContext => ({
  executionId: 'execution', principal: { id: 'active-owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal,
});

const inspection = (handler: ToolRegistration['handler']): ToolRegistration[] => [{
  descriptor: { id: 'inspect', readOnly: true, inputSchema: { type: 'object', properties: {} } },
  policy: { authorize: () => 'allow' }, handler,
}];

/** A timer port that records callbacks instead of scheduling them, so a test fires idle expiry itself. */
function capturedTimers() {
  const callbacks: Array<() => void> = [];
  const schedule = ((callback: () => void) => { callbacks.push(callback); return { unref() {} }; }) as unknown as typeof setTimeout;
  return { callbacks, schedule };
}

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

async function resolveDeps(t: TestContext) {
  const f = await peerFixture(t);
  let deps: AssistantToolRegistryDeps | undefined;
  const resolved = await f.peer.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: ({ deps: peerDeps }, _optional = {}) => { deps = peerDeps; return inspection(async () => null); } });
  assert.notEqual(resolved, 'current');
  assert.ok(deps);
  return { f, deps };
}

test("the peer's redirect write port answers Trash reads from the peer's own rows and poisons everything else", async t => {
  const f0 = await peerFixture(t);
  const trashed = (workspaceId: string, entityId: string) => ({ id: `trash-${entityId}`, workspaceId, entityType: REDIRECT_ENTITY_TYPE, entityId,
    trashedAt: '2026-10-16T00:00:00.000Z', purgeAfter: '2099-01-01T00:00:00.000Z', actorPrincipalId: 'someone', actorPluginId: null,
    displayTitle: entityId, displaySubtitle: null, entityVersion: 1, priorMarker: null });
  await new SqliteTrashRepo({ store: f0.b.kernel }).insert({ row: trashed(f0.b.workspaceId, 'b-gone') });
  await new SqliteTrashRepo({ store: f0.a.kernel }).insert({ row: trashed(f0.a.workspaceId, 'a-gone') });
  let deps: AssistantToolRegistryDeps | undefined;
  await f0.peer.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f0.a.ownerId,
    buildRegistrations: ({ deps: peerDeps }, _optional = {}) => { deps = peerDeps; return inspection(async () => null); } });
  const port = (deps as unknown as Record<string, Record<string, unknown>>).redirectsWriteDeps!;
  const isInTrash = port.isInTrash as (input: { workspaceId: string; id: string }) => Promise<boolean>;
  assert.equal(await isInTrash({ workspaceId: f0.b.workspaceId, id: 'b-gone' }), true);
  assert.equal(await isInTrash({ workspaceId: f0.b.workspaceId, id: 'b-live' }), false);
  // A's Trash row is in A's database; the peer port must never see it.
  assert.equal(await isInTrash({ workspaceId: f0.a.workspaceId, id: 'a-gone' }), false);
  assert.equal(port.then, undefined, 'awaiting the port does not throw');
  assert.throws(() => String(port.save), error => error instanceof CrossSiteUnavailable && error.field === 'redirectsWriteDeps.save');
});

test("the peer's clock reports the real current time as ISO text", async t => {
  const { deps } = await resolveDeps(t);
  const before = Date.now();
  const iso = deps.clock.nowIso();
  const after = Date.now();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(iso) >= before - 1 && Date.parse(iso) <= after + 1, `${iso} is now`);
});

test('an unexpected failure opening a peer is the fixed refusal without its path, and later reads still run', async t => {
  const f = await peerFixture(t);
  let fail = true;
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options,
    openContent: (<DB>(required: { filePath: string }, optional: { readOnly?: boolean } = {}) => {
      if (fail) throw new Error(`EACCES: permission denied, open '${required.filePath}'`);
      return openSqliteFileKernel<DB>(required, optional);
    }) as typeof openSqliteFileKernel });
  t.after(() => port.close());
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId, buildRegistrations: () => inspection(async () => 'b') };
  await assert.rejects(port.resolve(required), error => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, 'This site cannot be read. Open it in Tovu and try again.');
    assert.ok(!error.message.includes(f.home));
    return true;
  });
  fail = false;
  const resolved = await port.resolve(required);
  assert.notEqual(resolved, 'current');
  assert.equal(resolved !== 'current' && await resolved.handler(context()), 'b');
});

test('a bag idle for exactly idleMs is closed on the next read and rebuilt', async t => {
  const f = await peerFixture(t);
  const { schedule } = capturedTimers();
  let clock = 0, builds = 0, closes = 0;
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, idleMs: 100, now: () => clock, schedule,
    openContent: (<DB>(required: { filePath: string }, optional: { readOnly?: boolean } = {}) => {
      const kernel = openSqliteFileKernel<DB>(required, optional);
      return { ...kernel, close: async () => { closes++; await kernel.close(); } };
    }) as typeof openSqliteFileKernel });
  t.after(() => port.close());
  const read = () => port.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: () => { builds++; return inspection(async () => null); } });
  await read();
  clock = 99;
  await read();
  assert.deepEqual({ builds, closes }, { builds: 1, closes: 0 }, 'still warm one tick before expiry');
  clock = 199;
  await read();
  assert.deepEqual({ builds, closes }, { builds: 2, closes: 2 }, 'the expired bag closed its content and journal, then a fresh bag opened');
});

test('an idle bag whose close fails is logged, not thrown, and the resolver keeps working', async t => {
  const f = await peerFixture(t);
  const { callbacks, schedule } = capturedTimers();
  const errors = t.mock.method(console, 'error', () => {});
  let failClose = true;
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, schedule,
    openContent: (<DB>(required: { filePath: string }, optional: { readOnly?: boolean } = {}) => {
      const kernel = openSqliteFileKernel<DB>(required, optional);
      return { ...kernel, close: async () => { await kernel.close(); if (failClose) throw new Error('disk vanished'); } };
    }) as typeof openSqliteFileKernel });
  t.after(() => port.close());
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId, buildRegistrations: () => inspection(async () => 'b') };
  await port.resolve(required);
  callbacks.at(-1)!();
  await settle();
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0]!.arguments[0], '[peer-sites] Could not close an idle site');
  assert.equal(errors.mock.calls[0]!.arguments[1], 'Error', 'the cause is logged by its redacted class name');
  failClose = false;
  const again = await port.resolve(required);
  assert.equal(again !== 'current' && await again.handler(context()), 'b');
});

test('an idle timer that fires while a read is running leaves the bag open until the read ends', async t => {
  const f = await peerFixture(t);
  const { callbacks, schedule } = capturedTimers();
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, schedule });
  t.after(() => port.close());
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const selected = await port.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: () => inspection(async () => { await gate; return 'done'; }) });
  assert.notEqual(selected, 'current');
  if (selected === 'current') return;
  const timerBeforeRead = callbacks.at(-1)!;
  const reading = selected.handler(context());
  try {
    timerBeforeRead();
    await settle();
    assert.equal(f.chatHandles[0]!.open, true, 'a busy bag is not closed by its idle timer');
  } finally { release(); }
  assert.equal(await reading, 'done');
  callbacks.at(-1)!();
  await settle();
  assert.equal(f.chatHandles[0]!.open, false, 'the timer re-armed after the read closes the idle bag');
});

test("a peer site with no themes folder still resolves and lists no themes, on open and on every later read", async t => {
  const f = await peerFixture(t);
  fs.rmSync(path.join(f.b.dir, 'themes'), { recursive: true });
  let deps: AssistantToolRegistryDeps | undefined;
  const resolved = await f.peer.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: ({ deps: peerDeps }, _optional = {}) => { deps = peerDeps; return inspection(async () => null); } });
  assert.notEqual(resolved, 'current');
  assert.ok(deps);
  const peerThemes = deps as unknown as { themesDir: string; themes: unknown[] };
  assert.equal(peerThemes.themesDir, path.join(f.b.dir, 'themes'));
  assert.deepEqual(peerThemes.themes, []);
});
