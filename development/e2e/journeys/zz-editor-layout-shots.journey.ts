// SCRATCH (editor-layout lane, 2026-10-13): before/after captures; deleted before commit.
import { readFileSync, writeFileSync } from "node:fs";
import { WS_API, createPublishedPageWithHtml, expect, test } from "./_fixtures.js";

const DIR = process.env.SHOT_DIR!;
const TAG = process.env.SHOT_TAG ?? "x";
const INJECT = process.env.SHOT_CSS;
const SIZES = [[375, 667], [834, 1112], [1280, 900]] as const;

test("editor layout shots", async ({ page, request }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const pg = await createPublishedPageWithHtml(request, { title: "Shots page", slug: `shots-page-${stamp}`,
    html: "<main><h1>Shots page</h1><p>Body text for the preview.</p></main>" });
  const postRes = await request.post(`${WS_API}/posts`, { data: {
    title: "The Rise and Resilience of the LA Tech Ecosystem", slug: `the-rise-and-resilience-${stamp}`, status: "published",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
  } });
  expect(postRes.ok(), await postRes.text()).toBe(true);
  const post = (await postRes.json()).post;
  const menuRes = await request.post(`${WS_API}/menus`, { data: { title: "Header nav", slug: `shots-menu-${stamp}`, items: [] } });
  expect(menuRes.ok(), await menuRes.text()).toBe(true);
  const menu = (await menuRes.json()).menu;
  const metrics: Record<string, unknown> = {};
  const measure = (sel: string[]) => page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s);
    if (!el) return [s, null];
    const r = el.getBoundingClientRect();
    return [s, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }];
  })), sel);
  const inject = async () => { if (INJECT) await page.addStyleTag({ content: readFileSync(INJECT, "utf8") }); await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0); };
  try {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      // 1. Menu editor back control
      await page.goto(`/admin/menus/${menu.id}`);
      await expect(page.getByRole("heading", { name: "Edit menu", exact: true })).toBeVisible();
      await inject();
      metrics[`menu-${w}`] = await measure([".page-header-lead > a", ".page-header-text .page-title", ".page-header-text .page-kicker"]);
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-menu.png` });
      // 2. Page editor preview
      await page.goto(`/admin/pages/${encodeURIComponent(pg.slug)}`);
      const ptab = page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true });
      await ptab.click();
      await expect(page.locator(".page-preview-fab")).toBeVisible();
      await inject();
      await page.waitForTimeout(800);
      metrics[`page-${w}`] = await measure([".editor-action-row", ".editor-action-row .btn-danger", ".page-preview-fab", ".page-preview-frame"]);
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-page.png` });
      // 3. Post editor preview
      await page.goto(`/admin/posts/${post.id}`);
      const otab = page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true });
      await otab.click();
      await expect(page.locator(".post-preview-fab")).toBeVisible();
      await inject();
      await page.waitForTimeout(800);
      metrics[`post-${w}`] = await measure([".editor-action-row", ".post-settings-trigger", ".post-preview-fab", ".post-preview-surface .page-preview-frame"]);
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-post.png` });
      // 4. Site key
      await page.goto("/admin/access-tokens?tab=site-key");
      const card = page.locator(".site-key-status-card");
      await expect(card).toBeVisible();
      await inject();
      metrics[`sitekey-${w}`] = await measure([".site-key-status-card", ".site-key-status-badge-row", ".site-key-fingerprint-group", ".site-key-fingerprint"]);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-sitekey.png` });
    }
    // Expanded states at phone width (way out must stay visible).
    await page.setViewportSize({ width: 375, height: 667 });
    // Draft page (wider action group) + other back-control headers.
    const draft = await request.post(`${WS_API}/pages`, { data: { title: "Draft shots", slug: `draft-shots-${stamp}`, status: "draft" } });
    const draftPage = (await draft.json()).post;
    await page.goto(`/admin/pages/${encodeURIComponent(draftPage.slug)}`);
    await page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true }).click();
    await inject(); await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/${TAG}-375-page-draft.png` });
    await request.delete(`${WS_API}/pages/${draftPage.id}`);
    await page.request.patch(`${WS_API}/posts/${post.id}`, { data: { status: "draft" } }).catch(() => undefined);
    const formRes = await request.post(`${WS_API}/forms`, { data: { name: "Shots form", slug: `shots-form-${stamp}`, fields: [{ id: "name", label: "Name", type: "text", required: true }] } });
    const form = (await formRes.json()).data;
    await page.goto(`/admin/forms/${form.id}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await inject();
    await page.screenshot({ path: `${DIR}/${TAG}-375-form.png` });
    await request.delete(`${WS_API}/forms/${form.id}`);
    await page.goto("/admin/widgets/regions");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await inject();
    await page.screenshot({ path: `${DIR}/${TAG}-375-widget-regions.png` });
    await page.goto(`/admin/posts/${post.id}`);
    await page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true }).click();
    await inject();
    await page.getByRole("button", { name: "Show full screen" }).click();
    await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
    await page.screenshot({ path: `${DIR}/${TAG}-375-post-expanded.png` });
    await page.goto(`/admin/pages/${encodeURIComponent(pg.slug)}`);
    await page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true }).click();
    await inject();
    await page.getByRole("button", { name: "Show full screen" }).click();
    await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
    await page.screenshot({ path: `${DIR}/${TAG}-375-page-expanded.png` });
    // Scrolled phone page editor: sticky row + control together
    await page.getByRole("button", { name: "Exit full screen" }).click();
    for (const dy of [300, 30]) {
      await page.evaluate((d) => document.querySelector(".admin-content")?.scrollBy(0, d), dy);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${TAG}-375-page-scrolled-${dy}.png` });
    }
    await page.goto(`/admin/posts/${post.id}`);
    await page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: "Preview", exact: true }).click();
    await inject();
    for (const dy of [280, 30]) {
      await page.evaluate((d) => document.querySelector(".admin-content")?.scrollBy(0, d), dy);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${TAG}-375-post-scrolled-${dy}.png` });
    }
  } finally {
    writeFileSync(`${DIR}/${TAG}-metrics.json`, JSON.stringify(metrics, null, 1));
    await request.delete(`${WS_API}/pages/${pg.id}`);
    await request.delete(`${WS_API}/posts/${post.id}`);
    await request.delete(`${WS_API}/menus/${menu.id}`);
  }
});
