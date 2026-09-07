import assert from "node:assert/strict";
import test from "node:test";

import {
  foldPageHead,
  registerPageHeadContributor,
  resetPageHeadRegistry,
  serializeHeadElements,
  type HeadElement,
  type PageHeadContext,
  type PageHeadHook,
} from "../page-head.js";

/**
 * @file T005 — failing-first certification of `page-head.ts`'s
 * `foldPageHead`/`serializeHeadElements` (ADR-PIPE-008 Decision §2, INV-03,
 * Named Risk #2, behavior.spec.md §2.1/§5/§6.1). Certified BEFORE T009
 * implements it and BEFORE T030/T031/T048/T049 depend on its exact behavior.
 */

const ctx: PageHeadContext = {
  workspaceId: "workspace-1",
  route: "/",
  canonicalUrl: "https://example.com/",
  siteTitle: "Example Site",
};

test.beforeEach(() => {
  resetPageHeadRegistry();
});

function hook(priority: number, elements: HeadElement[], opts: { throws?: boolean } = {}): PageHeadHook {
  return {
    priority,
    async handle() {
      if (opts.throws) throw new Error("contributor exploded");
      return elements;
    },
  };
}

test("foldPageHead: folds registered contributors' elements in ascending priority order", async () => {
  registerPageHeadContributor(
    hook(10, [
      { kind: "meta", name: "robots", content: "index,follow", priority: 130 },
      { kind: "title", text: "Hi", priority: 100 },
    ])
  );

  const result = await foldPageHead(ctx);
  assert.deepEqual(
    result.map((e) => e.priority),
    [100, 130]
  );
});

test("foldPageHead: dedups by HeadElementKey — the element with the numerically highest priority wins", async () => {
  registerPageHeadContributor(hook(10, [{ kind: "meta", name: "description", content: "low", priority: 50 }]));
  registerPageHeadContributor(hook(20, [{ kind: "meta", name: "description", content: "high", priority: 900 }]));

  const result = await foldPageHead(ctx);
  const descriptions = result.filter((e) => e.kind === "meta" && e.name === "description");
  assert.equal(descriptions.length, 1);
  assert.equal((descriptions[0] as { content: string }).content, "high");
});

test("foldPageHead: same-priority collision — the later-registered contributor's element wins (§6.1)", async () => {
  registerPageHeadContributor(hook(10, [{ kind: "meta", name: "robots", content: "first", priority: 130 }]));
  registerPageHeadContributor(hook(20, [{ kind: "meta", name: "robots", content: "second", priority: 130 }]));

  const result = await foldPageHead(ctx);
  const robots = result.filter((e) => e.kind === "meta" && e.name === "robots");
  assert.equal(robots.length, 1);
  assert.equal((robots[0] as { content: string }).content, "second");
});

test("foldPageHead: a throwing contributor's output is dropped; the fold itself never throws and other contributors still render", async () => {
  registerPageHeadContributor(hook(10, [], { throws: true }));
  registerPageHeadContributor(hook(20, [{ kind: "title", text: "Still here", priority: 100 }]));

  const result = await foldPageHead(ctx);
  assert.deepEqual(result, [{ kind: "title", text: "Still here", priority: 100 }]);
});

test("foldPageHead: different keys are never deduped (e.g. two distinct jsonld @types both survive)", async () => {
  registerPageHeadContributor(
    hook(10, [
      { kind: "jsonld", data: { "@type": "Article" }, priority: 900 },
      { kind: "jsonld", data: { "@type": "BreadcrumbList" }, priority: 900 },
    ])
  );

  const result = await foldPageHead(ctx);
  assert.equal(result.length, 2);
});

test("registerPageHeadContributor: multiple registered contributors both fold", async () => {
  registerPageHeadContributor(hook(10, [{ kind: "title", text: "A", priority: 100 }]));
  registerPageHeadContributor(hook(20, [{ kind: "link", rel: "canonical", href: "https://example.com/", priority: 120 }]));

  const result = await foldPageHead(ctx);
  assert.equal(result.length, 2);
});

test("serializeHeadElements: renders one case per HeadElement kind, escaped", async () => {
  const html = serializeHeadElements([
    { kind: "title", text: "A & B", priority: 100 },
    { kind: "meta", name: "description", content: '"quoted"', priority: 110 },
    { kind: "link", rel: "canonical", href: "https://example.com/?a=1&b=2", priority: 120 },
    { kind: "og", property: "og:title", content: "<script>", priority: 140 },
    { kind: "jsonld", data: { "@type": "Article", name: "</script>" }, priority: 900 },
  ]);

  assert.match(html, /<title>A &amp; B<\/title>/);
  assert.match(html, /<meta name="description" content="&quot;quoted&quot;"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<meta property="og:title" content="&lt;script&gt;"/);
  assert.match(html, /<script type="application\/ld\+json">/);
  // The jsonld payload must never let a literal `</script>` break out of the tag.
  assert.ok(!html.includes("<script>Article"));
  const scriptBodyMatch = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
  assert.ok(scriptBodyMatch);
  assert.ok(!scriptBodyMatch![1]!.includes("</script>"));
});

test("serializeHeadElements: never string-concatenates jsonld — the payload round-trips through JSON.stringify", async () => {
  const html = serializeHeadElements([{ kind: "jsonld", data: { "@type": "Article", headline: "Hi" }, priority: 900 }]);
  const scriptBodyMatch = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
  assert.ok(scriptBodyMatch);
  const parsed = JSON.parse(scriptBodyMatch![1]!.replace(/\\u003c/g, "<"));
  assert.equal(parsed["@type"], "Article");
  assert.equal(parsed.headline, "Hi");
});

/**
 * ESC-01 (2026-09-07). `1044e2d5`'s message claimed it added the apostrophe escape to "every
 * `escapeHtml` copy". It reached four of the eleven hand-rolled escapers in `apps/website/src`, and
 * this file's was not one of them — the commit message is not evidence, and neither is the absence
 * of a test.
 *
 * Not exploitable at HEAD: every sink in `page-head.ts` is a double-quoted attribute or a text node
 * (`<title>`, `content="…"`, `href="…"`, `rel="…"`, `hreflang="…"`), and a grep for `='` in that
 * module is empty. This test therefore pins the DEFENCE, not a live hole: `serializeHeadElements`
 * is a template-literal serializer, so the day someone writes a single-quoted attribute into it the
 * escaping either already covers them or silently does not — and the four sibling copies that do
 * escape `'` are what makes "it wasn't needed here" an assumption rather than a rule.
 */
test("serializeHeadElements: an apostrophe is escaped, so a single-quoted attribute added later cannot be broken out of", () => {
  const html = serializeHeadElements([
    { kind: "title", text: "Ada's page", priority: 100 },
    { kind: "meta", name: "description", content: "it's a description' onload='alert(1)", priority: 110 },
    { kind: "link", rel: "canonical", href: "https://example.com/ada's", priority: 120 },
  ]);

  assert.match(html, /<title>Ada&#39;s page<\/title>/);
  assert.match(html, /content="it&#39;s a description&#39; onload=&#39;alert\(1\)"/);
  assert.match(html, /href="https:\/\/example\.com\/ada&#39;s"/);
  assert.ok(!html.includes("'"), `no raw apostrophe may survive serialization:\n${html}`);
});

test("serializeHeadElements: escaping this module's five entities agrees with its four sibling copies, character for character", () => {
  // The equivalence the ESC-01 fix restores, asserted rather than commented. `render.ts`,
  // `static-render.ts`, `form-render.ts` and `site-exporter.ts` all map exactly these five, `&`
  // first (it is the escape character for every entity below it, so escaping it later would
  // double-escape what the others introduce).
  const html = serializeHeadElements([{ kind: "title", text: `&<>"'`, priority: 100 }]);

  assert.match(html, /<title>&amp;&lt;&gt;&quot;&#39;<\/title>/);
});
