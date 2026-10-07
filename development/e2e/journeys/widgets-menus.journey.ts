// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Page } from "@playwright/test";

import { WS_API, createPublishedPageWithHtml, expect, fetchPublic, test, uniq, uniqSlug } from "./_fixtures.js";

/**
 * Widgets + menus journeys (SCOPE.md W7): build a menu in the admin, wrap it in a menu widget,
 * embed both on a published page, and assert the public render. This is the offline version of
 * `ai-menu-widget-embeds.spec.ts`'s live assertions (same `widget widget-menu` / `widget-text`
 * markers, same "no `widget-placeholder`" rule), with every row created through the admin UI or
 * the admin HTTP API instead of a model.
 *
 * Stress: two tabs saving the same menu concurrently. Exactly one save may win; the other must show
 * dedicated conflict copy and keep its unsaved items. Today the editor shows the raw server
 * message from `update-tree.ts`'s 409 (likely bug, tracked in the ideas report); this file
 * asserts the INTENDED copy.
 *
 * Selectors: `apps/admin/src/features/menus/MenuEditor.tsx` ("Menu title", "Menu slug",
 * "+ Add item", "Item label", "Link type", URL placeholder `https://…`, `.save-ok`/`.save-error`).
 */
const MENU_ITEM = new RegExp(`${WS_API}/menus/[^/?]+$`);

interface MenuDto {
  id: string;
  slug: string;
  title: string;
  version: number;
  items: Array<{ label: string }>;
}

async function createMenuApi(request: APIRequestContext, slug: string, labels: string[]): Promise<MenuDto> {
  const res = await request.post(`${WS_API}/menus`, {
    data: {
      title: `Menu ${slug}`,
      slug,
      items: labels.map((label, i) => ({ id: `i${i}`, label, target: { kind: "url", href: `https://example.test/${i}` } })),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).menu;
}

async function readMenuBySlug(request: APIRequestContext, slug: string): Promise<MenuDto> {
  const res = await request.get(`${WS_API}/menus`);
  expect(res.status()).toBe(200);
  const menu = ((await res.json()).menus as MenuDto[]).find((m) => m.slug === slug);
  if (!menu) throw new Error(`menu ${slug} not listed`);
  return menu;
}

async function createWidget(request: APIRequestContext, body: { widgetType: "menu" | "text"; title: string; config: unknown }): Promise<string> {
  const res = await request.post(`${WS_API}/widgets`, { data: body });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).widget.id;
}

async function addUrlItem(page: Page, label: string, href: string): Promise<void> {
  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.getByPlaceholder("Label").last().fill(label);
  await page.getByLabel("Link type").last().selectOption("url");
  await page.getByPlaceholder("https://…").last().fill(href);
}

test.describe("W7 menus and widgets", () => {
  test("build a menu in the admin, wrap it in a menu widget, embed it with a text widget, and both render publicly", { tag: ["@unrun"] }, async ({ page, request }) => {
    const slug = uniqSlug("main-nav");
    await page.goto("/admin/menus");
    await page.getByRole("link", { name: "Add New" }).click();
    await expect(page).toHaveURL(/\/admin\/menus\/new$/);
    await page.getByRole("textbox", { name: "Menu title" }).fill(uniq("Main nav"));
    await page.getByRole("textbox", { name: "Menu slug" }).fill(slug);
    await addUrlItem(page, "Journey Home", "https://example.test/home");
    await addUrlItem(page, "Journey About", "https://example.test/about");
    await page.getByRole("button", { name: "Save" }).click();
    // Creating a menu shows no notice: the editor moves from /new to the saved menu's own URL.
    await expect(page).not.toHaveURL(/\/admin\/menus\/new$/);

    const menu = await readMenuBySlug(request, slug);
    expect(menu.items.map((i) => i.label)).toEqual(["Journey Home", "Journey About"]);
    const menuWidgetId = await createWidget(request, { widgetType: "menu", title: "Journey menu widget", config: { menuRef: menu.id } });
    const textMarker = uniq("TEXT-WIDGET-MARKER");
    const textWidgetId = await createWidget(request, { widgetType: "text", title: "Journey text widget", config: { body: textMarker } });

    const pageSlug = uniqSlug("widgets-page");
    await createPublishedPageWithHtml(request, {
      title: "Widgets page",
      slug: pageSlug,
      html:
        `<main><h1>Widgets</h1>` +
        `<div data-embed-type="widget" data-embed-id="${menuWidgetId}"></div>` +
        `<div data-embed-type="widget" data-embed-id="${textWidgetId}"></div>` +
        `<div data-embed-config='{"type":"menu","id":"${slug}","mode":"html"}'></div></main>`,
    });
    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.status).toBe(200);
    expect(live.html).toMatch(/class="widget widget-menu/);
    expect(live.html).toMatch(/class="widget widget-text/);
    expect(live.html).toContain(textMarker);
    expect(live.html).toContain("Journey Home");
    expect(live.html).toContain('href="https://example.test/about"');
    expect(live.html, "no widget may degrade to the unresolved placeholder").not.toContain("widget-placeholder");

    await page.goto("/admin/widgets");
    await expect(page.getByText("Journey menu widget")).toBeVisible();
    await expect(page).toHaveScreenshot("widgets-library.png", { mask: [page.locator("time, [data-relative-time]")] });
  });

  test("a widget whose id does not exist degrades to the placeholder and never 500s the page", { tag: ["@unrun"] }, async ({ request }) => {
    const pageSlug = uniqSlug("missing-widget");
    await createPublishedPageWithHtml(request, {
      title: "Missing widget",
      slug: pageSlug,
      html: `<main><p>before</p><div data-embed-type="widget" data-embed-id="does-not-exist"></div><p>after</p></main>`,
    });
    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain("before");
    expect(live.html).toContain("after");
    expect(live.html).toContain("widget-placeholder");
  });

  test("menus list and editor baselines", { tag: ["@unrun"] }, async ({ page, request }) => {
    const menu = await createMenuApi(request, uniqSlug("baseline-menu"), ["One", "Two", "Three"]);
    await page.goto("/admin/menus");
    await expect(page.getByText(menu.title)).toBeVisible();
    await expect(page).toHaveScreenshot("menus-list.png", { mask: [page.locator("time, [data-relative-time]")] });
    await page.goto(`/admin/menus/${menu.id}`);
    await expect(page.getByRole("textbox", { name: "Menu title" })).toHaveValue(menu.title);
    await expect(page).toHaveScreenshot("menu-editor.png");
  });
});

test.describe("menus stress", () => {
  test("two tabs save the same menu: exactly one wins, the other shows dedicated conflict copy and keeps its items", { tag: ["@unrun"] }, async ({ page, context, request }) => {
    const slug = uniqSlug("contested-menu");
    const menu = await createMenuApi(request, slug, ["Base item"]);
    await page.goto(`/admin/menus/${menu.id}`);
    const other = await context.newPage();
    await other.goto(`/admin/menus/${menu.id}`);
    await expect(other.getByRole("textbox", { name: "Menu title" })).toHaveValue(menu.title);

    await addUrlItem(page, "From tab A", "https://example.test/a");
    await addUrlItem(other, "From tab B", "https://example.test/b");

    const statuses: number[] = [];
    for (const p of [page, other]) {
      p.on("response", (r) => {
        if (r.request().method() === "PUT" && MENU_ITEM.test(new URL(r.url()).pathname)) statuses.push(r.status());
      });
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok")).toBeVisible();
    await other.getByRole("button", { name: "Save" }).click();

    const error = other.locator(".save-error");
    await expect(error).toBeVisible();
    // INTENDED copy (likely bug today: the raw `MenuConflictError` message is shown).
    await expect(error).toContainText("Someone else changed this while you were editing. Your changes were not saved.");
    await expect(error).not.toContainText(/expected ?version|version mismatch/i);
    await expect(other.getByPlaceholder("Label").last(), "the losing tab keeps its unsaved item").toHaveValue("From tab B");
    expect(statuses.sort()).toEqual([200, 409]);
    const stored = await readMenuBySlug(request, slug);
    expect(stored.items.map((i) => i.label)).toEqual(["Base item", "From tab A"]);
    await other.close();
  });

  test("simultaneous saves from two tabs never both succeed", { tag: ["@unrun"] }, async ({ page, context, request }) => {
    const slug = uniqSlug("race-menu");
    const menu = await createMenuApi(request, slug, ["Base"]);
    await page.goto(`/admin/menus/${menu.id}`);
    const other = await context.newPage();
    await other.goto(`/admin/menus/${menu.id}`);
    await addUrlItem(page, "Race A", "https://example.test/ra");
    await addUrlItem(other, "Race B", "https://example.test/rb");
    const waitPut = (p: Page) => p.waitForResponse((r) => r.request().method() === "PUT" && MENU_ITEM.test(new URL(r.url()).pathname));
    const [a, b] = await Promise.all([
      waitPut(page),
      waitPut(other),
      page.getByRole("button", { name: "Save" }).click(),
      other.getByRole("button", { name: "Save" }).click(),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 409]);
    const stored = await readMenuBySlug(request, slug);
    expect(stored.items).toHaveLength(2);
    await other.close();
  });

  test("double-clicking Save on a new menu creates exactly one menu", { tag: ["@unrun"] }, async ({ page, request }) => {
    const slug = uniqSlug("dbl-menu");
    let creates = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && new RegExp(`${WS_API}/menus$`).test(new URL(r.url()).pathname)) creates += 1;
    });
    await page.goto("/admin/menus/new");
    await page.getByRole("textbox", { name: "Menu title" }).fill("Double save");
    await page.getByRole("textbox", { name: "Menu slug" }).fill(slug);
    await page.getByRole("button", { name: "Save" }).dblclick();
    await expect(page).not.toHaveURL(/\/admin\/menus\/new$/);
    expect(creates).toBe(1);
    const res = await request.get(`${WS_API}/menus`);
    expect(((await res.json()).menus as MenuDto[]).filter((m) => m.slug === slug)).toHaveLength(1);
  });

  test("a javascript: URL item is refused or neutralised in the public render", { tag: ["@unrun"] }, async ({ page, request }) => {
    const slug = uniqSlug("js-menu");
    await page.goto("/admin/menus/new");
    await page.getByRole("textbox", { name: "Menu title" }).fill("JS link");
    await page.getByRole("textbox", { name: "Menu slug" }).fill(slug);
    await addUrlItem(page, "Click me", "javascript:alert(document.cookie)");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".save-ok, .save-error").first()).toBeVisible();
    if (await page.locator(".save-error").isVisible()) return; // refused at save time: the safe outcome
    const pageSlug = uniqSlug("js-menu-page");
    await createPublishedPageWithHtml(request, {
      title: "JS menu",
      slug: pageSlug,
      html: `<div data-embed-config='{"type":"menu","id":"${slug}","mode":"html"}'></div>`,
    });
    const live = await fetchPublic(request, `/${pageSlug}`);
    expect(live.html.toLowerCase()).not.toContain('href="javascript:');
  });
});
