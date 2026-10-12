/** Native worker integration plus injected worker faults; no module mocks or real network mounts. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { discoverDesktopSites } from './site-discovery.ts';
import type { DesktopDiscoveryInput } from './site-discovery.ts';
import { createSitesWorkspace } from './shared-sites.ts';

const input: DesktopDiscoveryInput = { statePath: '/unused', workspaceOptions: { env: {} } };
class FakeWorker extends EventEmitter {
  terminated = 0;
  unref() {}
  terminate() { this.terminated++; return Promise.resolve(0); }
}
function workerOptions(worker: FakeWorker) {
  type Factory = NonNullable<NonNullable<Parameters<typeof discoverDesktopSites>[1]>['createWorker']>;
  return { createWorker: (() => worker) as unknown as Factory };
}

test('a silent worker leaves the event loop responsive and is terminated at the deadline', async () => {
  const worker = new FakeWorker(); let responsive = false;
  const pending = discoverDesktopSites(input, { ...workerOptions(worker), timeoutMs: 100 });
  setImmediate(() => { responsive = true; });
  await assert.rejects(pending, { message: 'Sites discovery timed out. Disconnect unavailable volumes or choose smaller sites folders and try again.' });
  assert.equal(responsive, true); assert.equal(worker.terminated, 1); assert.equal(worker.eventNames().length, 0);
});

test('cancellation terminates a scan and an already-cancelled request never starts a worker', async () => {
  const controller = new AbortController(), worker = new FakeWorker();
  const pending = discoverDesktopSites(input, { ...workerOptions(worker), signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { message: 'Sites discovery was cancelled.' });
  assert.equal(worker.terminated, 1);
  await assert.rejects(discoverDesktopSites(input, { signal: controller.signal,
    createWorker: () => assert.fail('cancelled scan must not start'),
  }), { message: 'Sites discovery was cancelled.' });
});

test('worker result, explicit failure, crash and premature exit all settle and clean up', async () => {
  for (const event of ['message', 'error', 'exit'] as const) {
    const worker = new FakeWorker();
    const pending = discoverDesktopSites(input, workerOptions(worker));
    if (event === 'message') {
      worker.emit(event, { found: ['/sites/alpha'] });
      assert.deepEqual(await pending, ['/sites/alpha']);
    } else {
      worker.emit(event, new Error('worker crashed'));
      await assert.rejects(pending, { message: event === 'error' ? 'worker crashed' : 'Sites discovery worker exited before returning websites.' });
    }
    assert.equal(worker.terminated, 1); assert.equal(worker.eventNames().length, 0);
  }
  const worker = new FakeWorker(), pending = discoverDesktopSites(input, workerOptions(worker));
  worker.emit('message', { error: 'Sites folder is too broad: /. Choose a specific folder containing your Tovu websites.' });
  await assert.rejects(pending, { message: 'Sites folder is too broad: /. Choose a specific folder containing your Tovu websites.' });
  assert.equal(worker.terminated, 1);
});

test('the real worker reads shared extra roots and the legacy MRU fresh without writing them', async (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-discovery-worker-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, 'groups', 'extra'); fs.mkdirSync(root, { recursive: true });
  const site = (name: string, parent: string) => {
    const dir = path.join(parent, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ name }));
    fs.writeFileSync(path.join(dir, '.site-meta.json'), JSON.stringify({ siteId: name })); return dir;
  };
  const alpha = site('alpha', root), outside = site('outside', home);
  const statePath = path.join(home, 'desktop-state.json');
  fs.writeFileSync(statePath, JSON.stringify({ recentSiteDirs: [outside] }));
  const workspaceOptions = { homeDir: home, env: {}, cwd: home, sourceRoots: [], platform: 'linux' as const };
  const workspace = createSitesWorkspace({}, workspaceOptions); workspace.updateRoots({ add: [root] });
  const configPath = workspace.config({}).configPath;
  const before = fs.readFileSync(configPath, 'utf8'), stateBefore = fs.readFileSync(statePath, 'utf8');
  assert.deepEqual(await discoverDesktopSites({ statePath, workspaceOptions }), [alpha, outside].sort());
  const beta = site('beta', root);
  assert.deepEqual(await discoverDesktopSites({ statePath, workspaceOptions }), [alpha, beta, outside].sort());
  assert.equal(fs.readFileSync(configPath, 'utf8'), before); assert.equal(fs.readFileSync(statePath, 'utf8'), stateBefore);
});


test("the real worker discovers both default levels with its own injected policy home", async (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitesnest2-worker-")));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const workspaceOptions = { homeDir: home, env: {}, cwd: home, sourceRoots: [], platform: "linux" as const };
  const workspace = createSitesWorkspace({}, workspaceOptions), old = path.join(home, "Documents", "Tovu");
  const alpha = path.join(old, "alpha"), beta = path.join(workspace.home({}), "beta");
  for (const dir of [alpha, beta, path.join(home, "Tovu", "stay-local")]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: path.basename(dir) }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: path.basename(dir) }));
  }
  assert.deepEqual(await discoverDesktopSites({ statePath: path.join(home, "absent-state.json"), workspaceOptions }), [alpha, beta]);
  await assert.rejects(discoverDesktopSites({ statePath: path.join(home, "absent-state.json"), workspaceOptions,
    scanRoots: [path.join(home, "Tovu")],
  }), /too broad/);
});
