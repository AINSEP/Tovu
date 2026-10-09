import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { findScriptRevealedContent, MAX_REVEAL_FINDINGS } from "../hidden-until-script.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file Markup copied from another site that stays invisible because the script that revealed it
 * was not copied (Luvira import, 2026-10-08: a washed-out hero). Page HTML never runs the source's
 * scroll-reveal script, so `opacity:0` / `visibility:hidden` set for it is permanent. The write still
 * succeeds; the result carries a `warning` naming each element so the model removes it next turn.
 */

const clock = { nowMs: () => Date.parse("2026-10-08T00:00:00.000Z") };
const WS = "ws-1";

function harness() {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    workspaceId: WS,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    postRepo: repo,
    pagesHtmlStore: (scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }),
  });
  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const ctx = { principal: { id: "admin-1", kind: "user" }, signal: new AbortController().signal };
  async function call(name: string, input: Record<string, unknown>) {
    const entry = byName.get(name);
    assert.ok(entry, `tool '${name}' is not registered`);
    return entry.handler({ ...ctx, input } as never) as Promise<Record<string, unknown>>;
  }
  return { repo, call };
}

test("an inline opacity:0 or visibility:hidden style is reported with its element", () => {
  const findings = findScriptRevealedContent({
    html:
      `<section data-agent-element="hero" data-agent-role="region">` +
      `<h1 class="hero-title" style="opacity:0;transform:translate3d(0,40px,0)">We hire</h1>` +
      `<p style="visibility: hidden">Lede</p>` +
      `<div style="opacity: 0.0">Card</div></section>`,
  });
  assert.equal(findings.length, 3);
  assert.match(findings[0]!, /<h1 class="hero-title">.*inline style opacity:0/);
  assert.match(findings[1]!, /<p>.*inline style visibility: hidden/);
  assert.match(findings[2]!, /<div>.*inline style opacity: 0\.0/);
});

test("a partial opacity is a design choice, not hidden content", () => {
  assert.deepEqual(findScriptRevealedContent({ html: `<p style="opacity:0.5">a</p><p style="opacity: 0.05">b</p><p style="opacity:1">c</p>` }), []);
});

test("scroll-reveal library attributes and classes are reported; look-alike class names are not", () => {
  const findings = findScriptRevealedContent({
    html: `<div data-aos="fade-up">a</div><div data-sal="slide-up">b</div><div class="wow fadeInUp">c</div><div class="wowza">d</div><div data-sr-id="3">e</div>`,
  });
  assert.equal(findings.length, 4);
  assert.match(findings[0]!, /<div>.*data-aos/);
  assert.match(findings[1]!, /<div>.*data-sal/);
  assert.match(findings[2]!, /<div class="wow fadeInUp">.*class "wow"/);
  assert.match(findings[3]!, /<div>.*data-sr-id/);
});

test("a <style> rule that hides a reveal-named selector is reported; keyframes and ordinary hidden overlays are not", () => {
  const findings = findScriptRevealedContent({
    html:
      `<style>` +
      `@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1 } }` +
      `.overlay { opacity: 0 } .card:hover .overlay { opacity: 1 }` +
      `.lv-reveal, .fade-in-up { opacity:0; transform: translateY(24px) }` +
      `.lv-reveal.is-in { opacity: 1 }` +
      `</style><section data-agent-element="a" data-agent-role="region">x</section>`,
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0]!, /<style> rule "\.lv-reveal, \.fade-in-up"/);
});

test("markup inside an HTML comment is not content and is not reported", () => {
  assert.deepEqual(findScriptRevealedContent({ html: `<!-- <div style="opacity:0" data-aos="x"> -->` }), []);
});

test("findings stop at the cap with a count of the rest", () => {
  const html = Array.from({ length: MAX_REVEAL_FINDINGS + 3 }, (_, i) => `<p data-aos="fade" id="p${i}">x</p>`).join("");
  const findings = findScriptRevealedContent({ html });
  assert.equal(findings.length, MAX_REVEAL_FINDINGS + 1);
  assert.equal(findings.at(-1), "...and 3 more.");
});

test("pages_write_html still writes hidden markup but returns a warning naming it", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Home", kind: "page" } });
  const html = `<section data-agent-element="hero" data-agent-role="region"><h1 style="opacity:0">We hire</h1></section>`;

  const result = await call("pages_write_html", { id: "page-1", html });

  assert.equal(result.written, true);
  assert.equal(typeof result.warning, "string");
  assert.match(result.warning as string, /stays invisible/);
  assert.match(result.warning as string, /<h1>.*inline style opacity:0/);
  assert.equal((await repo.findById({ workspaceId: WS, id: "page-1" }))?.bodyHtml, html);
});

test("pages_write_html on clean markup carries no warning", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Home", kind: "page" } });
  const result = await call("pages_write_html", { id: "page-1", html: `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>` });
  assert.equal(result.written, true);
  assert.equal("warning" in result, false);
});

test("pages_write_region warns about hidden markup in the fragment it wrote", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Home", kind: "page" } });
  await call("pages_write_html", { id: "page-1", html: `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>` });

  const result = await call("pages_write_region", { id: "page-1", handle: "hero", html: `<h1 data-aos="fade-up">Hi</h1>` });

  assert.equal(result.written, true);
  assert.match(result.warning as string, /<h1>.*data-aos/);
});
