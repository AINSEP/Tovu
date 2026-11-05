/** Shared packaged/source journey: real sites and daemon, scripted CLI, no model service. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, type ElectronApplication } from '@playwright/test';
import { collectProcessTreePids, listProcessSnapshots, waitForProcessExit } from '@jini-ai/platform';
import { closeDesktop, launchDesktop, makeSite, openSiteTab, removeScratchTree, scratchDir, siteContentDb, startSite,
  type DesktopLaunch } from './_fixtures.js';
import { fiveSitesExecuting } from './_shared-daemon-evidence.js';

// Structural, not import('electron'): the root install (published-typecheck CI) has no electron package.
type GuestSession = { fetch(input: string, init?: RequestInit): Promise<Response> };
type GuestContents = { getType(): string; getURL(): string; session: GuestSession };
type SiteContext = { origin: string; session: GuestSession; runId?: string };
type ExecutionState = typeof globalThis & { __assistantGateSites?: SiteContext[] };
type Evidence = { childPid?: number; sessionId?: string; reason?: string; errorFrame?: unknown };
const NO_KEY_REASON = 'Release gate: no model key was provided. Supply a model key to generate a reply.';

/** One bounded, read-only query per fixture, at most two small rows; never changes the default ID. */
function assertDefaultWorkspace({ dir }: { dir: string }, _optional = {}): void {
  const db = new Database(siteContentDb(dir), { readonly: true });
  try { expect(db.prepare('SELECT id FROM workspaces LIMIT 2').all()).toEqual([{ id: 'workspace-local' }]); }
  finally { db.close(); }
}

/** Install one tiny executable in scratch HOME/PATH; the shipping runtime resolves it normally. */
function fakeCliEnvironment({ root }: { root: string }, _optional = {}): Record<string, string> {
  const home = path.join(root, 'home');
  const bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(home, 'Documents'));
  const script = fs.readFileSync(new URL('./fixtures/no-key-claude.cjs', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}\n${script}`, { mode: 0o755 });
  return { HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
}

/** Retain each authenticated guest network context before the one-view cap evicts it.
 * Reused from shared-agent-daemon.desktop.ts; no server port is fixed by the journey.
 */
async function openSites({ launch, names }: { launch: DesktopLaunch; names: readonly string[] }, _optional = {}): Promise<void> {
  for (const name of names) {
    await startSite(launch.win, name);
    await openSiteTab(launch.app, launch.win, name);
    const source = await launch.win.locator('webview').getAttribute('src');
    expect(source).toBeTruthy();
    const origin = new URL(source!).origin;
    await expect.poll(() => launch.app.evaluate(({ webContents }, expected) =>
      webContents.getAllWebContents().some((contents: GuestContents) => contents.getType() === 'webview' && contents.getURL().startsWith(`${expected}/`)), origin)).toBe(true);
    await launch.app.evaluate(({ webContents }, expected) => {
      const guest = webContents.getAllWebContents().find((contents: GuestContents) => contents.getType() === 'webview' && contents.getURL().startsWith(`${expected}/`));
      if (!guest) throw new Error('The selected site has no authenticated guest. Inspect the desktop trace.');
      const state = globalThis as ExecutionState;
      state.__assistantGateSites ??= [];
      state.__assistantGateSites.push({ origin: new URL(guest.getURL()).origin, session: guest.session });
    }, origin);
    await launch.win.getByRole('tablist', { name: 'Open websites' }).getByRole('tab', { name: 'All', exact: true }).click();
  }
}

/** Exactly one authenticated activation and run POST per site; each response has a 90s deadline. */
async function acceptRuns({ app, count }: { app: ElectronApplication; count: number }, _optional = {}) {
  const accepted = await app.evaluate(async () => Promise.all(((globalThis as ExecutionState).__assistantGateSites ?? []).map(async site => {
    const activation = await site.session.fetch(`${site.origin}/api/frontend-sessions/activate`, {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(90_000) });
    const ready = activation.status;
    await activation.body?.cancel();
    const response = await site.session.fetch(`${site.origin}/api/runs`, { method: 'POST', credentials: 'include',
      signal: AbortSignal.timeout(90_000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'claude', contextRef: JSON.stringify({ prompt: 'Release scope check.' }) }) });
    const body = await response.json() as { run?: { id: string } };
    site.runId = body.run?.id;
    return { origin: site.origin, ready, status: response.status, runId: site.runId };
  })));
  expect(accepted).toHaveLength(count);
  expect(new Set(accepted.map(row => row.origin)).size).toBe(count);
  for (const row of accepted) {
    expect(row.ready, JSON.stringify(row)).toBeGreaterThanOrEqual(200);
    expect(row.ready, JSON.stringify(row)).toBeLessThan(300);
    expect(row.status, JSON.stringify(row)).toBe(201);
    expect(row.runId).toBeTruthy();
  }
  return accepted;
}

/** Read one SSE subscription per run (90s / 256 KiB cap). Parsing stays in the packaged main
 * process: it cannot dynamic-import the checkout's harness helpers. No run/history polling.
 */
export async function executionEvidence({ app }: { app: ElectronApplication }, _optional = {}): Promise<Evidence[]> {
  return app.evaluate(async () => {
    type Frame = { kind?: string; payload?: { type?: string; childPid?: number; sessionId?: string; message?: string; error?: { code?: string } } };
    // These small helpers must travel inside evaluate: the packaged main process has no harness imports.
    function parseFrame(frame: string): Frame | undefined {
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      return data ? JSON.parse(data) as Frame : undefined;
    }
    function recordStatus(payload: NonNullable<Frame['payload']>, evidence: Evidence): void {
      if (payload.type !== 'status') return;
      if (typeof payload.childPid !== 'number') return;
      evidence.childPid = payload.childPid;
      if (payload.sessionId) evidence.sessionId = payload.sessionId;
    }
    function consumeFrame(frame: string, evidence: Evidence): void {
      const event = parseFrame(frame);
      if (!event?.payload) return;
      recordStatus(event.payload, evidence);
      // Preserve the daemon's actual failure without treating it as successful CLI evidence.
      if (event.kind === 'error') evidence.errorFrame = event;
      if (event.kind === 'error' && event.payload.error?.code === 'RELEASE_GATE_NO_MODEL_KEY') evidence.reason = event.payload.message;
      if (event.kind === 'end') throw new Error(`Run ended before CLI scope evidence: ${JSON.stringify(evidence)}`);
    }
    function complete(evidence: Evidence): boolean {
      return Boolean(evidence.childPid && evidence.sessionId && evidence.reason);
    }
    async function readSite(site: SiteContext): Promise<Evidence> {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 90_000);
      const evidence: Evidence = {};
      let pending = '';
      let bytes = 0;
      try {
        const response = await site.session.fetch(`${site.origin}/api/runs/${encodeURIComponent(site.runId!)}/events`, { signal: abort.signal, credentials: 'include' });
        if (!response.ok || !response.body) throw new Error(`Run events returned HTTP ${response.status}. Inspect the desktop trace.`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) throw new Error(`Run ended before CLI scope evidence: ${JSON.stringify(evidence)}`);
          bytes += value.byteLength;
          if (bytes > 262_144) throw new Error('Run evidence exceeded 256 KiB. Inspect the desktop trace.');
          pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const frames = pending.split('\n\n');
          pending = frames.pop()!;
          for (const frame of frames) {
            consumeFrame(frame, evidence);
            if (complete(evidence)) return evidence;
          }
        }
      } finally { clearTimeout(timer); abort.abort(); }
    }
    return Promise.all(((globalThis as ExecutionState).__assistantGateSites ?? []).map(readSite));
  });
}

/** One OS process-table read proves the children belong to the desktop's sole daemon. */
async function assertProcessOwnership({ launch, childPids }: { launch: DesktopLaunch; childPids: readonly number[] }, _optional = {}) {
  const mainPid = launch.app.process().pid;
  const snapshots = await listProcessSnapshots();
  const owned = collectProcessTreePids(snapshots, [mainPid]);
  const daemons = snapshots.filter(row => owned.includes(row.pid) && /agent-daemon-server\.[jt]s/.test(row.command));
  expect(daemons, 'all sites must share one desktop-owned daemon').toHaveLength(1);
  expect(daemons[0]!.ppid).toBe(mainPid);
  const daemonChildren = new Set(collectProcessTreePids(snapshots, [daemons[0]!.pid]));
  expect(childPids.every(pid => daemonChildren.has(pid)), 'every CLI must belong to the shared daemon').toBe(true);
  return { owned, snapshots };
}

/** Exercise real default-ID sites, their bound scopes, and a CLI refusal unrelated to scope.
 * Construction/activation are bounded by the journey timeout; all resources belong to scratch.
 */
export async function checkAssistantSites({ names }: { names: readonly string[] }, _optional = {}): Promise<void> {
  const root = scratchDir('assistant-release-gate');
  const sites: string[] = [];
  for (const name of names) {
    const dir = await makeSite(root, name);
    assertDefaultWorkspace({ dir });
    sites.push(dir);
  }
  const launch = await launchDesktop({ trackedSites: sites, env: fakeCliEnvironment({ root }) });
  let owned: number[] = [];
  try {
    await openSites({ launch, names });
    const accepted = await acceptRuns({ app: launch.app, count: names.length });
    const evidence = await executionEvidence({ app: launch.app });
    expect(evidence).toHaveLength(names.length);
    for (const [index, row] of evidence.entries()) {
      expect(row.childPid).toBeGreaterThan(0);
      expect(row.sessionId, 'each accepted run must bind the correct site directory').toBe(`gate:${names[index]}:${row.childPid}`);
      expect(row.reason, 'scope errors or acceptance alone cannot satisfy the gate').toBe(NO_KEY_REASON);
    }
    const childPids = evidence.map(row => row.childPid!);
    expect(new Set(childPids).size).toBe(names.length);
    const processEvidence = await assertProcessOwnership({ launch, childPids });
    owned = processEvidence.owned;
    if (names.length === 5) {
      // One status read per site, after CLI evidence; acceptance's synthetic running state is insufficient.
      const states = await launch.app.evaluate(async () => Promise.all(((globalThis as ExecutionState).__assistantGateSites ?? []).map(async site => {
        const response = await site.session.fetch(`${site.origin}/api/runs/${encodeURIComponent(site.runId!)}`, { credentials: 'include', signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Run status returned HTTP ${response.status}. Inspect the desktop trace.`);
        return (await response.json() as { run: { state: string } }).run.state;
      })));
      expect(fiveSitesExecuting({ samples: accepted.map((row, index) => ({ origin: row.origin, runId: row.runId!, childPid: childPids[index]!, state: states[index]! })),
        processes: processEvidence.snapshots }, {})).toBe(true);
    }
  } finally {
    await launch.app.evaluate(() => { delete (globalThis as ExecutionState).__assistantGateSites; }).catch(() => {});
    if (!owned.length) owned = collectProcessTreePids(await listProcessSnapshots(), [launch.app.process().pid]);
    await closeDesktop(launch);
    const exited = await Promise.all(owned.map(pid => waitForProcessExit(pid, 30_000)));
    expect(exited.every(Boolean), 'all owned processes must exit before fixture deletion').toBe(true);
    removeScratchTree({ root }, {});
  }
}
