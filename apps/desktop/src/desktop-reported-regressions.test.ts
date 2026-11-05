/** Recheck the reported stale-card/owner-entry bugs at the current desktop boundaries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Test the changed Jini source without a build or a change to the published package map.
import { handleList, handleStart } from './project-ipc.ts';
import { writeTrackedSites } from './tracked-sites.ts';
import { createSitesWorkspace } from './shared-sites.ts';
import { createKeyedSerializer } from './keyed-serializer.ts';
import { buildServeEnv } from './tovu-server.ts';
import { armDesktopOwnerSignIn } from './desktop-auth.ts';
import { resolveLocalOwnerSignIn } from '../../website/src/server/runtime/boot/local-owner-signin.ts';
import { createDesktopResources } from './desktop-resources.ts';

test('Websites grid merges a themes-only stale tovu-dev card with its valid tracked identity', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-stale-repro-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stale = path.join(root, 'repo', 'sites', 'tovu-dev'), moved = path.join(root, 'Documents', 'Tovu', 'tovu-dev');
  fs.mkdirSync(path.join(stale, 'themes'), { recursive: true });
  fs.mkdirSync(moved, { recursive: true });
  fs.writeFileSync(path.join(moved, 'config.json'), JSON.stringify({ name: 'tovu-dev' }));
  fs.writeFileSync(path.join(moved, '.site-meta.json'), JSON.stringify({ siteId: 'moved-site', schemaVersion: 58 }));
  const projectsPath = path.join(root, 'projects.json');
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, appDataDir: path.join(root, 'profile') });
  writeTrackedSites(projectsPath, [{ siteDir: stale, relocationId: 'moved-site', displayName: 'tovu-dev', createdAt: '2026-10-09' },
    { siteDir: moved, createdAt: '2026-10-09' }]);
  const cards = handleList({ projectsPath, sharedSites: workspace, openSites: new Map(), repoRoot: root,
    readSiteName: () => 'tovu-dev', readPreviewVersion: () => null });
  assert.deepEqual(cards.map(card => [card.id, card.folderMissing]), [[moved, false]]);
  assert.deepEqual(fs.readdirSync(stale), ['themes']);
});

test('a themes-only stale card without relocation proof cannot Start', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-stale-start-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stale = path.join(root, 'tovu-dev'), projectsPath = path.join(root, 'projects.json');
  fs.mkdirSync(path.join(stale, 'themes'), { recursive: true });
  writeTrackedSites(projectsPath, [{ siteDir: stale, createdAt: '2026-10-09' }]);
  const deps = { projectsPath, repoRoot: root, openSites: new Map(), readSiteName: () => 'tovu-dev',
    readPreviewVersion: () => null, serializer: createKeyedSerializer(), ctx: {},
    openSiteServer: async () => assert.fail('an invalid folder must never spawn a site') };
  assert.equal(handleList(deps)[0]!.folderMissing, true);
  await assert.rejects(handleStart(stale, deps), /Folder moved or not a site/);
});

test('desktop launch without NODE_ENV retains owner re-entry capability after logout', () => {
  for (const baseEnv of [{}, { NODE_ENV: 'production' }]) {
    const env = buildServeEnv({ repoRoot: '/repo', siteDir: '/site', baseEnv });
    const policy = resolveLocalOwnerSignIn({ env }, { parentPid: process.pid, pathExists: () => false });
    assert.equal(policy.enabled, true);
    let intercept!: (details: { url: string; requestHeaders: Record<string, string> }, callback: (result: { requestHeaders: Record<string, string> }) => void) => void;
    armDesktopOwnerSignIn({ session: { webRequest: { onBeforeSendHeaders: (_filter, listener) => { intercept = listener; } } },
      adminUrl: 'http://127.0.0.1:3456/admin/', capability: env.TOVU_DESKTOP_OWNER_SIGNIN! });
    // The second bootstrap has no session cookie, exactly as after logging out.
    const bootstrapHeaders: Record<string, string>[] = [{ Cookie: 'old-session' }, {}];
    for (const requestHeaders of bootstrapHeaders) {
      intercept({ url: 'http://127.0.0.1:3456/api/admin/v1/auth/local-boot-session', requestHeaders }, result => {
        assert.equal(policy.acceptsCapability!({ capability: result.requestHeaders['X-Tovu-Desktop-Owner-SignIn'] }), true);
      });
    }
    assert.equal(policy.acceptsCapability!({ capability: undefined }), false);
  }
});

test('memory sums each owned PID once, excludes the Windows sampler, and labels Electron private bytes as committed', async () => {
  const monitor = createDesktopResources({ desktopPid: 1, platform: 'win32', now: () => 0,
    totalMem: () => 8_000_000_000, openSites: () => [{ id: 'one', pid: 3 }, { id: 'same-process', pid: 3 }],
    listUsage: async () => [
      { pid: 1, ppid: 0, name: 'Tovu', rssBytes: 200_000_000, cpuSeconds: 0 },
      { pid: 2, ppid: 1, name: 'Tovu Helper', rssBytes: 300_000_000, cpuSeconds: 0 },
      { pid: 3, ppid: 1, name: 'node', rssBytes: 400_000_000, cpuSeconds: 0 },
      { pid: 4, ppid: 1, name: 'powershell.exe', rssBytes: 900_000_000, cpuSeconds: 0 },
      { pid: 5, ppid: 0, name: 'other desktop', rssBytes: 900_000_000, cpuSeconds: 0 },
    ], listElectronMetrics: () => [{ pid: 1, memory: { privateBytes: 100_000, workingSetSize: 200_000 } }],
  });
  const result = await monitor.get({ panelOpen: false });
  assert.equal(result.total.rssBytes, 102_400_000 + 300_000_000 + 400_000_000);
  assert.equal(result.app.processes.find(row => row.pid === 1)?.memoryMetric, 'committed');
  assert.deepEqual([...result.app.processes, ...result.sites.flatMap(site => site.processes)].map(row => row.pid), [1, 2, 3]);
  assert.equal(result.approximate, true);
});
