import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadTheme } from "#src/features/theme/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { injectPostAuthor } from "#src/features/theme/static-render";
import { renderHtmlPageBody, renderSite } from "../render.js";

const root = path.resolve(import.meta.dirname, "../../../../../../../../../");
const credit = '<script>alert("credit")</script> & Writer';

for (const id of ["storefront", "fashion-modern"]) {
  test(`${id}: the stock Liquid post byline renders escaped credit only when opted in`, async () => {
    const theme = loadTheme({ themeDir: path.join(root, "content/themes/templated", id), id, source: "built-in" });
    assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
    const post = buildPostRecord({ author: credit, showAuthor: true });
    const shown = await renderSite({ theme, route: "post", siteTitle: "Author test", posts: [post], post });
    assert.ok(shown.includes('By &lt;script&gt;alert(&#34;credit&#34;)&lt;/script&gt; &amp; Writer'), shown);
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
  // The byline is the date line's next item (a span inside `.entry-meta`), not a `<p>` of its own
  // that takes body-text size under the small muted date (2026-10-11).
  assert.match(shown, /<p class="entry-meta">[^<]+ · <span class="post-author">By &lt;script&gt;[^<]*<\/span><\/p>/, shown);
  assert.ok(!shown.includes('<p class="post-author"'), shown);
  const hidden = await renderSite({ theme: null, route: "post", siteTitle: "Author test", posts: [], post: { ...post, showAuthor: false } });
  assert.ok(!hidden.includes("Writer") && !hidden.includes('post-author'), hidden);
});

test("postpolish: static content headers have exactly date · By author and no orphan separator", () => {
  const author = { id: "author-post", slug: "author-post", author: "Jane & Doe", showAuthor: true };
  const shell = `<main data-embed-config='{"type":"content","id":"author-post"}'></main>`;
  const resolved = (updatedAt: string) => new Map([["content" as const, new Map([[author.id, { componentId: "post-content", props: {
    title: "Title", bodyJson: { type: "doc", content: [] }, updatedAt,
  } }]])]]);
  const render = (post = author, html = shell, date = "2026-10-11T12:00:00Z") => injectPostAuthor({ html: renderHtmlPageBody(html, resolved(date), { postAuthor: post }), post });
  assert.ok(render().includes('<time datetime="2026-10-11T12:00:00Z">Oct 11, 2026</time><span data-post-author-separator="" class="post-author"> · By Jane &amp; Doe</span>'));
  assert.equal((render().match(/ · /g) ?? []).length, 1);
  assert.ok(!render({ ...author, showAuthor: false }).includes(" · "));
  assert.ok(!render({ ...author, author: " " }).includes(" · "));
  const noDate = render(author, shell, "");
  assert.ok(noDate.includes('>By Jane &amp; Doe</span>'));
  assert.ok(!noDate.includes(" · "));
  assert.ok(!render(author, shell.replace('"id":"author-post"', '"id":"author-post","header":false')).includes(" · "));
  const nested = shell.replace('</main>', `<p class="custom-credit" data-embed-config='{"type":"post-author"}'></p></main>`);
  assert.ok(render(author, nested).includes('class="custom-credit"> · By Jane &amp; Doe</span>'));
});

test("postpolish: a bare post with no display date has a credit with no dot", async () => {
  const post = buildPostRecord({ updatedAt: "", author: "Jane", showAuthor: true });
  const html = await renderSite({ theme: null, route: "post", siteTitle: "Site", posts: [], post });
  assert.ok(html.includes('<p class="entry-meta"><span class="post-author">By Jane</span></p>'));
});
