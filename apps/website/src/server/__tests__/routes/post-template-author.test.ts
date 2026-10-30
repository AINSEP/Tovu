/** Owner dispatch 2026-10-10 (author): static post headers and authored bylines share one credit. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPostRepo, type PublicPostRecord } from "#src/features/post/index";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { renderViaTemplate } from "../../inbound/public-http/routes/site/pages.js";

const marker = `<p class="post-author" data-embed-config='{"type":"post-author"}'>fallback credit</p>`;
const content = `<div data-embed-config='{"type":"content"}'></div>`;

/** Render through the real template pipeline, with an injected in-memory post repository. */
async function render(required: { body: string; author?: string | null; showAuthor?: boolean; partials?: Record<string, string>; preview?: boolean }, optional: { otherPost?: Partial<PublicPostRecord> } = {}): Promise<string> {
  const deps = createRouteDeps();
  const post: PublicPostRecord = buildPostRecord({
    workspaceId: deps.workspaceId, title: "Paris event tips", author: required.author === undefined ? "Annie Lee" : required.author,
    showAuthor: required.showAuthor ?? true,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Post body" }] }] },
  });
  const posts = [post];
  if (optional.otherPost) posts.push(buildPostRecord({ ...optional.otherPost, workspaceId: deps.workspaceId }));
  deps.postRepo = new InMemoryPostRepo(posts);
  const theme: DiscoveredTheme = {
    manifest: { id: "author-test", name: "Author test", version: "1.0.0", tier: "static", engine: 1, templates: ["post.html"] },
    dir: "/nonexistent/author-test", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { post: `<html><head><title>{{title}}</title><link rel="stylesheet" href="../css/styles.css" /></head><body>${required.body}</body></html>` },
    partials: required.partials ?? {}, css: "", source: "site", status: "valid", errors: [],
  };
  return renderViaTemplate(deps, theme, post, undefined, required.preview ? post.bodyJson : undefined);
}

for (const [name, body, partials] of [
  ["core header", content, {}],
  ["author marker", marker + content, {}],
  ["author token in the body", `<aside>{{author}}</aside>${content}`, {}],
  ["author marker in a partial", `<div data-embed-config='{"type":"partial","id":"nav"}'></div>${content}`, { nav: marker }],
  ["author token in a partial", `<div data-embed-config='{"type":"partial","id":"nav"}'></div>${content}`, { nav: "<aside>{{author}}</aside>" }],
  ["author token inside the content header", `<div data-embed-config='{"type":"content"}'>{{author}}</div>`, {}],
  ["explicit byline inside the content header", `<div data-embed-config='{"type":"content"}'>${marker}</div>`, {}],
] as const) {
  test(`author: ${name} renders one escaped credit and removes hidden/empty credits`, async () => {
    // Paired control: removing the authored placement must retain the same single core credit.
    // This also pins the original missing-header bug for marker templates that previously worked.
    const automatic = await render({ body: content });
    assert.equal(automatic.split("By Annie Lee").length - 1, 1, automatic);
    const shown = await render({ body, partials });
    assert.equal(shown.split("By Annie Lee").length - 1, 1, shown);
    assert.doesNotMatch(shown, /fallback credit|\{\{author\}\}/);
    if (name === "core header" || name.includes("inside the content header")) {
      // The credit is the date line's next item, a `span` inside `.post-meta`, so it takes the theme's
      // date typography instead of body text (2026-10-10). A theme's nested `<p>` marker is re-tagged
      // as a span too: as a `<p>` it took the theme's 18px body text, off the 13px date's baseline.
      assert.match(shown, /<div class="post-detail-header">[\s\S]*?<div class="post-meta"><time [^>]*>[^<]*<\/time><span data-post-author-separator="" class="post-author"> · By Annie Lee<\/span><\/div>[\s\S]*?<div class="post-detail-body">/);
      assert.doesNotMatch(shown, /<p class="post-author"/);
    } else {
      const header = /<div class="post-detail-header">([\s\S]*?)<\/div>\s*<div class="post-detail-body">/.exec(shown);
      assert.ok(header);
      assert.doesNotMatch(header[1], /By Annie Lee/);
    }
    for (const credit of [{ author: "Secret Annie", showAuthor: false }, { author: " ", showAuthor: true }, { author: null, showAuthor: true }]) {
      const hidden = await render({ body, partials, ...credit });
      assert.doesNotMatch(hidden, /Secret Annie|By | · |fallback credit|\{\{author\}\}/, hidden);
    }
    const escaped = await render({ body, partials, author: '<img src=x onerror="bad"> & Writer' });
    assert.equal(escaped.split("By &lt;img src=x onerror=&quot;bad&quot;&gt; &amp; Writer").length - 1, 1, escaped);
    assert.doesNotMatch(escaped, /<img src=x/);
  });
}

test("author: a pending post preview uses the same header credit and hidden-credit rule", async () => {
  const shown = await render({ body: content, preview: true });
  assert.equal(shown.split("By Annie Lee").length - 1, 1, shown);
  const hidden = await render({ body: content, preview: true, author: "Secret Annie", showAuthor: false });
  assert.doesNotMatch(hidden, /Secret Annie|By /);
});


test("author: both Starter post templates and reset originals place exactly one byline under the date", async () => {
  const root = path.resolve(import.meta.dirname, "../../../../../..");
  for (const directory of ["static", "__original-themes__/static"]) {
    const theme = loadTheme({ themeDir: path.join(root, "content/themes", directory, "tovu-starter"), id: "tovu-starter", source: "built-in" });
    assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
    for (const templateChoice of ["posts-default.html", "posts-sidebar.html"]) {
      const deps = createRouteDeps();
      const post = buildPostRecord({ workspaceId: deps.workspaceId, templateChoice, author: "Annie Lee", showAuthor: true });
      deps.postRepo = new InMemoryPostRepo([post]);
      const shown = await renderViaTemplate(deps, theme, post, undefined);
      assert.equal(shown.split("By Annie Lee").length - 1, 1, `${directory}/${templateChoice}`);
      assert.match(shown, /<div class="post-detail-header">[\s\S]*?<div class="post-meta"><time [^>]*>[^<]*<\/time><span data-post-author-separator="" class="post-author"> · By Annie Lee<\/span><\/div>[\s\S]*?<div class="post-detail-body">/);
      assert.doesNotMatch(shown, /<p class="post-author"/);
      const hidden = { ...post, author: "Secret Annie", showAuthor: false };
      await deps.postRepo.save(hidden);
      const hiddenHtml = await renderViaTemplate(deps, theme, hidden, undefined);
      assert.doesNotMatch(hiddenHtml, /Secret Annie|By Annie Lee|class="post-author"|data-post-author-separator/);
    }
  }
});

test("author: header opt-out and another embedded post do not inherit the current post's credit", async () => {
  const automatic = await render({ body: content });
  assert.equal(automatic.split("By Annie Lee").length - 1, 1, automatic);
  const noHeader = await render({ body: `<div data-embed-config='{"type":"content","header":false}'></div>` });
  assert.doesNotMatch(noHeader, /post-detail-header|By Annie Lee/);
  const shown = await render({ body: `<div data-embed-config='{"type":"content","slug":"hello-world"}'></div><section id="other"><div data-embed-config='{"type":"content","id":"post-2"}'></div></section>` },
    { otherPost: { id: "post-2", slug: "other-post", title: "Other post", author: "Other Writer", showAuthor: true } });
  assert.equal(shown.split("By Annie Lee").length - 1, 1, shown);
  const other = /<section id="other">([\s\S]*?)<\/section>/.exec(shown);
  assert.ok(other);
  assert.match(other[1], /Other post/);
  assert.doesNotMatch(other[1], /Annie Lee|Other Writer|post-author/);
});


test("author: token-shaped saved credit stays literal through the whole template pipeline", async () => {
  for (const body of [content, `<aside>{{author}}</aside>${content}`, `<div data-embed-config='{"type":"content"}'>${marker}</div>`]) {
    const shown = await render({ body, author: "Annie {{author}} & Lee" });
    assert.equal(shown.split("By Annie {{author}} &amp; Lee").length - 1, 1, shown);
    assert.doesNotMatch(shown, /By Annie By Annie/);
  }
});
