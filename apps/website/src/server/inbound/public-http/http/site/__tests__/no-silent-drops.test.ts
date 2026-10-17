/** No silent drops (owner, 2026-10-12): 5f237c87a ran every html page body through sanitizePageHtml at
 * render time, and tovu.dev lost its carousel <script>s and SVG icons with no error anywhere. Run the
 * REAL repo content (landing fixtures, seeded legal pages, every theme page template) through every
 * render-time HTML transform a page body or widget passes, count elements per tag+namespace and
 * attributes per tag, and fail when anything disappears that is not on the reviewed DENY list below. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse, parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { renderMediaRawHtml, sanitizePageHtml } from "#src/features/widgets/media-html";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { renderViaTemplate } from "#src/server/inbound/public-http/routes/site/pages";
import { renderSite } from "../render.js";

type Node = DefaultTreeAdapterMap["parentNode"];
type Element = DefaultTreeAdapterMap["element"];
type Counts = Map<string, number>;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../../../../..");
const CORPUS = [
  "apps/admin/src/features/pages/__tests__/fixtures/landing-scriptblocks.html",
  "apps/website/src/server/inbound/public-http/http/site/__tests__/fixtures/landing-leading-style.html",
  // Reviewable copies of the seeded tovu.dev legal page rows (content/legal/tovu-dev/README.md).
  ...globSync("content/legal/**/*.html", { cwd: ROOT }),
  ...globSync("content/themes/**/*.html", { cwd: ROOT }),
  ...globSync("development/docs/themes/scaffolds/*.html", { cwd: ROOT }),
].sort();

/** Reviewed drops for less-trusted Media Raw HTML widget content (media-html.ts). Key: `tag` (HTML) or
 * `svg:tag`. A denied element's whole subtree is expected to go with it. */
const WIDGET_DENY_ELEMENTS: Readonly<Record<string, string>> = {
  script: "executes", noscript: "script fallback; scripts are stripped", iframe: "loads/navigates", object: "loads plugins",
  embed: "loads plugins", frame: "loads/navigates", frameset: "loads/navigates", base: "rewrites every relative URL",
  link: "loads stylesheets/preloads", meta: "http-equiv refresh/CSP; document head only", title: "document head only",
  canvas: "needs script", dialog: "opens only by script, which is stripped",
  "svg:script": "executes", "svg:style": "unvalidated SVG stylesheet", "svg:foreignObject": "embeds arbitrary HTML",
  "svg:a": "navigates", "svg:use": "loads external SVG", "svg:image": "loads external resource",
  "svg:animate": "rewrites attributes after the check", "svg:set": "rewrites attributes after the check",
};
function widgetAttributeDenied(attr: Element["attrs"][number]): string | undefined {
  if (/^on/i.test(attr.name)) return "event handler";
  if (attr.namespace || attr.prefix) return "namespaced (xlink:href loads; xmlns is implied by inline SVG)";
  if (/^\s*(javascript|vbscript):/i.test(attr.value)) return "script URL";
  return undefined;
}
// Page bodies render unmodified (render.ts renderPostBody): nothing may drop, <script> included.
const PAGE_DENY_ELEMENTS: Readonly<Record<string, string>> = {};
const isEmbedMarker = (element: Element) => element.attrs.some(attr => attr.name === "data-embed-config");

function elementKey(element: Element): string {
  if (element.namespaceURI === "http://www.w3.org/2000/svg") return `svg:${element.tagName}`;
  if (element.namespaceURI === "http://www.w3.org/1998/Math/MathML") return `math:${element.tagName}`;
  return element.tagName;
}

/** Counts `tag` and `tag@attr` keys. `skip` drops a subtree from the BEFORE count (reviewed drops). */
function countNodes(root: Node, skip: (element: Element) => boolean = () => false, skipAttr: (attr: Element["attrs"][number]) => boolean = () => false): Counts {
  const counts: Counts = new Map();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    for (const child of node.childNodes) {
      if (!("tagName" in child) || skip(child)) continue;
      const key = elementKey(child);
      add(key);
      for (const attr of child.attrs) if (!skipAttr(attr)) add(`${key}@${attr.prefix ? `${attr.prefix}:` : ""}${attr.name}`);
      stack.push("content" in child ? child.content : child);
    }
  }
  return counts;
}

function lost(before: Counts, after: Counts, baseline: Counts = new Map()): string[] {
  const rows: string[] = [];
  for (const [key, count] of before) {
    const kept = (after.get(key) ?? 0) - (baseline.get(key) ?? 0);
    if (kept < count) rows.push(`<${key}> before ${count} after ${kept}`);
  }
  return rows;
}

const corpus = CORPUS.map(file => ({ file, html: readFileSync(path.join(ROOT, file), "utf8") }));

test("the corpus is real and non-trivial (a moved fixture must not empty this guard)", () => {
  assert.ok(corpus.length >= 100, `only ${corpus.length} files found under ${ROOT}`);
  const landing = corpus.find(item => item.file.endsWith("landing-scriptblocks.html"))!;
  assert.equal(countNodes(parseFragment(landing.html)).get("script"), 3);
  assert.ok((countNodes(parseFragment(landing.html)).get("svg:svg") ?? 0) >= 6);
});

test("Media Raw HTML widget transforms drop only DENY-listed elements and attributes", (t) => {
  // Reviewed drops still warn per call (media-html-report-drops.unit.test.ts); keep this run quiet.
  t.mock.method(console, "warn", () => {});
  const failures: string[] = [];
  for (const { file, html } of corpus) {
    const before = countNodes(parseFragment(html), element => Object.hasOwn(WIDGET_DENY_ELEMENTS, elementKey(element)), attr => widgetAttributeDenied(attr) !== undefined);
    const transforms: [string, string][] = [
      ["sanitizePageHtml", sanitizePageHtml({ html })],
      ["renderMediaRawHtml", renderMediaRawHtml({ html, media: {}, renderMedia: () => "" }, { reportIssue: () => {} })],
    ];
    for (const [label, output] of transforms) {
      for (const row of lost(before, countNodes(parseFragment(output)))) failures.push(`${label} ${file}: ${row}`);
    }
  }
  assert.deepEqual(failures, [], `silent drops not on WIDGET_DENY:\n${failures.join("\n")}`);
});

test("page-body render paths keep every element and attribute (page <script> included)", async () => {
  const deps = createRouteDeps();
  const theme = {
    manifest: { id: "no-silent-drops", name: "No silent drops", version: "1.0.0", tier: "static", engine: 1, templates: ["post.html"] },
    dir: "/nonexistent/no-silent-drops", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { post: `<html><head><title>{{title}}</title></head><body><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
  const renderers: [string, (bodyHtml: string) => Promise<string>][] = [
    ["renderSite", bodyHtml => renderSite({ theme: null, route: "post", siteTitle: "Tovu", posts: [],
      post: buildPostRecord({ workspaceId: "ws-drops", kind: "page", bodyFormat: "html", bodyHtml }) })],
    ["renderViaTemplate saved", bodyHtml => {
      const post = buildPostRecord({ workspaceId: deps.workspaceId, kind: "page", bodyFormat: "html", bodyHtml });
      deps.postRepo = new InMemoryPostRepo([post]);
      return renderViaTemplate(deps, theme, post, undefined);
    }],
    ["renderViaTemplate pending", bodyHtml => {
      const post = buildPostRecord({ workspaceId: deps.workspaceId, kind: "page", bodyFormat: "html", bodyHtml: "" });
      deps.postRepo = new InMemoryPostRepo([post]);
      return renderViaTemplate(deps, theme, post, undefined, undefined, bodyHtml);
    }],
  ];
  const failures: string[] = [];
  for (const [label, render] of renderers) {
    // Chrome the path adds around any body; subtracted so only the body's own elements are compared.
    const baseline = countNodes(parse(await render("")));
    for (const { file, html } of corpus) {
      // Embed markers are replaced by their widget output by design (html-embeds.ts), not dropped.
      const before = countNodes(parseFragment(html), element => isEmbedMarker(element) || Object.hasOwn(PAGE_DENY_ELEMENTS, elementKey(element)));
      for (const row of lost(before, countNodes(parse(await render(html))), baseline)) failures.push(`${label} ${file}: ${row}`);
    }
  }
  assert.deepEqual(failures, [], `silent drops on the page-body render path:\n${failures.join("\n")}`);
});
