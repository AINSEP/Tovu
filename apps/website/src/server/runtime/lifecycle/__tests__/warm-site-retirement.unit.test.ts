import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWarmSiteRetirement, registerWarmSiteRetirement } from '../warm-site-retirement.js';
import { resetAssistantDaemonConnectionForTests, setAssistantDaemonConnection } from '../assistant-daemon-connection.js';
import { ensureAssistantDaemonReady, isAssistantDaemonReady, resetAssistantDaemonSingletonForTests, startAssistantDaemon } from '../daemon-supervisor.js';

test('a completed sitemap regeneration returning 202 still permits automatic warm eviction', async t => {
  const app = express();
  registerWarmSiteRetirement({ app, siteDir: '/unused' }, {
    env: { TOVU_DEV_RETIRE_TOKEN: 'retire', TOVU_DEV_WARM_SITES: '1' },
    hasWork: async () => false,
  });
  app.post('/sitemap/regenerate', async (_req, res) => { await Promise.resolve(); res.status(202).json({ data: { accepted: true } }); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/sitemap/regenerate`, { method: 'POST' })).status, 202);
  assert.equal((await fetch(`${base}/internal/dev-site-retire`, { method: 'POST', headers: { 'x-tovu-retire': 'retire' } })).status, 204);
});

test('warm LRU retirement fences new work before checking whether an assistant is running', async () => {
  let guard!: ReturnType<typeof createWarmSiteRetirement>;
  guard = createWarmSiteRetirement({ hasWork: async () => {
    assert.equal(guard.accepting(), false);
    return true;
  } });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true, 'busy site resumes intake');
});

test('an active job or failed activity check prevents warm eviction until completion', async () => {
  let working = true;
  const guard = createWarmSiteRetirement({ hasWork: async () => working });
  const release = guard.begin();
  assert.equal(await guard.retire(), false);
  release({ background: true });
  assert.equal(await guard.retire(), false);
  working = false;
  assert.equal(await guard.retire(), true);
  const uncertain = createWarmSiteRetirement({ hasWork: async () => { throw new Error('unavailable'); } });
  assert.equal(await uncertain.retire(), false);
});

test('an idle warm site stays fenced until its process is stopped', async () => {
  const guard = createWarmSiteRetirement({ hasWork: async () => false });
  const release = guard.begin(); release({}); release({});
  assert.equal(await guard.retire(), true);
  assert.equal(guard.accepting(), false);
  guard.cancel();
  assert.equal(guard.accepting(), true, 'a canceled eviction must restore the live site');
});

test('an unreadable activity source cannot strand a warm site with intake fenced', async () => {
  const guard = createWarmSiteRetirement({ hasWork: () => new Promise<boolean>(() => {}) }, { activityTimeoutMs: 1 });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true);
});

// --- default activity probe (assistantMayHaveWork) and the retirement middleware's request routing ---

const RETIRE_ENV = { TOVU_DEV_RETIRE_TOKEN: 'retire-tok', TOVU_DEV_WARM_SITES: '1' };

async function serve(t: test.TestContext, app: express.Express): Promise<string> {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function siteDirFixture(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'warm-retire-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Registers the middleware with the module's DEFAULT `hasWork`, so the real assistant probe runs. */
async function retireStatus(t: test.TestContext, { siteDir, hasBackgroundWork }: { siteDir: string; hasBackgroundWork?: () => Promise<boolean> }): Promise<number> {
  const app = express();
  registerWarmSiteRetirement({ app, siteDir, ...(hasBackgroundWork ? { hasBackgroundWork } : {}) }, { env: RETIRE_ENV });
  const base = await serve(t, app);
  return (await fetch(`${base}/internal/dev-site-retire`, { method: 'POST', headers: { 'x-tovu-retire': 'retire-tok' } })).status;
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise(resolve => child.once('exit', resolve));
  assert.ok(child.pid);
  return child.pid;
}

test('default probe: no ready daemon, no delegated connection and no registry record lets an idle site retire', async t => {
  resetAssistantDaemonConnectionForTests();
  assert.equal(await retireStatus(t, { siteDir: await siteDirFixture(t) }), 204);
});

test('default probe: injected background work refuses retirement', async t => {
  resetAssistantDaemonConnectionForTests();
  let probes = 0;
  assert.equal(await retireStatus(t, { siteDir: await siteDirFixture(t), hasBackgroundWork: async () => { probes += 1; return true; } }), 409);
  assert.equal(probes, 1);
});

test('default probe: a live assistant registry record under ops/ protects the site', async t => {
  resetAssistantDaemonConnectionForTests();
  const siteDir = await siteDirFixture(t);
  await mkdir(path.join(siteDir, 'ops'));
  const record = { url: 'http://127.0.0.1:4513', host: '127.0.0.1', port: 4513, pid: process.pid, startedAt: '2026-01-01T00:00:00.000Z' };
  await writeFile(path.join(siteDir, 'ops/assistant-daemon.json'), JSON.stringify(record));
  assert.equal(await retireStatus(t, { siteDir }), 409);
  // The same record pointing at a dead process is stale and no longer protects the site.
  await writeFile(path.join(siteDir, 'ops/assistant-daemon.json'), JSON.stringify({ ...record, pid: await deadPid() }));
  assert.equal(await retireStatus(t, { siteDir }), 204);
});

test('default probe: a live delegated daemon protects the site; a gone one (ESRCH) falls through to the registry', async t => {
  t.after(() => resetAssistantDaemonConnectionForTests());
  const siteDir = await siteDirFixture(t);
  setAssistantDaemonConnection({ connection: { url: 'http://127.0.0.1:4513', pid: process.pid, token: 'tok-a' } });
  assert.equal(await retireStatus(t, { siteDir }), 409);
  setAssistantDaemonConnection({ connection: { url: 'http://127.0.0.1:4513', pid: await deadPid(), token: 'tok-a' } });
  assert.equal(await retireStatus(t, { siteDir }), 204);
});

test('default probe: a delegated pid that cannot be signalled for another reason (EPERM) is treated as busy', async t => {
  t.after(() => resetAssistantDaemonConnectionForTests());
  setAssistantDaemonConnection({ connection: { url: 'http://127.0.0.1:4513', pid: 4242, token: 'tok-a' } });
  const signals: Array<[number, unknown]> = [];
  t.mock.method(process, 'kill', (pid: number, signal: unknown) => {
    signals.push([pid, signal]);
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  });
  assert.equal(await retireStatus(t, { siteDir: await siteDirFixture(t) }), 409);
  assert.deepEqual(signals, [[4242, 0]]);
});

test('default probe: a ready supervised assistant daemon protects the site', async t => {
  resetAssistantDaemonConnectionForTests();
  t.after(() => resetAssistantDaemonSingletonForTests());
  const child = Object.assign(new EventEmitter(), { pid: 375, kill: () => true });
  startAssistantDaemon({ workspaceId: 'warm-site', siteDir: '/unused' }, {
    parentIpc: false, registerProcessSignalHandlers: false,
    beforeStart: async () => {}, refreshPort: async () => {},
    readDiscovery: async () => ({ pid: 375, url: 'http://127.0.0.1:4513' }),
    spawnDaemonProcess: () => child,
  });
  await ensureAssistantDaemonReady({}, {});
  assert.equal(isAssistantDaemonReady(), true);
  assert.equal(await retireStatus(t, { siteDir: await siteDirFixture(t) }), 409);
  child.emit('exit', 88, null);
});

test('retirement is inert without both the token and the warm-sites flag', async t => {
  for (const env of [{ TOVU_DEV_WARM_SITES: '1' }, { TOVU_DEV_RETIRE_TOKEN: 'retire-tok', TOVU_DEV_WARM_SITES: '0' }]) {
    const app = express();
    registerWarmSiteRetirement({ app, siteDir: '/unused' }, { env, hasWork: async () => false });
    app.use((_req, res) => { res.status(200).send('site'); });
    const base = await serve(t, app);
    const response = await fetch(`${base}/internal/dev-site-retire`, { method: 'POST', headers: { 'x-tovu-retire': 'retire-tok' } });
    assert.equal(response.status, 200, JSON.stringify(env));
    assert.equal(await response.text(), 'site');
  }
});

test('the retire route hides itself from wrong tokens and other methods, DELETE cancels, and a fenced site answers 503 to everything else', async t => {
  const app = express();
  registerWarmSiteRetirement({ app, siteDir: '/unused' }, { env: RETIRE_ENV, hasWork: async () => false });
  app.use((_req, res) => { res.status(200).send('site'); });
  const base = await serve(t, app);
  const retire = (method: string, token = 'retire-tok') => fetch(`${base}/internal/dev-site-retire`, { method, headers: { 'x-tovu-retire': token } });
  assert.equal((await retire('POST', 'wrong-tok')).status, 404);
  assert.equal((await retire('GET')).status, 404);
  assert.equal((await fetch(`${base}/page`)).status, 200, 'still accepting before retirement');
  assert.equal((await retire('POST')).status, 204);
  const fenced = await fetch(`${base}/page`);
  assert.equal(fenced.status, 503);
  assert.deepEqual(await fenced.json(), { error: 'This idle site is stopping. Try again in a moment.' });
  assert.equal((await retire('DELETE')).status, 204);
  assert.equal((await fetch(`${base}/page`)).status, 200, 'DELETE restores intake');
});

test('a mutating request whose client disconnects before the response finishes keeps the site protected', async t => {
  const app = express();
  registerWarmSiteRetirement({ app, siteDir: '/unused' }, { env: RETIRE_ENV, hasWork: async () => false });
  const reached = new Promise<void>(resolve => { app.post('/slow', () => { resolve(); }); });
  const base = await serve(t, app);
  const controller = new AbortController();
  const dropped = fetch(`${base}/slow`, { method: 'POST', signal: controller.signal }).catch(() => 'aborted');
  await reached;
  controller.abort();
  assert.equal(await dropped, 'aborted');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await fetch(`${base}/internal/dev-site-retire`, { method: 'POST', headers: { 'x-tovu-retire': 'retire-tok' } })).status, 409);
});
