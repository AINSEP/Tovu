import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression coverage for an owner-reported bug (2026-09-14): "Theme editor goes blank and
 * read-only briefly on every file load" — the HTML tab of the theme Explore screen.
 *
 * Root cause: `use-theme-explore.hooks.ts`'s `select` committed the clicked file as `selected` before
 * its text was read. `sourceLoaded` then went false, and `themeExploreHtmlMode` rendered the empty,
 * read-only "unloaded" source until `getThemeFile` resolved — on every switch. That state exists to
 * stop a stale buffer being saved over another file (12232a2b), so it cannot simply be removed.
 *
 * Fix: in the HTML view, a click on a readable file waits for that file's text and opens it in one
 * render; the file list highlights the click at once through `highlightedPath`.
 *
 * Why a real browser: the flash is a rendered state between two React commits, and jsdom paints
 * nothing. Every animation frame is sampled, and each file read is held for {@link READ_DELAY_MS} so
 * the window is wide enough to hit reliably. Before the fix every switch sampled an empty read-only
 * textarea for the whole held read.
 */

const READ_DELAY_MS = 400;

test.describe("theme Explore — switching files in the HTML view never blanks the editor (2026-09-14 regression)", () => {
  test("the editor shows real, editable text on every frame of a file switch", async ({ page }) => {
    let heldRead: { path: string; reached: boolean; wait: Promise<void> } | undefined;
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      const pending = heldRead;
      if (route.request().method() === "GET" && pending?.path === new URL(route.request().url()).searchParams.get("path")) {
        pending.reached = true;
        await pending.wait;
      }
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=basic", { waitUntil: "domcontentloaded" });
    const rows = page.locator(".theme-explore-file-row button[title]");
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "HTML" }).click();
    const editor = page.locator(".page-html-source");
    await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("", {
      timeout: 10_000,
    });

    const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
    const pages = titles.filter((title) => title.endsWith(".html")).slice(0, 3);
    expect(pages).toHaveLength(3);

    const contents = new Map<string, string>();
    for (const path of pages) {
      const response = await page.request.get(`/api/admin/v1/workspaces/workspace-local/themes/basic/file?path=${encodeURIComponent(path)}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.path).toBe(path);
      expect(body.content.length).toBeGreaterThan(0);
      contents.set(path, body.content);
    }
    expect(new Set(contents.values()).size).toBe(3);

    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const target of [pages[1]!, pages[2]!, pages[0]!]) {
      const before = await editor.inputValue();
      const row = page.locator(`.theme-explore-file-row button[title="${target}"]`);
      let release!: () => void;
      heldRead = { path: target, reached: false, wait: new Promise<void>((resolve) => { release = resolve; }) };
      try {
        await row.click();
        await expect.poll(() => heldRead?.reached).toBe(true);
        // Assert the highlight and held buffer before the response can arrive.
        await expect(row).toHaveAttribute("aria-current", "true");
        await expect(editor).toHaveValue(before);
        await page.waitForTimeout(READ_DELAY_MS); // keep the sampled paint window open
      } finally {
        heldRead = undefined;
        release();
      }
      await expect(editor).not.toHaveValue(before, { timeout: 10_000 });
      await expect(editor).toHaveValue(contents.get(target)!, { timeout: 10_000 });
    }

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
  });

  /**
   * T91: the click-hold fix above only covered a click. A `?file=`/`?page=` change on the ALREADY
   * MOUNTED screen (Back/Forward, an in-app link, or the URL catching up after a click) took a
   * different, unguarded path in `use-theme-explore.hooks.ts`'s initial-load effect and still
   * flashed unloaded. Fix: `requestedSelectionMove` holds a reselect the same way `select` holds a
   * click.
   */
  test("E1: a ?file= navigation on the open screen, and Back, show real editable text on every frame", async ({ page }) => {
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=basic", { waitUntil: "domcontentloaded" });
    const rows = page.locator(".theme-explore-file-row button[title]");
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "HTML" }).click();
    const editor = page.locator(".page-html-source");
    await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("", {
      timeout: 10_000,
    });

    const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
    const pages = titles.filter((title) => title.endsWith(".html")).slice(0, 3);
    expect(pages).toHaveLength(3);

    const contents = new Map<string, string>();
    for (const path of pages) {
      const response = await page.request.get(`/api/admin/v1/workspaces/workspace-local/themes/basic/file?path=${encodeURIComponent(path)}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.path).toBe(path);
      expect(body.content.length).toBeGreaterThan(0);
      contents.set(path, body.content);
    }
    expect(new Set(contents.values()).size).toBe(3);

    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const target of [pages[1]!, pages[2]!]) {
      const before = await editor.inputValue();
      await page.evaluate((href) => {
        history.pushState(null, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, `/admin/themes/explore?theme=basic&file=${encodeURIComponent(target)}`);
      await expect(editor).not.toHaveValue(before, { timeout: 10_000 });
      await expect(editor).toHaveValue(contents.get(target)!, { timeout: 10_000 });
    }

    const beforeBack = await editor.inputValue();
    await page.goBack();
    await expect(editor).not.toHaveValue(beforeBack, { timeout: 10_000 });
    await expect(editor).toHaveValue(contents.get(pages[1]!)!, { timeout: 10_000 });

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
  });

  /**
   * T91: renaming the open file went through a different path than a click too — the selection moved
   * (`performRename`) without moving the loaded-file marker, so the same "unloaded" flash showed, and
   * the follow-up re-read silently discarded any unsaved edit. Fix: `loadedFileAfterRename` moves the
   * marker with the rename instead of re-reading. Fully intercepted — nothing is renamed on disk.
   */
  test("E2: renaming the open file shows real editable text on every frame, with no re-read", async ({ page }) => {
    await page.route(/\/themes\/[^/]+\/file\?path=/, async (route) => {
      if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/admin/themes/explore?theme=basic", { waitUntil: "domcontentloaded" });
    const rows = page.locator(".theme-explore-file-row button[title]");
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("tab", { name: "HTML" }).click();
    const editor = page.locator(".page-html-source");
    await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("", {
      timeout: 10_000,
    });

    const titles = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
    const css = titles.find((title) => title.endsWith(".css"));
    expect(css).toBeTruthy();
    const cssPath = css!;

    let renamedFrom: string | null = null;
    let renamedTo: string | null = null;
    await page.route(/\/themes\/[^/]+\/file\/rename$/, async (route) => {
      const body = route.request().postDataJSON() as { path: string; name: string };
      renamedFrom = body.path;
      const dir = body.path.slice(0, body.path.lastIndexOf("/") + 1);
      renamedTo = dir + body.name;
      await route.fulfill({
        json: {
          path: renamedTo,
          group: "style",
          readable: true,
          editable: true,
          resettable: false,
          modified: null,
          renamedFrom: body.path,
        },
      });
    });
    await page.route(/\/workspaces\/[^/]+\/themes\/[^/?]+(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (renamedTo !== null && Array.isArray(json?.files)) {
        json.files = json.files.map((f: { path: string }) => (f.path === renamedFrom ? { ...f, path: renamedTo } : f));
      }
      await route.fulfill({ response, json });
    });

    const fileReads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/file?path=")) fileReads.push(request.url());
    });

    const openedFromValue = await editor.inputValue();
    await page.locator(`.theme-explore-file-row button[title="${cssPath}"]`).click();
    // The click HOLDS the previously-open file's text on screen until the css file's own text lands
    // (same hold this whole spec is regression-testing) — waiting for non-empty alone would pass
    // instantly on the stale held text, so wait for the value to actually change instead.
    await expect(editor).not.toHaveValue(openedFromValue, { timeout: 10_000 });

    const before = await editor.inputValue();
    await page.evaluate(() => {
      const store = window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> };
      store.__switchSamples = [];
      const sample = () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(".page-html-source");
        store.__switchSamples.push({ present: textarea !== null, len: textarea?.value.length ?? 0, readOnly: textarea?.readOnly ?? true });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.locator(`.theme-explore-file-row button[title="${cssPath}"]`).dblclick();
    await page.locator(".theme-explore-rename-input").fill("t91-renamed.css");
    await page.locator(".theme-explore-rename-input").press("Enter");

    await expect(page.locator('.theme-explore-file-row button[title$="t91-renamed.css"]')).toHaveAttribute(
      "aria-current",
      "true",
      { timeout: 10_000 }
    );

    const samples = await page.evaluate(
      () => (window as unknown as { __switchSamples: Array<{ present: boolean; len: number; readOnly: boolean }> }).__switchSamples
    );
    expect(samples.filter((s) => !s.present || s.len === 0 || s.readOnly)).toEqual([]);
    expect(await editor.inputValue()).toBe(before);
    expect(fileReads.some((url) => new URL(url).searchParams.get("path") === renamedTo)).toBe(false);

    await page.unrouteAll();
  });
});
