import assert from "node:assert/strict";
import test from "node:test";
import { renderHtmlMenu, type HtmlMenuItem } from "../html-render.js";

// Byte-exact pins for the menu renderer: its escaping and tool-exposure rules are security-sensitive,
// so every branch is asserted against the full output string rather than a loose regex.

const leaf = (overrides: Partial<HtmlMenuItem> = {}): HtmlMenuItem =>
  ({ label: "L", href: "/l", available: true, isCurrent: false, children: [], ...overrides });
const asAuthored = (href: string): string => href;
const NAV_OPEN = '<nav data-tovu-menu="m"><ul data-tovu-menu-list data-depth="0">';
const NAV_CLOSE = "</ul></nav>";
const LI_OPEN = '<li data-tovu-menu-item data-depth="0" data-current="false" data-active="false" data-has-children="false">';
const PLAIN_LINK = '<a href="/l" data-toolname="menu_m_0" data-tooldescription="L">L</a>';

function renderOne(item: HtmlMenuItem, sanitizeHref: (href: string) => string = asAuthored): string {
  return renderHtmlMenu({ id: "m", items: [item], sanitizeHref });
}

test("a plain available link renders the nav, list, item and a site-relative tool", () => {
  assert.equal(renderOne(leaf()), `${NAV_OPEN}${LI_OPEN}${PLAIN_LINK}</li>${NAV_CLOSE}`);
});

test("a current item carries aria-current and data-current while an explicit isActive=false stays false", () => {
  assert.equal(renderOne(leaf({ isCurrent: true, isActive: false })),
    `${NAV_OPEN}<li data-tovu-menu-item data-depth="0" data-current="true" data-active="false" data-has-children="false">`
    + `<a href="/l" aria-current="page" data-toolname="menu_m_0" data-tooldescription="L">L</a></li>${NAV_CLOSE}`);
});

test("empty icon, description and rel and a false openInNewTab render exactly like absent attrs", () => {
  assert.equal(renderOne(leaf({ attrs: { icon: "", description: "", rel: "", openInNewTab: false } })), renderOne(leaf()));
});

test("a whitespace-only rel produces no rel attribute", () => {
  assert.equal(renderOne(leaf({ attrs: { rel: "   " } })), `${NAV_OPEN}${LI_OPEN}${PLAIN_LINK}</li>${NAV_CLOSE}`);
});

test("a new tab without an authored rel gets target=_blank and noopener noreferrer", () => {
  assert.equal(renderOne(leaf({ attrs: { openInNewTab: true } })),
    `${NAV_OPEN}${LI_OPEN}<a href="/l" target="_blank" rel="noopener noreferrer" data-toolname="menu_m_0" data-tooldescription="L">L</a></li>${NAV_CLOSE}`);
});

test("a new tab keeps authored rel tokens first, de-duplicates the security tokens and escapes the rel value", () => {
  assert.equal(renderOne(leaf({ attrs: { openInNewTab: true, rel: 'noreferrer x"y' } })),
    `${NAV_OPEN}${LI_OPEN}<a href="/l" target="_blank" rel="noreferrer x&quot;y noopener" data-toolname="menu_m_0" data-tooldescription="L">L</a></li>${NAV_CLOSE}`);
});

test("an unavailable item without visible descendants renders nothing at all", () => {
  assert.equal(renderOne(leaf({ available: false })), "");
});

test("an href-less heading renders a label span with escaped icon and description around its nested list", () => {
  const heading = leaf({ href: null, attrs: { icon: "i", description: "d" }, children: [leaf({ label: "C<" })] });
  assert.equal(renderOne(heading),
    `${NAV_OPEN}<li data-tovu-menu-item data-depth="0" data-current="false" data-active="false" data-has-children="true">`
    + '<span data-tovu-menu-label><span data-tovu-menu-icon="i"></span>L<span data-tovu-menu-description>d</span></span>'
    + '<ul data-tovu-menu-list data-depth="1"><li data-tovu-menu-item data-depth="1" data-current="false" data-active="false" data-has-children="false">'
    + `<a href="/l" data-toolname="menu_m_0_0" data-tooldescription="C&lt;">C&lt;</a></li></ul></li>${NAV_CLOSE}`);
});

test("a sanitizer that empties the href still renders the anchor, with an empty href and no tool", () => {
  assert.equal(renderOne(leaf(), () => ""), `${NAV_OPEN}${LI_OPEN}<a href="">L</a></li>${NAV_CLOSE}`);
});

test("the sanitizer receives the authored href, never the raw one being rendered", () => {
  const seen: string[] = [];
  renderOne(leaf({ href: "/authored" }), (href) => { seen.push(href); return href; });
  assert.deepEqual(seen, ["/authored"]);
});

test("an unavailable or href-less item never calls the sanitizer", () => {
  const seen: string[] = [];
  const record = (href: string): string => { seen.push(href); return href; };
  renderHtmlMenu({ id: "m", items: [leaf({ available: false, children: [leaf({ href: "/kid" })] }), leaf({ href: null, children: [leaf({ href: "/kid2" })] })], sanitizeHref: record });
  assert.deepEqual(seen, ["/kid", "/kid2"]);
});

test("the nav id is escaped verbatim while the tool prefix maps unsafe characters to _ and keeps 64 characters", () => {
  const id = `a b/c"d${"x".repeat(70)}`;
  const html = renderHtmlMenu({ id, items: [leaf()], sanitizeHref: asAuthored });
  assert.equal(html,
    `<nav data-tovu-menu="a b/c&quot;d${"x".repeat(70)}"><ul data-tovu-menu-list data-depth="0">${LI_OPEN}`
    + `<a href="/l" data-toolname="menu_a_b_c_d${"x".repeat(57)}_0" data-tooldescription="L">L</a></li>${NAV_CLOSE}`);
});

test("tool names are capped at 128 characters", () => {
  let deep: HtmlMenuItem = leaf({ label: "deep" });
  for (let level = 0; level < 40; level += 1) deep = leaf({ href: null, children: [deep] });
  const html = renderHtmlMenu({ id: "x".repeat(80), items: [deep], sanitizeHref: asAuthored });
  const names = [...html.matchAll(/data-toolname="([^"]*)"/g)].map(match => match[1]);
  assert.equal(names.length, 1);
  assert.equal(names[0]!.length, 128);
  assert.match(html, /data-tooldescription="deep"/);
});

test("siblings past the 128-character cap retain distinct stable tool names", () => {
  let deep: HtmlMenuItem = leaf({ href: null, children: [leaf({ label: "a" }), leaf({ label: "b" })] });
  for (let level = 0; level < 40; level += 1) deep = leaf({ href: null, children: [deep] });
  const html = renderHtmlMenu({ id: "x".repeat(80), items: [deep], sanitizeHref: asAuthored });
  const names = [...html.matchAll(/data-toolname="([^"]*)"/g)].map((match) => match[1]);
  assert.equal(names.length, 2);
  assert.notEqual(names[0], names[1]);
  assert.ok(names.every(name => name!.length === 128));
  assert.equal(renderHtmlMenu({ id: "x".repeat(80), items: [deep], sanitizeHref: asAuthored }), html);
});

test("an empty item list renders an empty string", () => {
  assert.equal(renderHtmlMenu({ id: "m", items: [], sanitizeHref: asAuthored }), "");
});

const exposesTool = (href: string): boolean => /data-toolname=/.test(renderOne(leaf(), () => href));

for (const href of ["HTTPS://x", "javascript:alert(1)", "a:b", "//x", "/\\x", "\\/x", "\\\\x", "/x ", "/x\u001f", "/x\u0000", "/x\\y"]) {
  test(`the sanitized href ${JSON.stringify(href)} is rendered as a link but never advertised as a tool`, () => {
    assert.equal(exposesTool(href), false);
  });
}

for (const href of ["1abc:x", "+x:y", "/x!", "/x\u007f", "./rel", "?q", "#f", "/"]) {
  test(`the sanitized href ${JSON.stringify(href)} is site-relative and advertised as a tool`, () => {
    assert.equal(exposesTool(href), true);
  });
}
