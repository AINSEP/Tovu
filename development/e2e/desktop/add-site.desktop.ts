// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import {
  closeDesktop,
  removeScratchTree,
  emptyFolder,
  guestFetch,
  launchDesktop,
  listSites,
  makeSite,
  openSiteTab,
  scratchDir,
  siteCard,
  startSite,
  stubFolderPicker,
} from "./_fixtures.js";
import { sitesFilePath } from "../../../apps/desktop/src/tracked-sites.ts";

/**
 * D2 (SCOPE.md §3.3): getting a site onto the sites home. Two entry points, both behind the native
 * folder picker, which `stubFolderPicker` replaces; every step after it is the shipping path:
 *  - "Add Tovu Website" (`project-ipc.ts` `handleAddSite` -> `add-site-pointer.ts`): points at a
 *    folder that ALREADY holds a site and never creates one. An empty folder is refused with
 *    `SITE_DIR_EMPTY`'s sentence.
 *  - "Create website" onboarding (`CreateWebsiteOnboarding.tsx` -> `handleCreate`): `tovu init`
 *    into the chosen empty folder, tracked as `created`, so its card offers "Delete…" (which erases
 *    files). Cancellation preserves files; confirming Delete removes the whole tree.
 */
const EXISTING = "journey-add-existing";
let root: string;
let existingDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("add-site");
  existingDir = await makeSite(root, EXISTING);
});
test.afterAll(() => {
  if (root) removeScratchTree({ root }, {});
});

test("Add Tovu Website adopts an existing site; it starts, opens authenticated, and is remembered", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win, userDataDir } = launch;
  try {
    await expect(siteCard(win, EXISTING)).toHaveCount(0);
    await stubFolderPicker(app, existingDir);
    await win.getByRole("button", { name: "Add Tovu Website" }).click();
    await expect(siteCard(win, EXISTING)).toBeVisible();

    const record = (await listSites(win)).find((s) => s.displayName === EXISTING);
    expect(record?.installDir).toBe(existingDir);
    expect(record?.deleteErasesFiles, "an adopted folder must never be erasable").toBe(false);
    expect(fs.readFileSync(sitesFilePath(userDataDir), "utf8")).toContain(existingDir);

    await startSite(win, EXISTING);
    await openSiteTab(app, win, EXISTING);
    const me = await guestFetch(app, "/api/admin/v1/auth/me");
    expect(me.status, "the site tab must open signed in, with no login form").toBe(200);
  } finally {
    await closeDesktop(launch);
  }
});

test("Add Tovu Website on an empty folder is refused with a sentence that names the fix, and adds no card", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win } = launch;
  const empty = emptyFolder("add-empty");
  try {
    const before = (await listSites(win)).length;
    await stubFolderPicker(app, empty);
    await win.getByRole("button", { name: "Add Tovu Website" }).click();
    await expect(win.getByText(/there is no Tovu site here to add/)).toBeVisible();
    await expect(win.getByText(/use "Create website"/)).toBeVisible();
    expect((await listSites(win)).length).toBe(before);
    expect(fs.existsSync(path.join(empty, "config.json")), "adding must never initialise a folder").toBe(false);
  } finally {
    await closeDesktop(launch);
  }
});

test("cancelling the folder picker adds nothing and shows no error", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win } = launch;
  try {
    const before = (await listSites(win)).length;
    await stubFolderPicker(app, null);
    await win.getByRole("button", { name: "Add Tovu Website" }).click();
    await expect(win.getByRole("button", { name: "Add Tovu Website" })).toBeEnabled();
    await expect(win.getByText("No folder was chosen.")).toHaveCount(0);
    expect((await listSites(win)).length).toBe(before);
  } finally {
    await closeDesktop(launch);
  }
});

test("Create website makes a real site whose Delete confirms and removes all files", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win } = launch;
  const target = emptyFolder("create");
  const name = `Journey Bakery ${Date.now().toString(36)}`;
  try {
    await win.getByRole("button", { name: "Create website" }).click();
    await expect(win.locator("h1.main__title")).toHaveText("Create a website");
    const create = win.getByRole("button", { name: "Create local instance" });
    await expect(create, "an unnamed site cannot be created").toBeDisabled();
    await win.getByRole("textbox", { name: /^Website name/ }).fill(name);
    await stubFolderPicker(app, target);
    await create.click();

    await expect(win.locator(".creation-notice")).toContainText(name, { timeout: 150_000 });
    expect(fs.existsSync(path.join(target, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "content.db"))).toBe(true);
    const card = siteCard(win, name);
    await expect(card).toBeVisible();
    expect((await listSites(win)).find((s) => s.displayName === name)?.deleteErasesFiles).toBe(true);

    await card.getByRole("button", { name: `More actions for ${name}` }).click();
    await win.getByRole("menuitem", { name: "Delete…" }).click();
    const confirm = win.getByRole("group", { name: `Delete ${name}?` });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("This cannot be undone.");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(card).toBeVisible();
    expect(fs.existsSync(path.join(target, "content.db")), "Cancel must leave every file in place").toBe(true);
    // D-01: the app-created agent-plugin store contains read-only packages; deletion must erase it.
    await card.getByRole("button", { name: `More actions for ${name}` }).click();
    await win.getByRole("menuitem", { name: "Delete…" }).click();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(fs.existsSync(target), "Delete must remove the entire install directory").toBe(false);
    expect((await listSites(win)).some((site) => site.installDir === target)).toBe(false);
  } finally {
    await closeDesktop(launch);
  }
});

test("double-clicking Create local instance creates one site", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win } = launch;
  const target = emptyFolder("create-double");
  const name = `Journey Double ${Date.now().toString(36)}`;
  try {
    await win.getByRole("button", { name: "Create website" }).click();
    await win.getByRole("textbox", { name: /^Website name/ }).fill(name);
    await stubFolderPicker(app, target);
    await win.getByRole("button", { name: "Create local instance" }).dblclick();
    await expect(win.locator(".creation-notice")).toContainText(name, { timeout: 150_000 });
    expect((await listSites(win)).filter((s) => s.displayName === name)).toHaveLength(1);
    await expect(siteCard(win, name)).toHaveCount(1);
  } finally {
    await closeDesktop(launch);
  }
});


test("D-02 and D-03: invalid names never open the picker, and Create cancellation keeps the form quietly", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop();
  const { app, win } = launch;
  try {
    await app.evaluate(({ dialog }) => {
      let calls = 0;
      dialog.showOpenDialog = async () => { calls++; return { canceled: true, filePaths: [] }; };
      (globalThis as typeof globalThis & { shellPickerCalls?: () => number }).shellPickerCalls = () => calls;
    });
    await win.getByRole("button", { name: "Create website" }).click();
    const input = win.getByRole("textbox", { name: /^Website name/ });
    const submit = win.getByRole("button", { name: "Create local instance" });
    expect(await input.getAttribute("maxlength")).toBe("200");
    // Dispatch a real oversized paste: maxlength alone would silently save a truncated name.
    await input.evaluate((node) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text", "x".repeat(201));
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    });
    await expect(win.getByRole("alert")).toHaveText("A name must be 1 to 200 characters, not counting spaces at either end.");
    await expect(submit).toBeDisabled();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { shellPickerCalls: () => number }).shellPickerCalls())).toBe(0);
    await input.fill("Cancelled Website");
    const before = (await listSites(win)).length;
    await submit.click();
    await expect(submit).toBeEnabled();
    await expect(input).toHaveValue("Cancelled Website");
    await expect(win.getByRole("alert")).toHaveCount(0);
    await expect(win.locator("h1.main__title")).toHaveText("Create a website");
    expect((await listSites(win)).length).toBe(before);
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { shellPickerCalls: () => number }).shellPickerCalls())).toBe(1);
  } finally { await closeDesktop(launch); }
});
