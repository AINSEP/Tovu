// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { closeDesktop, removeScratchTree, emptyFolder, launchDesktop, listSites, makeSite, portAnswers, scratchDir, siteCard, startSite, stubFolderPicker } from "./_fixtures.js";

/**
 * D5 (SCOPE.md §3.3): a card's lifecycle on the sites home. Every site here is a scratch fixture
 * made by `makeSite`; the checkout's own `sites/tovu-dev` card is never addressed.
 *
 * - Power: Start -> the port answers; Restart -> Running again and answering; Stop -> the port goes
 *   quiet (`SiteGrid.tsx` `CardActions`, labels `Start X` / `Restart X` / `Stop X`).
 * - Rename: ⋮ -> `Rename…` -> `Display name` -> Save writes `config.json.name` (`site-config.ts`
 *   `writeSiteName`) and survives a relaunch on the same userData. A blank name keeps Save disabled.
 * - Remove: an ADOPTED card offers `Remove from Projects…`, which never touches disk. Cancel keeps
 *   the card; Remove drops it, leaves the folder, and the tombstone keeps it gone after a relaunch.
 *   This is the only confirm this file presses, and only on a scratch adopted site.
 * - Locate: a folder moved BEFORE the first launch has no `relocationId` yet, so `site-relocation.ts`
 *   cannot heal it and the card shows `Folder moved or deleted` with Locate instead of Start.
 */
const POWER = "journey-power";
const RENAME = "journey-rename";
const REMOVE = "journey-remove";
const LOCATE = "journey-locate";
let root: string;
const dirs: Record<string, string> = {};

test.beforeAll(async () => {
  test.setTimeout(480_000);
  root = scratchDir("lifecycle-sites");
  for (const name of [POWER, RENAME, REMOVE, LOCATE]) dirs[name] = await makeSite(root, name);
});
test.afterAll(() => {
  if (root) removeScratchTree({ root }, {});
});

async function portOf(win: Parameters<typeof listSites>[0], name: string): Promise<number> {
  const record = (await listSites(win)).find((s) => s.displayName === name);
  expect(record, `${name} is not in listSites`).toBeDefined();
  return record!.port;
}

interface PreviewLoad { url: string; phase: "loaded" | "failed"; code?: number }
/** The slice of Electron's BrowserWindow the listener reads; `electron` types are not in the e2e tsconfig. */
interface HiddenWindow {
  isVisible(): boolean;
  webContents: {
    getURL(): string;
    on(event: "did-finish-load", listener: () => void): void;
    on(event: "did-fail-load", listener: (event: unknown, code: number, description: string, url: string, isMainFrame: boolean) => void): void;
  };
}

/** Observe the real hidden capture windows, so a restart cannot silently leave a dead thumbnail. */
async function watchPreviewLoads({ app }: { app: ElectronApplication }, _optional = {}): Promise<void> {
  await app.evaluate(({ app: electronApp }) => {
    const state = globalThis as typeof globalThis & { __previewLoads?: PreviewLoad[] };
    state.__previewLoads = [];
    electronApp.on("browser-window-created", (_event: unknown, window: HiddenWindow) => {
      if (window.isVisible()) return;
      // A public-root load in a hidden window is the capture; the admin guest is a webview.
      const isPreview = (url: string) => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(url);
      window.webContents.on("did-finish-load", () => {
        const url = window.webContents.getURL();
        if (isPreview(url)) state.__previewLoads!.push({ url, phase: "loaded" });
      });
      window.webContents.on("did-fail-load", (_event: unknown, code: number, _description: string, url: string, isMainFrame: boolean) => {
        if (isMainFrame && code !== -3 && isPreview(url)) state.__previewLoads!.push({ url, phase: "failed", code });
      });
    });
  });
}

async function previewLoads({ app }: { app: ElectronApplication }, _optional = {}): Promise<PreviewLoad[]> {
  return app.evaluate(() => [...((globalThis as typeof globalThis & { __previewLoads?: PreviewLoad[] }).__previewLoads ?? [])]);
}

test("Start, Restart and Stop drive the real site process", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [dirs[POWER]!] });
  const { app, win } = launch;
  const card = siteCard(win, POWER);
  try {
    await watchPreviewLoads({ app }, {});
    await startSite(win, POWER);
    const port = await portOf(win, POWER);
    expect(await portAnswers(port), "a Running site must answer on its port").toBe(true);

    await card.getByRole("button", { name: `Restart ${POWER}`, exact: true }).click();
    await expect(card.locator(".state")).toHaveText("Running", { timeout: 150_000 });
    const portAfterRestart = await portOf(win, POWER);
    await expect.poll(() => portAnswers(portAfterRestart), { timeout: 60_000 }).toBe(true);
    // Restart immediately after returning to All overlaps the old 1.5 s capture debounce.
    // Require the new lifecycle's public-root load, not merely absence of a failed old load.
    await expect.poll(async () => (await previewLoads({ app }, {})).some((load) =>
      load.phase === "loaded" && load.url === `http://127.0.0.1:${portAfterRestart}/`),
    { timeout: 30_000, message: "the preview must load the restarted site's live port" }).toBe(true);
    expect((await previewLoads({ app }, {})).filter((load) => load.phase === "failed"),
      "no hidden preview may hit a stopped or stale port").toEqual([]);

    await card.getByRole("button", { name: `Stop ${POWER}`, exact: true }).click();
    await expect(card.locator(".state")).toHaveText("Stopped", { timeout: 60_000 });
    await expect.poll(() => portAnswers(portAfterRestart), { timeout: 30_000, message: "a stopped site must stop answering" }).toBe(false);
    await expect(card.getByRole("button", { name: `Start ${POWER}`, exact: true })).toBeEnabled();
  } finally {
    await closeDesktop(launch);
  }
});

test("Rename writes config.json, refuses a blank name, and survives a relaunch", { tag: ["@unrun"] }, async () => {
  const newName = `Journey Renamed ${Date.now().toString(36)}`;
  const first = await launchDesktop({ trackedSites: [dirs[RENAME]!] });
  const userDataDir = first.userDataDir;
  try {
    const { win } = first;
    await siteCard(win, RENAME).getByRole("button", { name: `More actions for ${RENAME}` }).click();
    await win.getByRole("menuitem", { name: "Rename…" }).click();
    const form = win.getByRole("group", { name: `Rename ${RENAME}` });
    const field = form.getByLabel("Display name");
    const save = form.getByRole("button", { name: "Save" });

    await field.fill("   ");
    await expect(save, "a blank name must not be savable").toBeDisabled();
    await expect(form).toContainText("A name must be 1 to 200 characters");

    await field.fill(newName);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(form).toHaveCount(0);
    await expect(siteCard(win, newName)).toBeVisible();
    await expect(siteCard(win, RENAME)).toHaveCount(0);
    const config = JSON.parse(fs.readFileSync(path.join(dirs[RENAME]!, "config.json"), "utf8")) as { name: string };
    expect(config.name).toBe(newName);
  } finally {
    await closeDesktop(first);
  }

  const second = await launchDesktop({ userDataDir });
  try {
    await expect(siteCard(second.win, newName), "the new name must survive a relaunch").toBeVisible();
  } finally {
    await closeDesktop(second);
  }
});

test("Remove from Projects: Cancel keeps the card; Remove drops it, keeps the folder, and stays gone after relaunch", { tag: ["@unrun"] }, async () => {
  const first = await launchDesktop({ trackedSites: [dirs[REMOVE]!] });
  const userDataDir = first.userDataDir;
  try {
    const { win } = first;
    const card = siteCard(win, REMOVE);
    expect((await listSites(win)).find((s) => s.displayName === REMOVE)?.deleteErasesFiles, "an adopted card must never erase files").toBe(false);

    const openConfirm = async () => {
      await card.getByRole("button", { name: `More actions for ${REMOVE}` }).click();
      await win.getByRole("menuitem", { name: "Remove from Projects…" }).click();
      const confirm = win.getByRole("group", { name: `Remove ${REMOVE} from Projects?` });
      await expect(confirm).toBeVisible();
      return confirm;
    };

    const cancelled = await openConfirm();
    await cancelled.getByRole("button", { name: "Cancel" }).click();
    await expect(cancelled).toHaveCount(0);
    await expect(card).toBeVisible();

    const confirm = await openConfirm();
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(card).toHaveCount(0);
    expect((await listSites(win)).some((s) => s.displayName === REMOVE)).toBe(false);
    expect(fs.existsSync(path.join(dirs[REMOVE]!, "config.json")), "Remove must leave the folder on disk").toBe(true);
    expect(fs.existsSync(path.join(dirs[REMOVE]!, "content.db"))).toBe(true);
  } finally {
    await closeDesktop(first);
  }

  const second = await launchDesktop({ userDataDir });
  try {
    await expect(siteCard(second.win, REMOVE), "a removed card must not come back on relaunch").toHaveCount(0);
  } finally {
    await closeDesktop(second);
  }
});

test("a folder moved before launch shows as missing; a wrong folder is refused; Locate repoints the card", { tag: ["@unrun"] }, async () => {
  const oldDir = dirs[LOCATE]!;
  const newParent = scratchDir("locate-moved");
  const newDir = path.join(newParent, LOCATE);
  fs.renameSync(oldDir, newDir);
  const launch = await launchDesktop({ trackedSites: [oldDir] });
  const { app, win } = launch;
  try {
    const card = siteCard(win, LOCATE);
    await expect(card.locator(".card__missing")).toHaveText("Folder moved or deleted");
    await expect(card.getByRole("button", { name: `Start ${LOCATE}`, exact: true }), "a missing folder offers Locate, not Start").toHaveCount(0);
    const locate = card.getByRole("button", { name: `Locate the folder for ${LOCATE}` });

    await stubFolderPicker(app, emptyFolder("locate-wrong"));
    await locate.click();
    await expect(card.locator(".card__actionerror")).toContainText("is not a complete Tovu site");
    await expect(card.locator(".card__missing")).toBeVisible();

    await stubFolderPicker(app, newDir);
    await locate.click();
    await expect(card.locator(".card__missing")).toHaveCount(0);
    await expect(card.getByRole("button", { name: `Start ${LOCATE}`, exact: true })).toBeVisible();
    expect((await listSites(win)).find((s) => s.displayName === LOCATE)?.installDir).toBe(newDir);
  } finally {
    await closeDesktop(launch);
    removeScratchTree({ root: newParent }, {});
  }
});
