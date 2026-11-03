// @unrun: cloud execution requires Claude Code and a dedicated TOVU_E2E_ANTHROPIC_API_KEY.
import { expect, test } from "@playwright/test";
import { collectProcessTreePids, listProcessSnapshots, waitForProcessExit } from "@jini-ai/platform";
import { closeDesktop, launchDesktop, makeSite, openSiteTab, removeScratchTree, scratchDir, startSite } from "./_fixtures.js";
import { fiveSitesExecuting } from './_shared-daemon-evidence.js';

type SiteContext = { origin: string; session: import('electron').Session; runId?: string; childPid?: number };
type ExecutionState = typeof globalThis & { __sharedDaemonSites?: SiteContext[] };

test("five chatting sites use one daemon", { tag: ["@unrun"] }, async () => {
  test.setTimeout(900_000);
  const apiKey = process.env.TOVU_E2E_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Provide TOVU_E2E_ANTHROPIC_API_KEY for this live CLI journey');
  const root = scratchDir("shared-agent-daemon");
  const names = Array.from({ length: 5 }, (_, index) => `shared-daemon-site-${index}`);
  const sites: string[] = [];
  for (const name of names) sites.push(await makeSite(root, name));
  const launch = await launchDesktop({ trackedSites: sites, env: { ANTHROPIC_API_KEY: apiKey } });
  let owned: number[] = [];
  try {
    for (const name of names) {
      await startSite(launch.win, name);
      await openSiteTab(launch.app, launch.win, name);
      const source = await launch.win.locator('webview').getAttribute('src');
      expect(source).toBeTruthy();
      const origin = new URL(source!).origin;
      await expect.poll(() => launch.app.evaluate(({ webContents }, expectedOrigin) =>
        webContents.getAllWebContents().some(contents => contents.getType() === 'webview' && contents.getURL().startsWith(`${expectedOrigin}/`)), origin)).toBe(true);
      // Retain each authenticated network context before the default one-view cap evicts it.
      await launch.app.evaluate(({ webContents }, expectedOrigin) => {
        const guest = webContents.getAllWebContents().find(contents => contents.getType() === 'webview' && contents.getURL().startsWith(`${expectedOrigin}/`));
        if (!guest) throw new Error('the selected site has no authenticated guest');
        const state = globalThis as ExecutionState;
        state.__sharedDaemonSites ??= [];
        state.__sharedDaemonSites.push({ origin: new URL(guest.getURL()).origin, session: guest.session });
      }, origin);
      await launch.win.getByRole('tablist', { name: 'Open websites' }).getByRole('tab', { name: 'All', exact: true }).click();
    }
    const results = await launch.app.evaluate(async () => {
      const sites = (globalThis as ExecutionState).__sharedDaemonSites ?? [];
      return Promise.all(sites.map(async site => {
        const response = await site.session.fetch(`${site.origin}/api/runs`, { method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: 'claude', contextRef: JSON.stringify({ prompt: 'Run a command that waits 120 seconds (use Node setTimeout so it works on Windows), then reply with one short greeting. Wait for the command to finish.' }) }),
        });
        const body = await response.json() as { run?: { id: string } };
        site.runId = body.run?.id;
        return { status: response.status, runId: site.runId };
      }));
    });
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.status).toBe(201);
      expect(result.runId).toBeTruthy();
    }
    // A running status is assigned at acceptance too. Require each CLI's own init/status
    // event with its child PID, then prove those five children are alive at the same time.
    await launch.app.evaluate(async () => {
      const { readSseFrames } = await import('@jini-ai/chat/core/run-events');
      await Promise.all(((globalThis as ExecutionState).__sharedDaemonSites ?? []).map(async site => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 90_000);
        try {
          const response = await site.session.fetch(`${site.origin}/api/runs/${encodeURIComponent(site.runId!)}/events`, { signal: abort.signal, credentials: 'include' });
          if (!response.ok || !response.body) throw new Error(`run events refused (${response.status})`);
          for await (const frame of readSseFrames({ body: response.body }, {})) {
            const event = JSON.parse(frame.data) as { kind?: string; payload?: { type?: string; childPid?: number } };
            if (event.kind === 'end' || frame.event === 'end') throw new Error('a reply ended before proving CLI execution');
            if (event.payload?.type === 'status' && typeof event.payload.childPid === 'number') { site.childPid = event.payload.childPid; return; }
          }
          throw new Error('run stream ended without a live CLI identity');
        } finally { clearTimeout(timer); abort.abort(); }
      }));
    });
    const mainPid = launch.app.process().pid;
    expect(mainPid).toBeDefined();
    let snapshots: Awaited<ReturnType<typeof listProcessSnapshots>> = [];
    let samples: Parameters<typeof fiveSitesExecuting>[0]['samples'] = [];
    await expect.poll(async () => {
      samples = await launch.app.evaluate(async () => Promise.all(((globalThis as ExecutionState).__sharedDaemonSites ?? []).map(async site => {
        const response = await site.session.fetch(`${site.origin}/api/runs/${encodeURIComponent(site.runId!)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(`run status refused (${response.status})`);
        const body = await response.json() as { run: { state: string } };
        return { origin: site.origin, runId: site.runId!, childPid: site.childPid!, state: body.run.state };
      })));
      snapshots = await listProcessSnapshots();
      owned = collectProcessTreePids(snapshots, [mainPid]);
      return fiveSitesExecuting({ samples, processes: snapshots.filter(row => owned.includes(row.pid)) });
    }, { timeout: 10_000, message: 'five different sites must have five concurrently executing CLI children' }).toBe(true);
    const daemons = snapshots.filter(row => owned.includes(row.pid) && /agent-daemon-server\.[jt]s/.test(row.command));
    expect(daemons, "five real site run starts must share one slim process").toHaveLength(1);
    expect(daemons[0]!.ppid, "the desktop, rather than any site server, owns the sole daemon").toBe(mainPid);
    const daemonChildren = new Set(collectProcessTreePids(snapshots, [daemons[0]!.pid]));
    expect(samples.every(run => daemonChildren.has(run.childPid)), 'every executing CLI must belong to the shared daemon').toBe(true);
  } finally {
    await launch.app.evaluate(() => { delete (globalThis as ExecutionState).__sharedDaemonSites; }).catch(() => {});
    if (owned.length === 0) owned = collectProcessTreePids(await listProcessSnapshots(), [launch.app.process().pid]);
    await closeDesktop(launch);
    const exited = await Promise.all(owned.map(pid => waitForProcessExit(pid, 30_000)));
    expect(exited.every(Boolean), "all owned processes must exit before fixture deletion").toBe(true);
    removeScratchTree({ root }, {});
  }
});
