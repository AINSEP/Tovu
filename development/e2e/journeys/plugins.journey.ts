// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

import { API, PUBLIC_URL, WS_API, createPublishedPageWithHtml, expect, fetchPublic, test, uniqSlug } from "./_fixtures.js";

/**
 * Site plugin journeys (AW-7): the Tier-1 code-free install path (Testimonials + FAQ sample,
 * preview wording -> install (stays off) -> enable -> FAQ accordion + FAQPage JSON-LD on a public
 * page), a plugin NAME CONFLICT in both places it surfaces (the install preview and the Plugins row
 * detail), and the Tier-2 Content Analyzer's "Analyze now" round trip.
 *
 * Serial: one server per run, so install/enable state carries between these tests. Run order
 * across files is alphabetical with one worker, and `posts.journey.ts` (later) expects the Content
 * Analyzer OFF, so the Tier-2 test turns it back off at the end.
 *
 * Install is from a folder on the server (`TOVU_PLUGIN_LOCAL_INSTALL=1` in the journeys config),
 * given as an absolute path because the site server's cwd is the repo root.
 *
 * Strings: `apps/admin/src/features/plugins/{InstallPluginDialog.tsx,rules.ts,Plugins.tsx}`.
 * Public markup: `apps/website/src/features/theme/entry-list-render.ts`.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SAMPLE_DIR = path.join(REPO_ROOT, "apps/website/src/features/plugin-runtime/samples/testimonials-faq");
const CLASH_DIR = path.join(REPO_ROOT, "development/e2e/fixtures/journeys/plugins/faq-clash");
const SAMPLE_NAME = "Testimonials + FAQ";
const CLASH_NAME = "FAQ Clash";
const CODE_FREE = "This plugin has no code; nothing in it runs on this computer. Turning it on only adds what it declares.";
const PREVIEW_CONFLICT_HEADING = "Already in use in this workspace (other workspaces are checked when you turn it on there):";
const ROW_CONFLICT_HEADING = "Names already in use — turn the other plugin off first:";

async function pluginState(request: APIRequestContext, id: string): Promise<{ enabled: boolean } | undefined> {
  const res = await request.get(`${WS_API}/plugins`);
  expect(res.status()).toBe(200);
  return ((await res.json()).plugins as Array<{ id: string; enabled: boolean }>).find((p) => p.id === id);
}

async function previewFolder(page: Page, folder: string): Promise<ReturnType<Page["getByRole"]>> {
  await page.goto("/admin/plugins?tab=downloaded");
  await page.getByRole("button", { name: "Install plugin" }).click();
  const dialog = page.getByRole("dialog", { name: "Install plugin" });
  await dialog.getByLabel("Folder on this server").fill(folder);
  await dialog.getByRole("button", { name: "Preview plugin" }).click();
  await expect(dialog.getByRole("button", { name: "Install (stays off)" })).toBeVisible();
  return dialog;
}

async function createFaq(request: APIRequestContext, title: string, answer: string, order: number): Promise<void> {
  const created = await request.post(`${API}/entries`, { data: { type: "faq", slug: uniqSlug("faq"), title } });
  expect(created.status(), await created.text()).toBe(201);
  const entry = (await created.json()).entry as { id: string; version: number };
  const updated = await request.put(`${API}/entries/${entry.id}`, {
    data: { fieldsJson: { ext: { site: { answer, order } } }, expectedVersion: entry.version },
  });
  expect(updated.status(), await updated.text()).toBe(200);
  const published = await request.post(`${API}/entries/${entry.id}/lifecycle`, { data: { op: "publish", expectedVersion: entry.version + 1 } });
  expect(published.status(), await published.text()).toBe(200);
}

test.describe.serial("AW-7 Tier 1: Testimonials + FAQ, code-free", () => {
  test("the install preview says no code runs, lists the content types, and installs switched off", { tag: ["@unrun"] }, async ({ page, request }) => {
    const dialog = await previewFolder(page, SAMPLE_DIR);
    await expect(dialog.getByRole("heading", { name: SAMPLE_NAME })).toBeVisible();
    await expect(dialog).toContainText(CODE_FREE);
    await expect(dialog).toContainText(/Content types: .*faq/);
    await expect(dialog).toContainText("It stays off in every workspace until you turn it on.");
    await expect(dialog.locator(".plugin-errors"), "a fresh workspace has no name conflicts").toHaveCount(0);
    await expect(dialog).toHaveScreenshot("plugin-install-preview-tier1.png");
    await dialog.getByRole("button", { name: "Install (stays off)" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await pluginState(request, "testimonials-faq"))?.enabled).toBe(false);
    await expect(page.getByRole("button", { name: `Enable ${SAMPLE_NAME}` })).toBeVisible();
  });

  test("enabling it adds the FAQ type; a page marker renders an accordion with FAQPage JSON-LD", { tag: ["@unrun"] }, async ({ page, request }) => {
    await page.goto("/admin/plugins?tab=downloaded");
    await page.getByRole("button", { name: `Enable ${SAMPLE_NAME}` }).click();
    await expect.poll(async () => (await pluginState(request, "testimonials-faq"))?.enabled).toBe(true);
    await page.goto("/admin/plugins?tab=installed");
    await expect(page.getByRole("listitem", { name: SAMPLE_NAME })).toBeVisible();
    await expect(page).toHaveScreenshot("plugins-installed.png");

    await createFaq(request, "Do you ship abroad?", "Yes, to 40 countries.", 1);
    await createFaq(request, "Can I return items?", "Within 30 days.", 2);
    const pageSlug = uniqSlug("faq-page");
    await createPublishedPageWithHtml(request, {
      title: "FAQ",
      slug: pageSlug,
      html: `<main><h1>FAQ</h1><div data-embed-config='{"type":"collection","typeKey":"faq","layout":"accordion","structuredData":"faq-page","fields":["answer"],"sort":"order"}'></div></main>`,
    });

    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.status).toBe(200);
    const ld = /<script type="application\/ld\+json">([^<]*"FAQPage"[^<]*)<\/script>/.exec(live.html);
    expect(ld, "FAQPage JSON-LD block").not.toBeNull();
    const data = JSON.parse(ld![1]!.replace(/\\u003c/g, "<"));
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity.map((q: { name: string }) => q.name)).toEqual(["Do you ship abroad?", "Can I return items?"]);

    const visitor = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();
    await v.goto(`${PUBLIC_URL}/${pageSlug}`);
    const items = v.locator("div.entry-list--faq.entry-list--accordion details.entry-accordion__item");
    await expect(items).toHaveCount(2);
    await expect(items.first().locator("summary.entry-accordion__question")).toHaveText("Do you ship abroad?");
    await expect(items.first().getByText("Yes, to 40 countries.")).toBeHidden();
    await items.first().locator("summary").click();
    await expect(items.first()).toHaveAttribute("open", "");
    await expect(items.first().getByText("Yes, to 40 countries.")).toBeVisible();
    await expect(v.locator("div.entry-list--faq")).toHaveScreenshot("public-faq-accordion.png");
    // Keyboard: a summary is focusable and Enter toggles it (no script ships with a Tier-1 plugin).
    await items.nth(1).locator("summary").focus();
    await v.keyboard.press("Enter");
    await expect(items.nth(1)).toHaveAttribute("open", "");
    await visitor.close();
  });

  test("a testimonials carousel is keyboard-scrollable and does not widen the page at phone width", { tag: ["@unrun"] }, async ({ page, request }) => {
    for (let i = 0; i < 4; i++) {
      const created = await request.post(`${API}/entries`, { data: { type: "testimonial", slug: uniqSlug("t"), title: `Customer ${i}` } });
      const entry = (await created.json()).entry as { id: string; version: number };
      await request.put(`${API}/entries/${entry.id}`, { data: { fieldsJson: { ext: { site: { quote: `Quote number ${i} is great.`, order: i } } }, expectedVersion: entry.version } });
      await request.post(`${API}/entries/${entry.id}/lifecycle`, { data: { op: "publish", expectedVersion: entry.version + 1 } });
    }
    const pageSlug = uniqSlug("testimonials-page");
    await createPublishedPageWithHtml(request, {
      title: "Testimonials",
      slug: pageSlug,
      html: `<main><div data-embed-config='{"type":"collection","typeKey":"testimonial","layout":"carousel","fields":["quote"],"sort":"order"}'></div></main>`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PUBLIC_URL}/${pageSlug}`);
    const carousel = page.locator(".entry-list--testimonial.entry-list--carousel[tabindex='0']");
    await expect(carousel).toBeVisible();
    await expect(carousel.locator(".entry-card")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await carousel.focus();
    const before = await carousel.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => carousel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
    await expect(carousel).toHaveScreenshot("public-testimonials-carousel-phone.png");
  });

  test("a second plugin declaring the same 'faq' type is flagged in the install preview", { tag: ["@unrun"] }, async ({ page }) => {
    const dialog = await previewFolder(page, CLASH_DIR);
    await expect(dialog).toContainText(CODE_FREE);
    const conflicts = dialog.locator(".plugin-errors");
    await expect(conflicts).toContainText(PREVIEW_CONFLICT_HEADING);
    await expect(conflicts.getByRole("listitem")).toContainText([/"faq" is already used by Testimonials \+ FAQ\./]);
    await expect(dialog).toHaveScreenshot("plugin-install-preview-conflict.png");
    await dialog.getByRole("button", { name: "Install (stays off)" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the conflicting plugin's row names the clash, and enabling it is refused while the other is on", { tag: ["@unrun"] }, async ({ page, request }) => {
    await page.goto("/admin/plugins?tab=downloaded");
    const row = page.locator(`li.plugin-row[aria-label="${CLASH_NAME}"]`);
    await row.locator(".plugin-row-summary").click();
    await expect(row).toContainText(ROW_CONFLICT_HEADING);
    await expect(row).toContainText(/"faq" is already used by Testimonials \+ FAQ\./);
    await expect(row).toHaveScreenshot("plugin-row-conflict.png");

    const setEnabled = page.waitForResponse((r) => r.request().method() !== "GET" && /\/plugins\/faq-clash/.test(r.url()));
    await page.getByRole("button", { name: `Enable ${CLASH_NAME}` }).click();
    expect((await setEnabled).status()).toBe(409);
    expect((await pluginState(request, "faq-clash"))?.enabled, "a clashing plugin must stay off").toBe(false);
    expect((await pluginState(request, "testimonials-faq"))?.enabled, "the holder is untouched").toBe(true);
    // A readable reason, not a bare code.
    await expect(page.getByText(/already used|turn the other plugin off/i).first()).toBeVisible();
    await expect(page.getByText("PLUGIN_CONFLICT", { exact: true })).toHaveCount(0);
  });
});

test.describe.serial("AW-7 Tier 2: Content Analyzer", () => {
  test("enable, Analyze now on an unsaved draft; disabled under an open card, Analyze now is refused; reopened, the card is gone", { tag: ["@unrun"] }, async ({ page, request, context }) => {
    await page.goto("/admin/plugins?tab=downloaded");
    await page.getByRole("button", { name: "Enable Content Analyzer" }).click();
    await page.goto("/admin/plugins?tab=installed");
    await expect(page.getByRole("listitem", { name: "Content Analyzer" })).toBeVisible();

    await page.goto("/admin/posts");
    await page.getByRole("button", { name: "New Post" }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
    const editorUrl = page.url();
    await page.getByRole("textbox", { name: "Post title" }).fill("A reasonably long title for the analyzer to check");
    await page.locator('[data-agent-element="post-body"] .ProseMirror').click();
    await page.keyboard.type("An unsaved paragraph with enough words to count.");
    const card = page.locator("section.content-analysis");
    let analyzeCalls = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/plugins\/content-analyzer\/preview$/.test(new URL(r.url()).pathname)) analyzeCalls += 1;
    });
    await page.getByRole("button", { name: "Analyze now" }).dblclick();
    await expect(card).toContainText("From your current draft, including unsaved changes.");
    await expect(card).toContainText("out of 100");
    expect(analyzeCalls, "a double click on Analyze now sends one analysis").toBe(1);

    // Disable from a second tab so this editor's card stays mounted: `ContentAnalysisCard` returns
    // null once its plugin list says the analyzer is off, and that list is only re-read on mount
    // (`useFetchQuery`, no focus refetch). The open card is the one place the server's refusal shows.
    const plugins = await context.newPage();
    await plugins.goto("/admin/plugins?tab=installed");
    await plugins.getByRole("button", { name: "Disable Content Analyzer" }).click();
    await expect.poll(async () => (await pluginState(request, "content-analyzer"))?.enabled ?? true).toBe(false);
    await plugins.close();

    await page.getByRole("button", { name: "Analyze now" }).click();
    // `previewPluginRoute` answers 409 PLUGIN_NOT_ENABLED; `describeAnalysisError` words it.
    await expect(card).toContainText("The Content Analyzer plugin is not enabled.");

    // Reopened, the editor reads the plugin list fresh and renders no card at all. Wait for that
    // list first: before it arrives the card is hidden too, which would make this pass vacuously.
    const pluginList = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === `${WS_API}/plugins` && r.ok());
    await page.goto(editorUrl);
    await pluginList;
    await expect(page.getByRole("textbox", { name: "Post title" })).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Analyze now" })).toHaveCount(0);
  });
});
