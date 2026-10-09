/** html-to-markdown and html-document projections: exact outputs on hostile and ordinary HTML. */
import assert from "node:assert/strict";
import test from "node:test";
import { htmlToMarkdown } from "../html-to-markdown.js";
import { htmlToText, readHtmlDocument, stripActiveHtml, MAX_IMAGES, MAX_LINKS } from "../html-document.js";

const md = (html: string, pageUrl = "https://a.example/dir/page") => htmlToMarkdown({ html, pageUrl });

test("headings, paragraphs, emphasis, breaks and rules", () => {
  assert.equal(md("<h2>Title  <b>bold </b>end</h2><p>a<br>b</p><hr><h6>x</h6><p><i> </i>c</p>"), "## Title **bold** end\n\na\nb\n\n---\n\n###### x\n\nc");
});

test("code spans, code blocks keep their whitespace, blockquotes prefix every line", () => {
  assert.equal(md("<p>Run <code>npm  i</code></p><pre>line 1\n  line 2\n</pre><blockquote><p>q1</p><p>q2</p></blockquote>"),
    "Run `npm  i`\n\n```\nline 1\n  line 2\n```\n\n> q1\n>\n> q2");
});

test("ordered and nested lists indent continuation lines under their marker", () => {
  assert.equal(md("<ol><li>One</li><li>Two<ol><li>Two-a</li></ol></li></ol>"), "1. One\n2. Two\n   1. Two-a");
});

test("tables become pipe tables with escaped pipes and padded rows", () => {
  assert.equal(md("<table><tr><th>Plan</th><th>Price</th></tr><tr><td>A | B</td><td>$1</td></tr><tr><td>C</td></tr></table>"),
    "| Plan | Price |\n| --- | --- |\n| A \\| B | $1 |\n| C |  |");
});

test("links and images resolve against <base href>; unsafe or empty targets degrade to text", () => {
  const html = `<html><head><base href="/root/"></head><body><a href="x">X</a> <a href="javascript:steal()">J</a> <a href="https://b.example"></a><img src="pic.png" alt="P"><img src="data:image/png;base64,AA"></body></html>`;
  assert.equal(md(html), "[X](https://a.example/root/x) J ![P](https://a.example/root/pic.png)");
});

test("scripts, styles, head, svg, iframes and form controls are dropped", () => {
  assert.equal(md("<head><title>T</title></head><body><script>bad()</script><style>p{}</style><svg><text>s</text></svg><iframe src=x></iframe><select><option>o</option></select><p>kept</p></body>"), "kept");
});

test("pathologically deep nesting degrades to text instead of overflowing the stack", () => {
  const deep = "<div>".repeat(5000) + "<b>deep</b>" + "</div>".repeat(5000);
  assert.equal(md(deep), "deep");
  assert.equal(htmlToText({ html: deep }), "deep");
  assert.equal(readHtmlDocument({ html: deep + "<a href='/x'>x</a>", pageUrl: "https://a.example/" }).links.length, 1);
});

test("links are capped at MAX_LINKS and images at MAX_IMAGES, with explicit flags", () => {
  const html = Array.from({ length: MAX_LINKS + 5 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("") + Array.from({ length: MAX_IMAGES + 5 }, (_, i) => `<img src="/i${i}.png">`).join("");
  const facts = readHtmlDocument({ html, pageUrl: "https://a.example/" });
  assert.deepEqual([facts.links.length, facts.linksTruncated, facts.images.length, facts.imagesTruncated], [MAX_LINKS, true, MAX_IMAGES, true]);
  assert.deepEqual(facts.links.at(-1), { href: `https://a.example/p${MAX_LINKS - 1}`, text: `p${MAX_LINKS - 1}`, internal: true });
});

test("a page with no head facts reports none, and srcset-only images use their first candidate", () => {
  assert.deepEqual(readHtmlDocument({ html: `<p><img srcset="/s.png 1x, /s2.png 2x" alt="S"><a href="/t" aria-label="Go"></a></p>`, pageUrl: "https://a.example/" }), {
    links: [{ href: "https://a.example/t", text: "Go", internal: true }], linksTruncated: false,
    images: [{ src: "https://a.example/s.png", alt: "S" }], imagesTruncated: false, stylesheets: [], meta: {},
  });
});

test("stripActiveHtml removes scripts, comments, event handlers and javascript: URLs but keeps styles and classes", () => {
  assert.equal(stripActiveHtml({ html: `<div class="hero"><!--x--><script>a()</script><style>.a{}</style><template><p>t</p></template><p onclick="x" ONLOAD="y">ok</p><a href=" JavaScript:steal()" title="t">j</a><a href="/fine">f</a></div>` }),
    `<html><head></head><body><div class="hero"><style>.a{}</style><p>ok</p><a title="t">j</a><a href="/fine">f</a></div></body></html>`);
});
