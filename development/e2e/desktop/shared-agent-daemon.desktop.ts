// @unrun: lane a; authored for cloud execution. Main wiring patch and matching Jini release required.
import { expect, test } from "@playwright/test";
import { collectProcessTreePids, listProcessSnapshots, waitForProcessExit } from "@jini-ai/platform";
import { closeDesktop, launchDesktop, makeSite, openSiteTab, removeScratchTree, scratchDir, startSite } from "./_fixtures.js";

test("five chatting sites use one daemon", { tag: ["@unrun"] }, async () => {
  test.setTimeout(360_000);
  const root = scratchDir("shared-agent-daemon");
  const names = Array.from({ length: 5 }, (_, index) => `shared-daemon-site-${index}`);
  const sites: string[] = [];
  for (const name of names) sites.push(await makeSite(root, name));
  const launch = await launchDesktop({ trackedSites: sites });
  let owned: number[] = [];
  try {
    for (const name of names) {
      await startSite(launch.win, name);
      await openSiteTab(launch.app, launch.win, name);
    }
    const results = await launch.app.evaluate(async ({ webContents }) => {
      const guests = webContents.getAllWebContents().filter(contents => contents.getType() === "webview");
      return Promise.all(guests.map(contents => contents.executeJavaScript(`(async () => {
        const response = await fetch('/api/runs', { method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contextRef: JSON.stringify({ prompt: 'Reply with one short greeting.' }) }) });
        const body = await response.json();
        return { status: response.status, runId: body.run?.id };
      })()`))) as Promise<Array<{ status: number; runId: string }>>;
    });
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.status).toBe(201);
      expect(result.runId).toBeTruthy();
    }
    const mainPid = launch.app.process().pid;
    expect(mainPid).toBeDefined();
    const snapshots = await listProcessSnapshots();
    owned = collectProcessTreePids(snapshots, [mainPid]);
    const daemons = snapshots.filter(row => owned.includes(row.pid) && /agent-daemon-server\.[jt]s/.test(row.command));
    expect(daemons, "five real site run starts must share one slim process").toHaveLength(1);
    expect(daemons[0]!.ppid, "the desktop, rather than any site server, owns the sole daemon").toBe(mainPid);
  } finally {
    if (owned.length === 0) owned = collectProcessTreePids(await listProcessSnapshots(), [launch.app.process().pid]);
    await closeDesktop(launch);
    const exited = await Promise.all(owned.map(pid => waitForProcessExit(pid, 30_000)));
    expect(exited.every(Boolean), "all owned processes must exit before fixture deletion").toBe(true);
    removeScratchTree({ root }, {});
  }
});
