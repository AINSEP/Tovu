import { describe, expect, it } from "vitest";

import { deriveContentWrapperChain } from "../hooks/theme-canvas-wrapper";

/**
 * @file The Interactive tab's canvas used to render a page's content full-bleed, no matter which
 * template the theme wraps it in — see `theme-canvas-wrapper.ts`'s own file header for the live-
 * confirmed shape of what a real template's `{"type":"content"}` marker resolves to. Fixtures below
 * are trimmed straight from `src/themes/static/basic/render/pages/page-shell.html` and
 * `src/themes/static/gracious-timing/render/pages/project.html` (a real theme's shape at the time
 * this test was written; `gracious-timing` itself was removed from the repo 2026-08-31,
 * unconfirmed-license Framer Marketplace derivative) so this covers two structurally different
 * shapes that have existed on disk, not just one theme's convention.
 */

const BASIC_PAGE_SHELL = `<!doctype html>
<html>
<head><title>x</title></head>
<body>
<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>
<main>
  <article class="wrap post-detail" data-reveal>
    <div data-embed-config='{"type":"content"}'></div>
  </article>
</main>
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
</body>
</html>`;

// gracious-timing's project.html: the content marker's article is NOT nested under a <main>, and a
// sibling <section> follows it — a different shape than basic's, on purpose (see file header).
const GRACIOUS_TIMING_PROJECT = `<!doctype html>
<html>
<body>
<article class="post-detail wrap" data-reveal>
  <div data-embed-config='{"type":"content"}'></div>
</article>
<section class="band wrap">static furniture</section>
</body>
</html>`;

describe("deriveContentWrapperChain", () => {
  it("derives basic theme's real ancestor chain: <main>, <article class=... data-reveal>, then the marker's own bare <div>", () => {
    const chain = deriveContentWrapperChain(BASIC_PAGE_SHELL);
    expect(chain).toEqual([
      { tagName: "main", attributes: {} },
      { tagName: "article", attributes: { class: "wrap post-detail", "data-reveal": "" } },
      { tagName: "div", attributes: {} },
    ]);
  });

  it("derives gracious-timing's shallower chain — no <main>, just article then the marker's own bare <div>", () => {
    const chain = deriveContentWrapperChain(GRACIOUS_TIMING_PROJECT);
    expect(chain).toEqual([
      { tagName: "article", attributes: { class: "post-detail wrap", "data-reveal": "" } },
      { tagName: "div", attributes: {} },
    ]);
  });

  it("keeps the marker's own tag as the innermost wrapper level, with data-embed-config stripped", () => {
    // The marker div itself (`<div data-embed-config='{"type":"content"}'>`) survives in the real
    // render as a bare `<div>` — see file header. A derivation that discarded the marker's own tag
    // and started from its PARENT would under-wrap relative to what the page actually publishes.
    const html = `<body><section><div id="content-slot" data-embed-config='{"type":"content"}'></div></section></body>`;
    const chain = deriveContentWrapperChain(html);
    expect(chain).toEqual([
      { tagName: "section", attributes: {} },
      { tagName: "div", attributes: { id: "content-slot" } },
    ]);
  });

  it("returns null when the template has no content marker at all", () => {
    const html = `<body><main><div data-embed-config='{"type":"partial","id":"nav"}'></div></main></body>`;
    expect(deriveContentWrapperChain(html)).toBeNull();
  });

  it("returns null for a template with no data-embed-config anywhere", () => {
    expect(deriveContentWrapperChain(`<body><main><p>static</p></main></body>`)).toBeNull();
  });

  it("ignores markers of a different type and finds the real content marker among them", () => {
    const html = `<body>
      <div data-embed-config='{"type":"partial","id":"nav"}'></div>
      <main><article class="wrap"><div data-embed-config='{"type":"content"}'></div></article></main>
      <div data-embed-config='{"type":"partial","id":"footer"}'></div>
    </body>`;
    expect(deriveContentWrapperChain(html)).toEqual([
      { tagName: "main", attributes: {} },
      { tagName: "article", attributes: { class: "wrap" } },
      { tagName: "div", attributes: {} },
    ]);
  });

  it("returns a single-node chain when the marker is a direct child of body", () => {
    const html = `<body><div data-embed-config='{"type":"content"}'></div></body>`;
    expect(deriveContentWrapperChain(html)).toEqual([{ tagName: "div", attributes: {} }]);
  });

  it("treats invalid JSON in data-embed-config as not-a-marker rather than throwing", () => {
    const html = `<body><main><div data-embed-config='{not valid json'></div></main></body>`;
    expect(deriveContentWrapperChain(html)).toBeNull();
  });

  it("treats a non-object data-embed-config value as not-a-marker", () => {
    const html = `<body><main><div data-embed-config='"content"'></div></main></body>`;
    expect(deriveContentWrapperChain(html)).toBeNull();
  });

  it("treats an array data-embed-config value as not-a-marker", () => {
    const html = `<body><main><div data-embed-config='["content"]'></div></main></body>`;
    expect(deriveContentWrapperChain(html)).toBeNull();
  });

  it("works from a bare fragment with no explicit <html>/<body> — DOMParser supplies both", () => {
    const chain = deriveContentWrapperChain(`<main><article class="wrap"><div data-embed-config='{"type":"content"}'></div></article></main>`);
    expect(chain).toEqual([
      { tagName: "main", attributes: {} },
      { tagName: "article", attributes: { class: "wrap" } },
      { tagName: "div", attributes: {} },
    ]);
  });
});
