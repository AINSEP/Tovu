/** Owner dispatch 2026-10-20: validation, request isolation and shared banner contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "parse5";
import { JSDOM } from "jsdom";
import { ValueValidationFailedError } from "@jini-ai/core/settings";
import { parsePreviewSwitcher, validatePreviewSwitcher, choosePreviewTheme, type PreviewSwitcher } from "../preview-switcher.js";
import { decoratePreviewPage } from "../preview-switcher-html.js";
import type { DiscoveredTheme } from "../theme.js";

const config: PreviewSwitcher = { enabled: true, position: "top", themes: [{ themeId: "one", label: "One" }, { themeId: "two", label: "Two <sky>" }] };
const themes = config.themes.map(({ themeId }) => ({ status: "valid", manifest: { id: themeId } })) as DiscoveredTheme[];

test("preview setting validates the whole roster, active membership, duplicates, bounds and shape", () => {
  assert.deepEqual(validatePreviewSwitcher({ value: config, themes, activeThemeId: "one" }), config);
  for (const value of [null, {}, { ...config, position: "bottom" }, { ...config, enabled: "true" },
    { ...config, extra: true }, { ...config, themes: [config.themes[0]] }, { ...config, themes: Array(9).fill(config.themes[0]) },
    { ...config, themes: [config.themes[0], config.themes[0]] }, { ...config, themes: [config.themes[0], { themeId: "absent", label: "No" }] },
    { ...config, themes: [config.themes[0], { themeId: "two", label: " " }] },
    { ...config, themes: [config.themes[0], { themeId: "two", label: "a".repeat(81) }] },
    { ...config, themes: [config.themes[0], { themeId: "../two", label: "Two" }] },
    { ...config, themes: [config.themes[0], { themeId: "two", label: "Two", key: "x" }] }]) {
    assert.throws(() => validatePreviewSwitcher({ value, themes, activeThemeId: "one" }), ValueValidationFailedError);
  }
  assert.throws(() => validatePreviewSwitcher({ value: config, themes, activeThemeId: "three" }));
  assert.deepEqual(parsePreviewSwitcher({ value: { enabled: false, position: "top", themes: [] } }).themes, []);
  const eight = Array.from({ length: 8 }, (_, i) => ({ themeId: `t${i}`, label: `Theme ${i}` }));
  assert.equal(parsePreviewSwitcher({ value: { ...config, themes: eight } }).themes.length, 8);
});

test("query wins over cookie; reset, unknown and disabled select normal theme", () => {
  const choose = (options: { query?: string; cookie?: string }) => choosePreviewTheme({ config, activeThemeId: "one", ...options });
  assert.equal(choose({ query: "two" }).themeId, "two");
  assert.equal(choose({ cookie: "two" }).themeId, "two");
  assert.equal(choose({ query: "unknown", cookie: "two" }).themeId, "one");
  assert.equal(choose({ query: "reset", cookie: "two" }).reset, true);
  assert.equal(choosePreviewTheme({ config: { ...config, enabled: false }, activeThemeId: "one", query: "two" }).themeId, "one");
});

test("one banner covers live and static, escapes labels and canonicalizes preview documents", () => {
  const html = '<!doctype html><html><head><link href="/wrong?theme=two" rel="canonical"><meta name="robots" content="index"></head><body><a href="/about?q=1#x">About</a><a href="next">Next</a><a href="https://site.test/help">Help</a><a href="//elsewhere.test/x">External</a><script>const sample="<a href=\'/fake\'>";</script></body></html>';
  const input = { html, config, activeThemeId: "one", currentThemeId: "two", path: "/about", origin: "https://site.test", preview: true };
  const live = decoratePreviewPage({ ...input, delivery: "live" });
  assert.match(live, /\?theme=two/);
  assert.match(live, /aria-current="true"/);
  assert.match(live, /Two &lt;sky&gt;/);
  assert.match(live, /href="https:\/\/site.test\/about" rel="canonical"|rel="canonical" href="https:\/\/site.test\/about"/);
  assert.doesNotMatch(live, /localStorage|https:\/\/.*\.js/);
  assert.match(live, /shadowrootmode="open"/);
  assert.match(live, /prefers-reduced-motion/);
  assert.match(live, /--tovu-theme-preview-height/);
  const output = decoratePreviewPage({ ...input, delivery: "static" });
  assert.match(output, /name="robots" content="noindex"/);
  assert.match(output, /href="\/_themes\/two\/about\?q=1#x"/);
  assert.match(output, /href="\/_themes\/two\/next"/);
  assert.match(output, /href="\/_themes\/two\/help"/);
  assert.match(output, /href="\/about"[^>]*>One/);
  assert.match(output, /href="\/\/elsewhere.test\/x"/);
  assert.match(output, /const sample="<a href='\/fake'>"/);
  assert.ok(parse(output));
  assert.equal(decoratePreviewPage({ ...input, config: { ...config, enabled: false }, delivery: "live" }), html);
});

test("banner script isolates controls and offsets fixed chrome and body without theme selectors", t => {
  const html = decoratePreviewPage({ html: '<html><head><style>nav,a{display:none!important}</style><script>const headString="</head>";</script></head><body><header style="position:fixed;top:0">Header</header><script>const bodyString="</body>";</script></body></html>',
    config, activeThemeId: "one", currentThemeId: "two", path: "/", origin: "https://site.test", preview: true, delivery: "live" });
  const dom = new JSDOM(html, { runScripts: "dangerously", beforeParse(window) {
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ height: 44, width: 375, top: 0, left: 0, right: 375, bottom: 44, x: 0, y: 0, toJSON: () => ({}) });
  } });
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  const host = doc.querySelector(".tovu-theme-preview-host")!;
  assert.ok(host.shadowRoot);
  assert.equal(host.shadowRoot.querySelectorAll("a[href]").length, 2);
  assert.equal(host.shadowRoot.querySelector("[aria-current]")?.textContent, "Two <sky>");
  assert.equal(doc.documentElement.style.getPropertyValue("--tovu-theme-preview-height"), "44px");
  assert.match(doc.body.style.paddingTop, /--tovu-theme-preview-height/);
  assert.match(doc.querySelector("header")!.style.top, /--tovu-theme-preview-height/);
  assert.equal(doc.querySelectorAll(".tovu-theme-preview-host").length, 1);
  assert.ok(doc.head.querySelector('link[rel="canonical"]'));
  assert.match(html, /overflow-x:auto/);
  assert.match(html, /bodyString="<\/body>"/);
});
