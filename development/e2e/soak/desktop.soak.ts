/** Real hidden-window capture path; only main + Network Service raw RSS supplies the verdict. */
import { test, expect, type ElectronApplication } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { listProcessUsage } from "@jini-ai/platform/process";
import { renderBridgeFromEnv } from "@jini-ai/desktop-host/render-bridge";
import { launchDesktop, closeDesktop, REPO_ROOT } from "../desktop/_fixtures.js";
import desktopGlobalSetup from "../desktop/desktop.globalSetup.js";
import type { IsolatedJourneySite } from "../support/isolated-journey-site.js";
import { createMemoryEvidence } from "./_evidence.js";

type MainState = typeof globalThis & { __memorySoak: { close(): void; created: number; loaded: number; destroyed: number } };

/** Force main GC, yield, GC again, then join Electron's Network Service IDs to raw OS RSS.
 * Missing/restarted processes invalidate the run. O(host processes) sampling, bounded by platform port.
 */
async function readDesktopMemory({ app, networkPids }: { app: ElectronApplication; networkPids?: number[] }, _options = {}) {
  const metrics = await app.evaluate(async ({ app }) => {
    if (typeof globalThis.gc !== "function") throw new Error("Main GC unavailable");
    globalThis.gc(); await new Promise<void>(resolve => setImmediate(resolve)); globalThis.gc();
    return app.getAppMetrics().filter(metric => metric.type === "Utility").map(metric => ({ pid: metric.pid, name: metric.name, serviceName: metric.serviceName }));
  });
  const network = metrics.filter(metric => /network[ ._-]?service|network\.mojom/i.test(`${metric.name} ${metric.serviceName}`));
  expect(network.length, "Network Service metadata missing").toBeGreaterThan(0);
  const pids = network.map(metric => metric.pid).sort((a, b) => a - b);
  if (networkPids) expect(pids, "Network Service restarted").toEqual(networkPids);
  const usage = await listProcessUsage({}, {});
  const roles = [{ pid: app.process().pid!, role: "main" }, ...network.map(metric => ({ ...metric, role: "network-service" }))];
  const processes = roles.map(role => {
    const processUsage = usage.find(row => row.pid === role.pid);
    expect(processUsage, "Required process missing from RSS sampler").toBeDefined();
    expect(processUsage!.rssBytes).toBeGreaterThan(0);
    return { ...role, rssBytes: processUsage!.rssBytes };
  });
  return { networkPids: pids, utilities: metrics, processes, totalRssBytes: processes.reduce((total, row) => total + row.rssBytes, 0) };
}

test("native capture memory floors after 50 captures", async ({}, info) => {
  const site = info.config.metadata.isolatedJourneySite as IsolatedJourneySite;
  const evidence = createMemoryEvidence({ suite: "desktop", warmup: 10, workload: 50 });
  let launch: Awaited<ReturnType<typeof launchDesktop>> | undefined;
  let networkPids: number[] | undefined;
  let phase = "desktop build freshness and isolated launch";
  try {
    await desktopGlobalSetup(); // Selected only by the desktop project.
    // Untracked: capture targets the soak launcher's site directly; the desktop never manages it.
    launch = await launchDesktop({}, { electronArgs: ["--js-flags=--expose-gc"] });
    phase = "native capture bridge setup";
    const { env, versions } = await launch.app.evaluate(async ({ BrowserWindow }, { adapterURL, siteURL }) => {
      const { startDesktopCaptureBridge } = await import(adapterURL);
      const state = (globalThis as MainState).__memorySoak = { close(_required = {}, _options = {}) {}, created: 0, loaded: 0, destroyed: 0 };
      const bridge = await startDesktopCaptureBridge({ createWindow: (options: ConstructorParameters<typeof BrowserWindow>[0]) => {
        if (options?.show !== false) throw new Error("Capture window must be hidden");
        const window = new BrowserWindow(options);
        state.created++;
        window.webContents.on("did-finish-load", () => { if (window.webContents.getURL().startsWith(siteURL)) state.loaded++; });
        window.webContents.once("destroyed", () => { state.destroyed++; });
        return window;
      } }, {});
      state.close = bridge.close;
      return { env: bridge.env, versions: { node: process.versions.node, electron: process.versions.electron } };
    }, { adapterURL: pathToFileURL(path.join(REPO_ROOT, "apps/desktop/src/desktop-capture.ts")).href, siteURL: site.apiURL });
    evidence.metadata.node = versions.node;
    evidence.metadata.electron = versions.electron!;
    const capture = renderBridgeFromEnv({ env });
    expect(capture).not.toBeNull();
    for (let completed = -10; completed <= 50; completed++) {
      if (completed >= 0 && completed % 10 === 0) {
        phase = `post-GC RSS checkpoint at ${completed} captures`;
        const first = await readDesktopMemory({ app: launch.app, networkPids });
        networkPids = first.networkPids;
        const second = await readDesktopMemory({ app: launch.app, networkPids });
        evidence.checkpoint({ completed, samples: [first.totalRssBytes, second.totalRssBytes], readings: [first, second] });
      }
      if (completed === 50) break;
      phase = `native capture ${completed + 1}`;
      const result = await capture!.captureUrl({ url: site.apiURL, viewport: { width: 800, height: 600 }, fullPage: false, maxPageHeightPx: 600, settleMs: 50 });
      expect(Buffer.from(result.png.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
      expect(result.png.byteLength).toBeGreaterThan(8);
      expect(new URL(result.finalUrl).origin).toBe(site.apiURL);
    }
    phase = "capture window lifetimes";
    // `destroyed` can be emitted after the bridge has already answered the last capture.
    await expect.poll(() => launch!.app.evaluate(() => {
      const { created, loaded, destroyed } = (globalThis as MainState).__memorySoak;
      return { created, loaded, destroyed };
    }), { timeout: 10_000 }).toEqual({ created: 60, loaded: 60, destroyed: 60 });
  } catch (error) {
    // samples.json keeps only the fixed phase; the report keeps the real assertion or I/O error.
    evidence.fail({ reason: phase });
    throw error;
  } finally {
    if (launch) {
      try {
        try { await launch.app.evaluate(() => (globalThis as MainState).__memorySoak?.close()); }
        finally { await closeDesktop(launch); }
        expect(info.errors).toHaveLength(0);
      } catch { evidence.fail({ reason: "bridge or desktop cleanup" }); throw new Error("Desktop cleanup failed"); }
    }
  }
  evidence.finish();
});
