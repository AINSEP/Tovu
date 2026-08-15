import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Deployment panel → Dockerfile tab, driven through the REAL admin SPA against the REAL Tovu
 * API (`../playwright.dockerfile-tab.config.ts`'s hermetic two-server harness). No route stubbing.
 *
 * This tab used to be a read-only `<pre>` with Copy/Download only — the AI assistant could edit the
 * repo-root Dockerfile via the `deployment_set_dockerfile` agent tool, but a human looking at this
 * exact screen could not. This spec pins the fix at the browser level, which is where it has to be
 * pinned: the admin's editable textarea and the eventual public/build-side consumers of this same
 * file are different code paths, so a passing unit test against a fake port does not by itself prove
 * a real edit typed into a real `<textarea>`, saved through the real `PUT` route, actually lands on
 * disk and survives a reload — this does.
 *
 * ## This test touches the REAL repo-root `Dockerfile` — read this before changing it
 *
 * `dockerfilePath()` (`src/features/deployments/dockerfile.ts`) has no path parameter anywhere in
 * its call chain: it always resolves to `join(process.cwd(), "Dockerfile")`, and this harness's own
 * API server boots with `cwd: REPO_ROOT` (`../playwright.dockerfile-tab.config.ts`), i.e. the actual
 * project root. There is no way to point this suite's write at a scratch copy instead — the route
 * itself doesn't support one. That means every `PUT` this spec issues mutates the SAME `Dockerfile`
 * `docker build` would use for a real image, so `beforeEach` captures its exact current contents via
 * the API before touching anything, and `afterEach` restores that exact snapshot — unconditionally,
 * whether the test passed or failed — then re-reads it back to CONFIRM the restore actually landed
 * rather than trusting a 200 status alone. If `afterEach` ever fails loudly, treat that as "the repo's
 * real Dockerfile may be left in a test state" and check it by hand before doing anything else with
 * it.
 *
 * The edit itself only APPENDS a uniquely-timestamped comment line to the real captured contents
 * (never replaces them wholesale) — even if this suite were interrupted between the edit and the
 * restore (a killed worker, a crashed browser), the on-disk Dockerfile would still be the real,
 * buildable one with one harmless extra comment line, not a fabricated placeholder.
 */

const API_BASE = "/api/admin/v1/workspaces/workspace-local/system/dockerfile";

let originalContents: string | null = null;

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get(API_BASE);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { exists: boolean; contents: string | null };
  // The live repo has a real Dockerfile as of 2026-08-15 (confirmed before writing this suite), so
  // this is the expected shape — asserted rather than assumed, so a future repo state that somehow
  // has none fails loudly here instead of silently skipping the restore check below.
  expect(body.exists).toBe(true);
  originalContents = body.contents;
});

test.afterEach(async ({ page }) => {
  if (originalContents === null) return;
  const restore = await page.request.put(API_BASE, { data: { contents: originalContents } });
  expect(restore.ok()).toBe(true);
  // Don't just trust the 200 — read it back and confirm the bytes on disk actually match again.
  const check = await page.request.get(API_BASE);
  const body = (await check.json()) as { contents: string | null };
  expect(body.contents).toBe(originalContents);
});

test.describe("Dockerfile tab is editable", () => {
  test("editing and saving a real change persists across reload, and the Unsaved-changes pill tracks it correctly", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=dockerfile", { waitUntil: "domcontentloaded" });

    const textarea = page.getByRole("textbox", { name: "Dockerfile contents" });
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await expect(textarea).toHaveValue(originalContents ?? "");
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();

    const marker = `\n# e2e-marker ${Date.now()} — dockerfile-tab-editable.spec.ts\n`;
    const editedContents = `${originalContents ?? ""}${marker}`;
    await textarea.fill(editedContents);

    // Editing marks it dirty — the pill is the operator's only on-screen warning that closing the
    // tab right now would lose this edit (the `beforeunload` guard fires on the SAME condition).
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();

    // Success is visible two ways: the transient "Saved" confirmation, and the pill going away.
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();
    await expect(textarea).toHaveValue(editedContents);

    // The real proof of persistence: reload triggers a fresh GET from the server (not a cache), and
    // the marker line must still be there — this is what would fail if `save()` only updated local
    // React state without the `PUT` actually landing.
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadedTextarea = page.getByRole("textbox", { name: "Dockerfile contents" });
    await reloadedTextarea.waitFor({ state: "visible", timeout: 10_000 });
    await expect(reloadedTextarea).toHaveValue(editedContents);
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();
  });
});
