import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadTheme } from "#src/features/theme/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { renderSite } from "../render.js";

const root = path.resolve(import.meta.dirname, "../../../../../../../../../");
const credit = '<script>alert("credit")</script> & Writer';

for (const id of ["storefront", "fashion-modern"]) {
  test(`${id}: the stock Liquid post byline renders escaped credit only when opted in`, async () => {
    const theme = loadTheme({ themeDir: path.join(root, "content/themes/templated", id), id, source: "built-in" });
    assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
    const post = buildPostRecord({ author: credit, showAuthor: true });
    const shown = await renderSite({ theme, route: "post", siteTitle: "Author test", posts: [post], post });
    assert.ok(shown.includes('By &lt;script&gt;alert(&quot;credit&quot;)&lt;/script&gt; &amp; Writer'), shown);
    assert.ok(!shown.includes(credit));
    const hidden = await renderSite({ theme, route: "post", siteTitle: "Author test", posts: [], post: { ...post, showAuthor: false } });
    assert.ok(!hidden.includes("Writer") && !hidden.includes('post-author'), hidden);
  });
}

test("Handlebars receives the same gated author contract and escapes it with ordinary double braces", async () => {
  const loaded = loadTheme({ themeDir: path.join(root, "development/fixtures/theme-archive/ledger"), id: "ledger", source: "built-in" });
  assert.equal(loaded.status, "valid", JSON.stringify(loaded.errors));
  const theme = { ...loaded, handlebarsTemplates: { ...loaded.handlebarsTemplates,
    entry: '{{#if post.author}}<p class="post-author">By {{post.author}}</p>{{/if}}<div>{{{post.content}}}</div>',
  } };
  const post = buildPostRecord({ author: credit, showAuthor: true });
  const shown = await renderSite({ theme, route: "post", siteTitle: "Author test", posts: [post], post });
  assert.ok(shown.includes("By &lt;script&gt;"), shown);
  assert.ok(!shown.includes(credit));
  const hidden = await renderSite({ theme, route: "post", siteTitle: "Author test", posts: [], post: { ...post, showAuthor: false } });
  assert.ok(!hidden.includes("Writer") && !hidden.includes('post-author'), hidden);
});

test("the bare post renderer also honors the toggle and escapes the author", async () => {
  const post = buildPostRecord({ author: credit, showAuthor: true });
  const shown = await renderSite({ theme: null, route: "post", siteTitle: "Author test", posts: [], post });
  assert.ok(shown.includes('class="post-author">By &lt;script&gt;'), shown);
  const hidden = await renderSite({ theme: null, route: "post", siteTitle: "Author test", posts: [], post: { ...post, showAuthor: false } });
  assert.ok(!hidden.includes("Writer") && !hidden.includes('post-author'), hidden);
});
