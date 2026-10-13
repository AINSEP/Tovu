// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectProcessTreePids, listProcessSnapshots, waitForProcessExit } from "@jini-ai/platform";

import { closeDesktop, removeScratchTree, launchDesktop, listSites, makeSite, portAnswers, siteCard, startSite, type DesktopLaunch } from "./_fixtures.js";

/**
 * D7 (SCOPE.md §3.3): no single-instance lock (owner ruling 2026-09-20, `main.ts` never calls
 * `requestSingleInstanceLock`). Two app instances with separate userData run side by side, each
 * starts its own site on its own port, and closing one never takes the other down. Also: two sites
 * running at once inside ONE instance get distinct ports and stop independently.
 */
const ALPHA = "journey-multi-alpha";
const BETA = "journey-multi-beta";
let root: string;
let alphaDir: string;
let betaDir: string;
const ownedPids = new Set<number>();
let processCaptureFailed = false;

test.beforeAll(async () => {
  test.setTimeout(360_000);
  // A surviving writer must retain its fixture: scratchDir's worker-exit cleanup cannot wait.
  root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-journey-multi-sites-"));
  alphaDir = await makeSite(root, ALPHA);
  betaDir = await makeSite(root, BETA);
});
test.afterAll(async () => {
  test.setTimeout(60_000);
  expect(processCaptureFailed, `PID capture failed; retain ${root} rather than deleting under an unknown writer`).toBe(false);
  const remaining = (await Promise.all([...ownedPids].map(async (pid) =>
    await waitForProcessExit(pid, 30_000) ? undefined : pid))).filter((pid) => pid !== undefined);
  expect(remaining, `owned desktop/serve/daemon processes must exit before deleting ${root}`).toEqual([]);
  if (root) removeScratchTree({ root }, {});
});

/** Snapshot owned descendants while their parent is alive, including detached serve/daemon
 * groups. Uses Jini's process-tree owner; fails if enumeration is unavailable.
 * @complexity O(p * d) for p process snapshots and d descendant-tree passes; no signals sent.
 */
async function captureOwnedProcesses({ launch }: { launch: DesktopLaunch }, _options = {}): Promise<void> {
  const snapshots = await listProcessSnapshots();
  const pid = launch.app.process().pid;
  const desktopFound = snapshots.some((entry) => entry.pid === pid);
  if (!desktopFound) processCaptureFailed = true;
  expect(desktopFound, "process enumeration must include the live desktop").toBe(true);
  for (const owned of collectProcessTreePids(snapshots, [pid])) ownedPids.add(owned);
}

async function runningPort(launch: DesktopLaunch, name: string): Promise<number> {
  const record = (await listSites(launch.win)).find((s) => s.displayName === name);
  expect(record?.status, `${name} status`).toBe("running");
  return record!.port;
}

test("two instances run side by side, each with its own running site, and closing the second leaves the first alive", { tag: ["@unrun"] }, async () => {
  const first = await launchDesktop({ trackedSites: [alphaDir] });
  let second: DesktopLaunch | undefined;
  try {
    second = await launchDesktop({ trackedSites: [betaDir] });
    expect(second.app.process().pid).not.toBe(first.app.process().pid);
    await expect(first.win.locator(".app"), "the first instance must survive the second launch").toBeVisible();
    await expect(second.win.locator(".app")).toBeVisible();

    await startSite(first.win, ALPHA);
    await startSite(second.win, BETA);
    const alphaPort = await runningPort(first, ALPHA);
    const betaPort = await runningPort(second, BETA);
    expect(alphaPort).not.toBe(betaPort);
    expect(await portAnswers(alphaPort)).toBe(true);
    expect(await portAnswers(betaPort)).toBe(true);

    await captureOwnedProcesses({ launch: first });
    await captureOwnedProcesses({ launch: second });
    await closeDesktop(second);
    second = undefined;
    expect(first.app.process().exitCode, "closing the second instance must not exit the first").toBeNull();
    await expect(first.win.locator(".app")).toBeVisible();
    await expect(siteCard(first.win, ALPHA).locator(".state")).toHaveText("Running");
    expect(await portAnswers(alphaPort), "the first instance's site must keep serving").toBe(true);
    await first.win.reload();
    await expect(first.win.locator(".app")).toBeVisible();
  } finally {
    try {
      if (second) {
        try { await captureOwnedProcesses({ launch: second }); }
        finally { await closeDesktop(second); }
      }
    } finally {
      try { await captureOwnedProcesses({ launch: first }); }
      finally { await closeDesktop(first); }
    }
  }
});

test("two sites in one instance run on distinct ports and stop independently", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [alphaDir, betaDir] });
  const { win } = launch;
  try {
    await startSite(win, ALPHA);
    await startSite(win, BETA);
    const alphaPort = await runningPort(launch, ALPHA);
    const betaPort = await runningPort(launch, BETA);
    expect(alphaPort).not.toBe(betaPort);
    expect(await portAnswers(alphaPort)).toBe(true);
    expect(await portAnswers(betaPort)).toBe(true);

    // Capture alpha's daemon before Stop can reparent it; capture again before Quit for beta.
    await captureOwnedProcesses({ launch });
    const alphaCard = siteCard(win, ALPHA);
    await alphaCard.getByRole("button", { name: `Stop ${ALPHA}`, exact: true }).click();
    await expect(alphaCard.locator(".state")).toHaveText("Stopped", { timeout: 60_000 });
    await expect.poll(() => portAnswers(alphaPort), { timeout: 30_000 }).toBe(false);
    await expect(siteCard(win, BETA).locator(".state"), "stopping one site must not stop the other").toHaveText("Running");
    expect(await portAnswers(betaPort)).toBe(true);
  } finally {
    try { await captureOwnedProcesses({ launch }); }
    finally { await closeDesktop(launch); }
  }
});
