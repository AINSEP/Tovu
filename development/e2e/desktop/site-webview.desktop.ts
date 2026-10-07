// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test, type ElectronApplication } from "@playwright/test";

import {
  closeDesktop,
  removeScratchTree,
  guestEval,
  guestFetch,
  guestInsertText,
  guestUrl,
  launchDesktop,
  makeSite,
  openSiteTab,
  scratchDir,
  siteCard,
  startSite,
} from "./_fixtures.js";

/**
 * D3 (SCOPE.md §3.3): a site tab's `<webview>` guest. The guest is reachable only through the main
 * process (`webContents.getAllWebContents()`), the pattern `desktop-shell.spec.ts` proved; text goes
 * in through `webContents.insertText` (Chromium's real input path, not a synthetic value write).
 *
 * The persistence check reads the post back with `fetch` from INSIDE the guest, i.e. through the
 * guest's own cookie jar and the site's real `requireAdminSession` gate.
 *
 * Tab switching must keep the guest's route because `SiteWorkspaces` hides inactive workspaces with
 * CSS and never unmounts a live `<webview>` (`App.tsx`). Closing the tab DOES unmount it; reopening
 * must come back signed in with the content intact.
 */
const SITE = "journey-webview";
const POSTS_API = "/api/admin/v1/workspaces/workspace-local/posts";
let root: string;
let siteDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("webview-sites");
  siteDir = await makeSite(root, SITE);
});
test.afterAll(() => {
  if (root) removeScratchTree({ root }, {});
});

/** Clicks the first guest button whose trimmed text matches `pattern`; false when none exists yet. */
function clickGuestButton(app: ElectronApplication, pattern: RegExp): Promise<boolean> {
  return guestEval<boolean>(app, `(() => {
    const re = new RegExp(${JSON.stringify(pattern.source)});
    const button = [...document.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()) && !b.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

/** Focuses the guest control whose accessible name is `name` (aria-label or wrapping label). */
function focusGuestField(app: ElectronApplication, name: string): Promise<boolean> {
  return guestEval<boolean>(app, `(() => {
    const wanted = ${JSON.stringify(name)};
    let field = document.querySelector('[aria-label="' + wanted + '"]');
    if (!field) {
      const label = [...document.querySelectorAll("label")].find((l) => (l.textContent || "").trim().startsWith(wanted));
      field = label ? (label.control || label.querySelector("input, textarea")) : null;
    }
    if (!field) return false;
    field.focus();
    return document.activeElement === field;
  })()`);
}

test("the guest admin is signed in, a draft written in the guest persists, and switching tabs keeps its route", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  const title = `Desktop draft ${Date.now().toString(36)}`;
  try {
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    expect((await guestFetch(app, "/api/admin/v1/auth/me")).status, "the guest must arrive signed in").toBe(200);
    expect(await guestEval<number>(app, `document.querySelectorAll('input[type="password"]').length`)).toBe(0);

    await guestEval(app, `location.assign("/admin/posts")`);
    await expect.poll(() => clickGuestButton(app, /^New Post$/), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => guestUrl(app), { timeout: 30_000 }).toMatch(/\/admin\/posts\/[^/]+$/);
    const postUrl = (await guestUrl(app))!;
    const postId = postUrl.split("/").pop()!;

    await expect.poll(() => focusGuestField(app, "Post title")).toBe(true);
    // New Post deliberately seeds "Untitled"; replace it through Chromium's real input path.
    await guestEval(app, `(document.activeElement).select()`);
    await guestInsertText(app, title);
    await expect.poll(() => guestEval<string>(app, `document.activeElement.value`)).toBe(title);
    await expect.poll(() => clickGuestButton(app, /^Save/)).toBe(true);
    await expect
      .poll(async () => (await guestFetch(app, `${POSTS_API}/${postId}`)).body?.post?.title, { timeout: 30_000 })
      .toBe(title);
    expect((await guestFetch(app, `${POSTS_API}/${postId}`)).body.post.status).toBe("draft");

    // Hidden, not unmounted: the guest keeps its own route across a tab switch.
    await win.getByRole("tab", { name: "All" }).click();
    await expect(siteCard(win, SITE)).toBeVisible();
    await win.getByRole("tab", { name: SITE }).click();
    expect(await guestUrl(app)).toBe(postUrl);

    // Closing the tab unmounts the guest; reopening comes back signed in with the draft intact.
    await win.getByRole("button", { name: `Close ${SITE}` }).click();
    await expect(win.locator("webview")).toHaveCount(0);
    await openSiteTab(app, win, SITE);
    expect((await guestFetch(app, "/api/admin/v1/auth/me")).status).toBe(200);
    expect((await guestFetch(app, `${POSTS_API}/${postId}`)).body?.post?.title).toBe(title);
  } finally {
    await closeDesktop(launch);
  }
});

test("the Site toggle shows the public site in the same guest, and Admin brings the admin back", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    const workspace = win.locator("section.workspace:not(.is-hidden)");
    await workspace.getByRole("button", { name: "Site", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "Site", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => guestUrl(app)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/(?!admin\/)/);
    expect(await guestEval<string>(app, "document.readyState")).toBe("complete");
    await expect(workspace.locator(".workspace__url")).not.toContainText("/admin/");

    await workspace.getByRole("button", { name: "Admin", exact: true }).click();
    await expect.poll(() => guestUrl(app)).toMatch(/\/admin\//);
    await workspace.getByRole("button", { name: "Back" }).click();
    await expect.poll(() => guestUrl(app), "Back follows the guest's own history").not.toMatch(/\/admin\//);
  } finally {
    await closeDesktop(launch);
  }
});

test("Expand to full window hides the app chrome and Exit brings it back", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    await win.getByRole("button", { name: "Expand to full window" }).click();
    await expect(win.getByRole("navigation", { name: "Tovu sections" })).toHaveCount(0);
    await expect(win.getByRole("tablist", { name: "Open websites" })).toHaveCount(0);
    await expect(win.locator("webview")).toBeVisible();
    await win.getByRole("button", { name: "Exit full window" }).click();
    await expect(win.getByRole("navigation", { name: "Tovu sections" })).toBeVisible();
  } finally {
    await closeDesktop(launch);
  }
});
