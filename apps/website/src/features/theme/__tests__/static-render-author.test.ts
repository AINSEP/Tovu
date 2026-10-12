import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { markersOfType } from "@jini-ai/cms/widgets/markers";
import { injectPostAuthor, postAuthorForContentHeader, renderStaticPage } from "../static-render.js";
import { loadTheme } from "../theme.js";

const marker = `<p class="post-author" data-embed-config='{"type":"post-author"}'>fallback</p>`;

test("static author marker escapes the credit, keeps theme attributes, and removes hidden or empty bylines completely", () => {
  assert.equal(injectPostAuthor({ html: marker, post: { author: '<img src=x onerror="bad"> & Writer', showAuthor: true } }),
    '<p class="post-author">By &lt;img src=x onerror=&quot;bad&quot;&gt; &amp; Writer</p>');
  for (const post of [undefined, { author: "Hidden Writer" }, { author: "Hidden Writer", showAuthor: false }, { author: null, showAuthor: true }, { author: " ", showAuthor: true }]) {
    assert.equal(injectPostAuthor({ html: `<main>${marker}<p>Body</p></main>`, post }), "<main><p>Body</p></main>");
  }
  const unrelated = `<div data-embed-config='{"type":"content"}'></div>`;
  assert.equal(injectPostAuthor({ html: unrelated, post: { author: "Writer", showAuthor: true } }), unrelated);
});

test("stock static post templates render one byline when enabled, including catalog reset originals", () => {
  const root = path.resolve(import.meta.dirname, "../../../../../../content/themes");
  for (const directory of ["static", "__original-themes__/static"]) {
    let templates = 0;
    for (const id of fs.readdirSync(path.join(root, directory))) {
      const themeDir = path.join(root, directory, id);
      const pages = path.join(themeDir, "render/pages");
      if (!fs.existsSync(pages)) continue;
      const theme = loadTheme({ themeDir, id, source: "built-in" });
      for (const file of fs.readdirSync(pages).filter(name => /post.*\.html$/.test(name))) {
        templates++;
        const source = fs.readFileSync(path.join(pages, file), "utf8");
        const bylines = markersOfType({ html: source, type: "post-author" }).length +
          markersOfType({ html: source, type: "content" }).reduce((count, content) => count + markersOfType({ html: content.inner, type: "post-author" }).length, 0);
        assert.equal(bylines, 1, `${id}/${file}`);
        const shown = renderStaticPage({ theme, pageId: file.replace(/\.html$/, ""), postAuthor: { author: "Jane & Doe", showAuthor: true } });
        assert.ok(shown?.includes('class="post-author">By Jane &amp; Doe</p>'), `${id}/${file}`);
        const hidden = renderStaticPage({ theme, pageId: file.replace(/\.html$/, ""), postAuthor: { author: "Secret Writer", showAuthor: false } });
        assert.ok(hidden !== null && !hidden.includes("Secret Writer") && !hidden.includes('class="post-author"'), `${id}/${file}`);
      }
    }
    assert.ok(templates >= 8, "stock post templates must be discovered");
  }
});

test("static author token shares the marker's escaping and hidden-credit rule anywhere in the body", () => {
  const html = `<main><span>{{author}}</span>${marker}<footer>{{author}}</footer></main>`;
  const shown = injectPostAuthor({ html, post: { author: '<script> & Writer', showAuthor: true } });
  assert.equal(shown, '<main><span>By &lt;script&gt; &amp; Writer</span><p class="post-author">By &lt;script&gt; &amp; Writer</p><footer>By &lt;script&gt; &amp; Writer</footer></main>');
  for (const post of [undefined, { author: "Secret Writer", showAuthor: false }, { author: " ", showAuthor: true }]) {
    assert.equal(injectPostAuthor({ html, post }), '<main><span></span><footer></footer></main>');
  }
});

test("content-header byline is a span on the date line, never the theme's paragraph", () => {
  // Paired: the same template with and without a nested marker. Both bylines land inside the core
  // header's `.post-meta` line, so both are spans; a `<p>` there took the theme's 18px body text
  // beside the 13px muted date, off its baseline (2026-10-10).
  const post = { id: "post-1", slug: "paris" };
  const content = (inner: string) => `<div data-embed-config='{"type":"content","slug":"paris"}'>${inner}</div>`;
  assert.equal(postAuthorForContentHeader({ html: content(""), post }),
    `<span class="post-author" data-embed-config='{"type":"post-author"}'></span>`);
  assert.equal(postAuthorForContentHeader({ html: content(marker), post }),
    `<span class="post-author" data-embed-config='{"type":"post-author"}'>fallback</span>`);
  assert.equal(injectPostAuthor({ html: postAuthorForContentHeader({ html: content(marker), post }), post: { author: "Annie Lee", showAuthor: true } }),
    '<span class="post-author">By Annie Lee</span>');
  // A byline the theme placed outside the content header owns its own placement: no header credit.
  assert.equal(postAuthorForContentHeader({ html: marker + content(""), post }), "");
});
