// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { clickAppMenuItem, closeDesktop, launchDesktop, removeScratchTree, listSites, makeSite, openSiteTab, scratchDir, startSite } from "./_fixtures.js";

/**
 * D6 (SCOPE.md §3.3): the per-app settings that are built. The Settings gear itself is
 * `aria-disabled` by design and D1 (`smoke.desktop.ts`) already covers it.
 *
 * - Zoom (`zoom-menu.ts` + `renderer/use-zoom.hooks.ts`): View -> Zoom In routes to whichever surface
 *   is on screen. With a site tab open it zooms the GUEST by 0.5 and persists the level in the host's
 *   `localStorage` under `tovu:zoom:<projectId>`, re-applied when the guest mounts again, including
 *   after a relaunch. On the sites home it zooms the host page itself.
 * - Window bounds (`window-bounds-store.ts`, `main.ts` `close` handler): the window's rectangle is
 *   written to `<userData>/window-bounds.json` on close and restored on the next launch; a
 *   remembered spot no current display covers falls back to an on-screen window.
 */
const SITE = "journey-settings";
let root: string;
let siteDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("settings-sites");
  siteDir = await makeSite(root, SITE);
});
test.afterAll(() => {
  if (root) removeScratchTree({ root }, {});
});

/** Mirrors `windowBoundsFilePath` (not imported: it pulls `@jini-ai/desktop-host` into the runner). */
const boundsFile = (userDataDir: string) => path.join(userDataDir, "window-bounds.json");

function guestZoom(app: ElectronApplication): Promise<number | null> {
  return app.evaluate(({ webContents }) => {
    const guest = webContents.getAllWebContents().find((c: { getType(): string }) => c.getType() === "webview");
    return guest ? (guest as { getZoomLevel(): number }).getZoomLevel() : null;
  });
}

function hostZoom(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomLevel());
}

function windowBounds(app: ElectronApplication): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds());
}

test("Zoom In on a site tab zooms the guest, is remembered per site, and comes back after a relaunch", { tag: ["@unrun"] }, async () => {
  const first = await launchDesktop({ trackedSites: [siteDir] });
  const userDataDir = first.userDataDir;
  let projectId = "";
  try {
    const { app, win } = first;
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    projectId = (await listSites(win)).find((s) => s.displayName === SITE)!.id;
    await expect.poll(() => guestZoom(app)).toBe(0);

    await clickAppMenuItem(app, "Zoom In");
    await expect.poll(() => guestZoom(app)).toBe(0.5);
    expect(await hostZoom(app), "a tab's zoom must not zoom the host chrome").toBe(0);
    expect(await win.evaluate((id) => localStorage.getItem(`tovu:zoom:${id}`), projectId)).toBe("0.5");
  } finally {
    await closeDesktop(first);
  }

  const second = await launchDesktop({ userDataDir });
  try {
    const { app, win } = second;
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    await expect.poll(() => guestZoom(app), { message: "the remembered zoom must be re-applied after a relaunch" }).toBe(0.5);

    await clickAppMenuItem(app, "Actual Size");
    await expect.poll(() => guestZoom(app)).toBe(0);
    expect(await win.evaluate((id) => localStorage.getItem(`tovu:zoom:${id}`), projectId)).toBe("0");
  } finally {
    await closeDesktop(second);
  }
});

test("Zoom on the sites home zooms the host page, and Actual Size resets it", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await expect(win.locator("h1.main__title")).toHaveText("Websites");
    await clickAppMenuItem(app, "Zoom In");
    await expect.poll(() => hostZoom(app)).toBe(0.5);
    await clickAppMenuItem(app, "Zoom Out");
    await clickAppMenuItem(app, "Zoom Out");
    await expect.poll(() => hostZoom(app)).toBe(-0.5);
    await clickAppMenuItem(app, "Actual Size");
    await expect.poll(() => hostZoom(app)).toBe(0);
    await expect(win.locator(".app")).toBeVisible();
  } finally {
    await closeDesktop(launch);
  }
});

test("the window's size and position are written on close and restored on the next launch", { tag: ["@unrun"] }, async () => {
  const wanted = { x: 120, y: 90, width: 1024, height: 720 };
  const first = await launchDesktop();
  const userDataDir = first.userDataDir;
  try {
    await first.app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0]!.setBounds(bounds), wanted);
    await expect.poll(() => windowBounds(first.app)).toMatchObject({ width: wanted.width, height: wanted.height });
  } finally {
    await closeDesktop(first);
  }
  expect(fs.existsSync(boundsFile(userDataDir)), "closing the window must write window-bounds.json").toBe(true);
  expect(JSON.parse(fs.readFileSync(boundsFile(userDataDir), "utf8"))).toMatchObject({ width: wanted.width, height: wanted.height });

  const second = await launchDesktop({ userDataDir });
  try {
    expect(await windowBounds(second.app)).toEqual(wanted);
  } finally {
    await closeDesktop(second);
  }
});

test("a remembered spot no display covers opens the window on screen instead", { tag: ["@unrun"] }, async () => {
  const userDataDir = scratchDir("bounds-offscreen");
  fs.writeFileSync(boundsFile(userDataDir), JSON.stringify({ x: -40_000, y: -40_000, width: 900, height: 700 }));
  const launch = await launchDesktop({ userDataDir });
  try {
    const onScreen = await launch.app.evaluate(({ BrowserWindow, screen }) => {
      const b = BrowserWindow.getAllWindows()[0]!.getBounds();
      return screen.getAllDisplays().some(({ bounds: d }: { bounds: { x: number; y: number; width: number; height: number } }) => {
        const overlapX = Math.min(b.x + b.width, d.x + d.width) - Math.max(b.x, d.x);
        const overlapY = Math.min(b.y + b.height, d.y + d.height) - Math.max(b.y, d.y);
        return overlapX >= 100 && overlapY >= 100;
      });
    });
    expect(onScreen, "the window opened where no display can show it").toBe(true);
    await expect(launch.win.locator(".app")).toBeVisible();
  } finally {
    await closeDesktop(launch);
  }
});
