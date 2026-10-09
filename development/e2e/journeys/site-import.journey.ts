// @unrun: e2 edit-only dispatch, 2026-10-08; coordinator owns execution.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page, APIRequestContext } from "@playwright/test";
import { test as base, expect, requestApi, configureScriptedByok, WS_API } from "../support/release-0113-fixtures.js";
import { startSiteImportFixtureServer, type SiteImportFixtureServer } from "../support/site-import-fixture-server.js";
import { createSiteImportDriver, findAll, type RecordedCall } from "../support/site-import-script.js";
import { startFakeModelServer } from "../harness/fake-model-server.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";
import { journeyJson } from "../support/assistant-journey-state.js";

const test = base.extend<{}, { fixtureSite: SiteImportFixtureServer }>({
  fixtureSite: [async ({}, use) => {
    const source = await startSiteImportFixtureServer();
    try { await use(source); } finally { await source.close(); }
  }, { scope: "worker" }],
  outboundTestOrigins: async ({ fixtureSite }, use) => { await use([fixtureSite.origin]); },
});

/** Observe card creation, including transient cards that disappear before the final assertion. */
async function observeCards({ page }: { page: Page }, _options = {}) {
  await page.addInitScript(() => {
    const state = window as unknown as { importCards: string[] };
    state.importCards = [];
    document.addEventListener("DOMContentLoaded", () => {
      const record = () => {
        for (const node of document.querySelectorAll("[data-mcpui-host]")) {
          const uri = node.getAttribute("aria-label") ?? "";
          if (!state.importCards.includes(uri)) state.importCards.push(uri);
        }
      };
      new MutationObserver(record).observe(document.body, { childList: true, subtree: true });
      record();
    });
  });
}

async function verifyImport(
  { page, request, themeId, siteOrigin }: { page: Page; request: APIRequestContext; themeId: string; siteOrigin: string }, _options = {},
) {
  const api = requestApi({ request });
  const pages = await journeyJson<{ posts: { post: { id: string; slug: string; title: string; status: string } }[] }>({ api, url: `${WS_API}/pages` });
  const home = pages.posts.find(({ post }) => post.slug === "/")?.post;
  expect(home, "the imported homepage occupies /, never /home").toBeDefined();
  expect(home!.title).toBe("Home");
  expect(home!.status).toBe("draft");
  const posts = await journeyJson<{ posts: { post: { slug: string; status: string } }[] }>({ api, url: `${WS_API}/posts` });
  const importedPosts = posts.posts.filter(({ post }) => ["hand-thrown-mugs", "glaze-firing-notes", "new-studio-hours"].includes(post.slug));
  expect(importedPosts).toHaveLength(3);
  for (const { post } of importedPosts) expect(post.status).toBe("draft");
  const menus = await journeyJson<{ menus: { id: string; slug: string; items: { label: string }[] }[] }>({ api, url: `${WS_API}/menus` });
  const header = menus.menus.find((menu) => menu.items.some((item) => item.label === "Our story"));
  const footer = menus.menus.find((menu) => menu.items.some((item) => item.label === "Privacy"));
  expect(header).toBeDefined(); expect(footer).toBeDefined();
  expect(header!.items.map((item) => item.label)).toContain("Visit the studio");
  expect(footer!.items.map((item) => item.label)).toContain("Instagram");
  const detail = await journeyJson<{ status: string }>({ api, url: `${WS_API}/themes/${themeId}` });
  expect(detail.status).toBe("valid");
  const read = async (file: string) => (await journeyJson<{ content: string }>({ api, url: `${WS_API}/themes/${themeId}/file?path=${encodeURIComponent(file)}` })).content;
  const nav = await read("render/partials/nav.html");
  const foot = await read("render/partials/footer.html");
  for (const [source, menu] of [[nav, header!], [foot, footer!]] as const) {
    expect(source).toContain('"type":"menu"');
    expect(source.includes(menu.slug) || source.includes(menu.id), "theme partial references its editable CMS menu").toBe(true);
  }
  const css = await read("css/theme.css");
  const starterCss = await readFile(path.resolve(import.meta.dirname, "../../../content/themes/static/tovu-starter/css/theme.css"), "utf8");
  expect(css).not.toBe(starterCss);
  expect(css).toContain("1080px");
  expect(css).toContain("Lumen Display");
  expect(css).toContain("assets/fonts/display.woff2");

  // Explore renders the inactive copy without activating it or publishing the imported drafts.
  // Compare actual computed layout/font with the starter, not just changed CSS bytes.
  const preview = await page.context().newPage();
  try {
    await preview.goto(`${siteOrigin}/theme-explore/tovu-starter/index`);
    const before = await preview.locator("main").first().evaluate((node) => ({ width: getComputedStyle(node).maxWidth,
      font: getComputedStyle(document.querySelector("h1")!).fontFamily }));
    await preview.goto(`${siteOrigin}/theme-explore/${themeId}/index`);
    await expect(preview.getByRole("heading", { name: "Stoneware made slowly, for everyday tables", exact: true })).toBeVisible();
    const after = await preview.locator("main").first().evaluate((node) => ({ width: getComputedStyle(node).maxWidth,
      font: getComputedStyle(document.querySelector("h1")!).fontFamily }));
    expect(after.width).toBe("1080px");
    expect(after.width).not.toBe(before.width);
    expect(after.font).toContain("Lumen Display");
    expect(after.font).not.toBe(before.font);
    expect(await preview.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Lumen Display"'); })).toBe(true);
    await expect(preview.getByRole("banner").getByRole("link", { name: "Our story", exact: true })).toBeVisible();
    await expect(preview.getByRole("banner").getByRole("link", { name: "Visit the studio", exact: true })).toBeVisible();
    await expect(preview.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  } finally { await preview.close(); }
}

test.describe("0.1.13 A1 local reference site import", { tag: ["@unrun", "@isolated-site"] }, () => {
  test("one casual request imports in batches and rebuilds an inactive theme through tovu-theme", async ({ page, request, fixtureSite, journeySite }) => {
    test.setTimeout(240_000);
    const api = requestApi({ request });
    await journeyJson({ api, url: `${WS_API}/presentation`, method: "PATCH", data: { activeThemeId: "tovu-starter" } });
    const seeded = await journeyJson<{ posts: { post: { id: string; slug: string } }[] }>({ api, url: `${WS_API}/pages` });
    const seededHome = seeded.posts.find(({ post }) => post.slug === "/")?.post;
    expect(seededHome, "exercise the ordinary seeded homepage, rather than an empty-site shortcut").toBeDefined();
    const originalHome = await journeyJson<{ post: { title: string; status: string; bodyJson: unknown; bodyHtml: string | null } }>({ api, url: `${WS_API}/pages/${seededHome!.id}` });
    const fake = await startFakeModelServer("anthropic");
    let restore: (() => Promise<void>) | undefined;
    try {
      restore = await configureScriptedByok({ api, fake });
      const driver = createSiteImportDriver({ origin: fixtureSite.origin, queue: fake });
      driver.queueReferenceImport();
      await observeCards({ page });
      const chat = createAdminChatDriver({ page }, { answerTimeoutMs: 180_000 });
      await chat.open({ navigate: true });
      await chat.newConversation();
      await chat.send({ text: `Can you copy this site for me? ${fixtureSite.origin}/` });
      const answer = await chat.waitForAnswer({ outcome: "succeeded" });
      expect(driver.state.errors, driver.state.errors.join("\n")).toEqual([]);
      const movedHome = await journeyJson<{ post: { slug: string; title: string; status: string; bodyJson: unknown; bodyHtml: string | null } }>({ api, url: `${WS_API}/pages/${seededHome!.id}` });
      expect(movedHome.post.slug).toBe("previous-home");
      for (const field of ["title", "status", "bodyJson", "bodyHtml"] as const) expect(movedHome.post[field], `preserved seeded homepage ${field}`).toEqual(originalHome.post[field]);
      expect(answer.content).toContain("Moved the existing homepage from / to /previous-home");
      expect(fake.remainingTurns()).toBe(0);
      expect(answer.content).toContain("Imported from");
      expect((driver.state.reportText!.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
      const cards = await page.evaluate(() => (window as unknown as { importCards: string[] }).importCards);
      expect(cards.filter((uri) => !uri.includes("ask-choice")), "no per-item approvals, including transient cards").toEqual([]);
      expect(cards.filter((uri) => uri.includes("ask-choice")).length).toBeLessThanOrEqual(1);
      for (const toolId of ["web_fetch_page", "media_import_from_url", "content_post_create", "theme_read_file", "theme_write_file", "theme_import_file_from_url"]) {
        expect(driver.state.calls.some((call) => call.toolId === toolId && Array.isArray(call.input.items) && call.input.items.length > 1), `${toolId} uses one items call per batch`).toBe(true);
      }
      const owner = driver.state.calls.find((call) => call.step === "tovu-theme-owner")!;
      expect(driver.state.results.get(owner.toolUseId)!.raw).toContain("Part C");
      expect(owner.input.path).toBe("content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md");
      const themeId = driver.state.themeCopyId!;
      expect(themeId).not.toBe("tovu-starter");
      for (const viewport of ["desktop", "mobile"]) {
        expect(driver.state.calls.some((call) => call.toolId === "web_screenshot_page" && call.input.sitePath === "/" && call.input.themeId === themeId && call.input.viewport === viewport)).toBe(true);
      }
      expect(driver.state.calls.some((call) => call.toolId === "theme_set_active")).toBe(false);
      expect((await journeyJson<{ settings: { activeThemeId: string } }>({ api, url: `${WS_API}/presentation` })).settings.activeThemeId).toBe("tovu-starter");
      expect(driver.state.mediaBySrc.size).toBe(5);
      expect(driver.state.entryIds.size).toBe(8);
      expect(fixtureSite.requests().some((url) => url.startsWith("/cart/"))).toBe(false);
      await verifyImport({ page, request, themeId, siteOrigin: journeySite.apiURL });
    } finally { try { await restore?.(); } finally { await fake.close(); } }
  });

  test("a real model chooses the import and reference-rebuild skills from the same casual request", { tag: ["@live"] }, async ({ page, request, fixtureSite, journeySite }) => {
    test.setTimeout(12 * 60_000);
    const api = requestApi({ request });
    await journeyJson({ api, url: `${WS_API}/presentation`, method: "PATCH", data: { activeThemeId: "tovu-starter" } });
    const before = await journeyJson<{ availableThemeIds: string[] }>({ api, url: `${WS_API}/presentation` });
    await observeCards({ page });
    const chat = createAdminChatDriver({ page }, { answerTimeoutMs: 10 * 60_000 });
    await chat.open({ navigate: true });
    const conversationId = await chat.newConversation();
    await chat.send({ text: `Can you copy this site for me? ${fixtureSite.origin}/` });
    await chat.waitForAnswer({ outcome: "succeeded" });
    const messages = await journeyJson<{ messages: { role: string; content: string }[] }>({ api, url: `/api/assistant/chats/${conversationId}/messages` });
    const uses = findAll(messages, (row) => row.kind === "tool_use");
    const calls: Pick<RecordedCall, "toolId" | "input">[] = uses.map((row) => {
      const input = (row.input ?? {}) as Record<string, unknown>;
      return { toolId: typeof input.toolId === "string" ? input.toolId : String(row.name), input: (typeof input.toolId === "string" ? input.input : input) as Record<string, unknown> };
    });
    const wire = JSON.stringify(messages);
    expect(wire).toContain("site-import");
    expect(wire.includes("agent_plugin_tovu_theme") || wire.includes("tovu-theme/skills/tovu-theme/SKILL.md")).toBe(true);
    expect(calls.filter((call) => call.toolId === "assistant_ask_choice").length).toBeLessThanOrEqual(1);
    const proseQuestions = messages.messages.filter((message) => message.role === "assistant")
      .reduce((count, message) => count + (message.content.replace(/\]\([^)]*\)/g, "]").match(/\?/g) ?? []).length, 0);
    expect(proseQuestions, "at most one question in assistant prose, excluding markdown URL queries").toBeLessThanOrEqual(1);
    const cards = await page.evaluate(() => (window as unknown as { importCards: string[] }).importCards);
    expect(cards.filter((uri) => !uri.includes("ask-choice"))).toEqual([]);
    expect(cards.filter((uri) => uri.includes("ask-choice")).length).toBeLessThanOrEqual(1);
    for (const toolId of ["web_fetch_page", "media_import_from_url", "content_post_create", "theme_write_file"]) {
      expect(calls.some((call) => call.toolId === toolId && Array.isArray(call.input.items) && call.input.items.length > 1), `${toolId} is batched by the model`).toBe(true);
    }
    const presentation = await journeyJson<{ availableThemeIds: string[]; settings: { activeThemeId: string } }>({ api, url: `${WS_API}/presentation` });
    const copies = presentation.availableThemeIds.filter((id) => !before.availableThemeIds.includes(id));
    // Count only this run's new copies, protecting every theme that existed before the prompt.
    expect(copies).toHaveLength(1);
    expect(presentation.settings.activeThemeId).toBe("tovu-starter");
    expect(calls.some((call) => call.toolId === "web_screenshot_page" && call.input.sitePath === "/" && call.input.themeId === copies[0])).toBe(true);
    await verifyImport({ page, request, themeId: copies[0]!, siteOrigin: journeySite.apiURL });
  });
});
