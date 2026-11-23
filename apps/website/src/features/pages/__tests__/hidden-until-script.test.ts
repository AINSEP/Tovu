import { pageToolInputWithBasis } from "./page-tool-input.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file Markup copied from another site that stays invisible because the script that revealed it
 * was not copied (Luvira import, 2026-10-08: a washed-out hero). Page HTML never runs the source's
 * scroll-reveal script, so `opacity:0` / `visibility:hidden` set for it is permanent. The write still
 * succeeds; the result carries a `warning` naming each element so the model removes it next turn.
 * The pure scanner cases live with the scanner in `@jini-ai/cms/pages/hidden-until-script`.
 */

const clock = { nowMs: () => Date.parse("2026-10-08T00:00:00.000Z") };
const WS = "ws-1";

function harness() {
  const repo = new InMemoryPostRepo({}, { initialRows: [] });
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
    return entry.handler({ ...ctx, input: await pageToolInputWithBasis({ toolId: name, input, repo, workspaceId: WS }) } as never) as Promise<Record<string, unknown>>;
  }
  return { repo, call };
}

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

  // why: direct handler call bypasses the alias hook; regionId is the canonical field since N3 (42773ffa).
  const result = await call("pages_write_region", { id: "page-1", regionId: "hero", html: `<h1 data-aos="fade-up">Hi</h1>` });

  assert.equal(result.written, true);
  assert.match(result.warning as string, /<h1>.*data-aos/);
});
