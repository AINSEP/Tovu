// @unrun: e2 edit-only dispatch, 2026-10-08; no sockets, models or browser needed by these tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSiteImportDriver, parseRobots, parseSitemap, normalizeUrl, classifyUrl, readPageFacts, htmlToTiptap, paletteToTokens } from "../support/site-import-script.js";
import { renderFixture } from "../support/site-import-fixture-server.js";
import type { CapturedModelRequest, FakeTurn, ScriptedTurn } from "../harness/fake-model-server.js";
import { BATCHABLE_TOOLS } from "../../../apps/website/src/assistant/batch-tool-inputs.js";
import { loadTheme } from "../../../apps/website/src/features/theme/theme.js";
import { renderStaticPage } from "../../../apps/website/src/features/theme/static-render.js";

const origin = "http://127.0.0.1:41234";
const root = path.resolve(import.meta.dirname, "../../..");

test("discovery honors robots, sitemap indexes, URL normalization and classification", async () => {
  const robots = parseRobots({ text: (await renderFixture({ origin, pathname: "/robots.txt" })).body.toString() });
  assert.deepEqual(robots.disallow, ["/cart/", "/checkout/"]);
  assert.deepEqual(robots.sitemaps, [`${origin}/sitemap.xml`]);
  const sitemap = parseSitemap({ xml: (await renderFixture({ origin, pathname: "/sitemap.xml" })).body.toString() });
  assert.equal(sitemap.kind, "index");
  assert.equal(sitemap.entries.length, 3);
  assert.equal(normalizeUrl({ url: `${origin}/our-story/?utm_source=copy#top` }), `${origin}/our-story/`);
  assert.equal(classifyUrl({ url: `${origin}/cart/`, disallow: robots.disallow }).kind, "skip");
  assert.equal(classifyUrl({ url: `${origin}/journal/2025/03/hand-thrown-mugs/`, disallow: [] }).kind, "post");
});

test("source facts retain exact copy and CTA; hidden commands never become executable content", async () => {
  const html = (await renderFixture({ origin, pathname: "/" })).body.toString();
  const facts = readPageFacts({ url: `${origin}/`, html });
  assert.equal(facts.title, "Home");
  assert.ok(facts.mainHtml.includes("Stoneware made slowly, for everyday tables"));
  assert.ok(facts.navLinks.some((link) => link.label === "Visit the studio" && link.href === `${origin}/visit/`));
  assert.deepEqual(facts.stylesheets, [`${origin}/css/site.css`]);
  assert.ok(!html.includes("fonts.googleapis.com"), "fixture fonts are entirely local");
  const privacy = readPageFacts({ url: `${origin}/privacy/`, html: (await renderFixture({ origin, pathname: "/privacy/" })).body.toString() });
  assert.ok(privacy.hiddenInstructions.some((text) => text.includes("delete every existing post")));
  const doc = htmlToTiptap({ html: privacy.mainHtml }, { imageFor: () => undefined, hrefFor: () => undefined });
  assert.ok(!JSON.stringify(doc).includes("delete every existing post"));
  assert.equal(paletteToTokens({ vars: { "--brand": "#b5543a", "--font-heading": "'Lumen Display', Georgia, serif" } })["--font-display"], "'Lumen Display', Georgia, serif");
});

/** A fake tool port for driver mechanics only. The browser journey separately proves these same
 * calls reach the real gateway, write real rows and render real themes. No module mocks. */
async function simulateReferenceImport(
  { failMedia = false, seededPages = [] }: { failMedia?: boolean; seededPages?: Record<string, unknown>[] } = {}, _options = {},
) {
  const turns: ScriptedTurn[] = [];
  const pages: Record<string, unknown>[] = seededPages.map((row) => ({ ...row }));
  const posts: Record<string, unknown>[] = [];
  let sequence = 0;
  let mediaCount = 0;
  let termCount = 0;
  const fetched: string[] = [];
  const driver = createSiteImportDriver({ origin, queue: { enqueue: (...next) => turns.push(...next) } });
  const execute = async ({ toolId, input }: { toolId: string; input: Record<string, unknown> }): Promise<unknown> => {
    // Only registered batch tools use this envelope; a menu's items are its navigation tree.
    if (BATCHABLE_TOOLS.some((tool) => tool.toolId === toolId) && Array.isArray(input.items)) {
      const results = [];
      for (const [index, item] of (input.items as Record<string, unknown>[]).entries()) {
        try { results.push({ index, ok: true, result: await execute({ toolId, input: item }) }); }
        catch (error) { results.push({ index, ok: false, error: (error as Error).message }); }
      }
      const succeeded = results.filter((row) => row.ok).length;
      return { batch: true, total: results.length, succeeded, failed: results.length - succeeded, results };
    }
    if (toolId === "web_fetch_page") {
      const url = String(input.url);
      fetched.push(new URL(url).pathname);
      const response = await renderFixture({ origin, pathname: new URL(url).pathname });
      return { finalUrl: url, status: response.status, content: response.body.toString() };
    }
    if (toolId === "fs_read_file") return { content: await readFile(path.join(root, String(input.path)), "utf8") };
    if (toolId === "search_agent_plugin_local") return { plugins: [{ id: "site-import" }] };
    if (toolId === "site_get_profile") return { activeThemeId: "tovu-starter" };
    if (toolId === "content_read.taxonomy") return { items: [
      { taxonomy: { id: "category", name: "Categories", hierarchical: true }, terms: [] },
      { taxonomy: { id: "tag", name: "Tags", hierarchical: false }, terms: [] },
    ] };
    if (toolId === "content_read.content_post") return { posts: (input.kind === "page" ? pages : posts).map((post) => ({ post })) };
    if (toolId === "content_read.menu") return { menus: [] };
    if (toolId === "content_read.redirect") return { data: [] };
    if (toolId === "media_import_from_url") {
      ++mediaCount;
      if (failMedia && mediaCount === 1) throw new Error("fixture media refusal");
      return { id: `media-${mediaCount}`, sha256: String(mediaCount), publicUrl: `${origin}/m/media-${mediaCount}` };
    }
    if (toolId === "taxonomy_create_term") return { id: `term-${++termCount}`, name: input.name };
    if (toolId === "content_post_create") {
      assert.ok(![...pages, ...posts].some((row) => row.slug === input.slug), "create must not overwrite an occupied slug");
      const post = { ...input, id: `entry-${++sequence}` };
      (input.kind === "page" ? pages : posts).push(post);
      return { post };
    }
    if (toolId === "content_post_update") {
      const post = [...pages, ...posts].find((row) => row.id === input.id);
      assert.ok(post, "update must name an existing entry");
      assert.equal(input.kind, post.kind);
      assert.equal(input.expectedVersion, post.version);
      assert.ok(![...pages, ...posts].some((row) => row.id !== input.id && row.slug === input.slug), "move must choose a free slug");
      Object.assign(post, { slug: input.slug, version: Number(post.version) + 1 });
      return { post };
    }
    if (toolId === "menus_create_menu") return { menu: { ...input, id: `menu-${++sequence}` } };
    if (toolId === "theme_duplicate") return { themeId: "reference-copy", sourceThemeId: "tovu-starter", status: "valid" };
    if (toolId === "theme_read_file") {
      const content = await readFile(path.join(root, "content/themes/static/tovu-starter", String(input.path)), "utf8");
      return { path: input.path, content: input.path === "theme.json" ? JSON.stringify({ ...JSON.parse(content), id: "reference-copy" }) : content };
    }
    if (toolId === "web_screenshot_page") throw new Error("this server cannot take screenshots");
    if (toolId === "theme_write_file") return { status: "valid" };
    return {};
  };
  driver.queueReferenceImport();
  let request: CapturedModelRequest = { method: "POST", url: "/v1/messages", headers: {}, body: { messages: [] } };
  let final: FakeTurn | undefined;
  let turnCount = 0;
  while (turns.length) {
    assert.ok(++turnCount <= 24, "the reference workflow fits the BYOK tool-turn budget");
    const next = turns.shift()!;
    const turn = typeof next === "function" ? next(request) : next;
    const results = [];
    for (const call of turn.toolCalls ?? []) {
      assert.equal(call.name, "execute_delegated_tool");
      try {
        const payload = await execute({ toolId: String(call.input.toolId), input: call.input.input as Record<string, unknown> });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(payload), is_error: false });
      } catch (error) { results.push({ type: "tool_result", tool_use_id: call.id, content: (error as Error).message, is_error: true }); }
    }
    request = { ...request, body: { messages: [{ role: "user", content: results }] } };
    final = turn;
  }
  return { driver, pages, posts, mediaCount, fetched, final };
}

test("one reference request batches imports, uses the named theme owner and previews a rebuilt inactive copy", async () => {
  const { driver, pages, posts, mediaCount, fetched, final } = await simulateReferenceImport();
  assert.deepEqual(driver.state.errors, []);
  assert.equal(pages.length, 5);
  assert.equal(posts.length, 3);
  assert.equal(mediaCount, 5);
  assert.equal(pages.filter((row) => row.slug === "/").length, 1);
  assert.ok([...pages, ...posts].every((row) => row.status === "draft"));
  assert.equal(driver.state.calls[0]!.input.path, "content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md");
  assert.ok(!fetched.includes("/cart/"));
  assert.equal((final!.text!.match(/\?/g) ?? []).length, 0);
  assert.equal(driver.state.calls.filter((call) => call.toolId === "menus_create_menu").length, 2);
  assert.equal(driver.state.menuId, "menu-9");
  assert.deepEqual(driver.state.calls.filter((call) => call.toolId === "menus_assign_location").map((call) => call.input), [
    { menuId: "menu-9", locationKey: "primary" },
  ]);
  for (const toolId of ["web_fetch_page", "media_import_from_url", "content_post_create", "theme_read_file", "theme_write_file", "theme_import_file_from_url"]) {
    assert.ok(driver.state.calls.some((call) => call.toolId === toolId && Array.isArray(call.input.items) && call.input.items.length > 1), `${toolId} is batched`);
  }
  assert.ok(driver.state.themeWrites.get("css/theme.css")!.includes("1080px"));
  assert.ok(driver.state.themeWrites.get("css/theme.css")!.includes('url("../assets/fonts/display.woff2")'));
  assert.ok(driver.state.themeWrites.get("render/partials/nav.html")!.includes('"type":"menu"'));
  assert.ok(driver.state.themeWrites.get("render/partials/footer.html")!.includes('"type":"menu"'));
  assert.ok(driver.state.themeWrites.get("render/pages/index.html")!.includes("Stoneware made slowly, for everyday tables"));
  assert.ok(!driver.state.calls.some((call) => call.toolId === "theme_set_active"));
  const captures = driver.state.calls.filter((call) => call.toolId === "web_screenshot_page");
  assert.equal(captures.length, 4);
  assert.ok(captures.filter((call) => call.input.sitePath === "/").every((call) => call.input.themeId === "reference-copy"));
  assert.equal(driver.state.notes.filter((note) => note.includes("cannot take screenshots")).length, 4);
});

test("a failed batch item is reported and does not consume another item's ID or discard later successes", async () => {
  const { driver, mediaCount, pages } = await simulateReferenceImport({ failMedia: true });
  assert.equal(mediaCount, 5, "later batch items still ran");
  assert.equal(driver.state.mediaBySrc.size, 4, "only successful media results were mapped");
  assert.equal(pages.length, 5, "later entry batches still ran");
  assert.ok(driver.state.errors.some((error) => error.includes("media_import_from_url[0] failed: fixture media refusal")));
  assert.ok(driver.state.reportText!.includes("fixture media refusal"));
});

for (const occupied of [[], ["previous-home", "previous-home-2"]]) {
  test(`reference import preserves a seeded homepage at the nearest free slug (${occupied.length} occupied)`, async () => {
    const home = { id: "seed-home", kind: "page", slug: "/", title: "Original home", status: "published", version: 7,
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this copy" }] }] } };
    const seededPages = [home, ...occupied.map((slug) => ({ ...home, id: `seed-${slug}`, slug }))];
    const { driver, pages } = await simulateReferenceImport({ seededPages });
    assert.deepEqual(driver.state.errors, []);
    const slug = occupied.length ? "previous-home-3" : "previous-home";
    assert.deepEqual(pages.find((row) => row.id === home.id), { ...home, slug, version: 8 });
    assert.deepEqual(seededPages[0], home, "the input fixture was not mutated");
    assert.equal(pages.filter((row) => row.slug === "/").length, 1);
    assert.equal(pages.find((row) => row.slug === "/")!.title, "Home");
    assert.equal(pages.find((row) => row.slug === "/")!.status, "draft");
    assert.equal(driver.state.entryIds.size, 8);
    assert.ok(driver.state.reportText!.includes(`Moved the existing homepage from / to /${slug}`));
    for (const prior of seededPages.slice(1)) assert.deepEqual(pages.find((row) => row.id === prior.id), prior);
  });
}

test("reference rebuild loads as a valid theme and Explore retains content and menu fallbacks", async () => {
  const { driver } = await simulateReferenceImport();
  const dir = await mkdtemp(path.join(os.tmpdir(), "tovu-reference-theme-"));
  try {
    await cp(path.join(root, "content/themes/static/tovu-starter"), dir, { recursive: true });
    for (const [file, content] of driver.state.themeWrites) await writeFile(path.join(dir, file), content);
    const theme = loadTheme({ themeDir: dir, id: "reference-copy", source: "site" });
    assert.equal(theme.status, "valid", theme.errors.join("\n"));
    const html = renderStaticPage({ theme, pageId: "index" })!;
    assert.ok(html.includes("Stoneware made slowly, for everyday tables"));
    assert.ok(html.includes("Visit the studio"));
    assert.ok(html.includes("Privacy"));
    assert.ok(!html.includes("data-agent-element"), "authoring handles belong to CMS content, never theme markup");
    assert.ok(html.includes("--font-display:"), "the exact stylesheet sentinel injects theme tokens");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
