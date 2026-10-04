import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file `pages_move_region` — reordering a page's sections without re-sending the page.
 *
 * Regression for chat "Can You See Higgsfield Plugin" (2026-10-01). Asked to "swap" the landing
 * page's "Use the AI you already pay for" section above "Every screen, one place", the assistant read
 * the page (9 tagged regions, version 99), searched the catalog twice for a move/reorder tool, found
 * only `pages_write_region` (inner content only) and `pages_write_html` (re-send all ~55KB), and
 * refused: "The catalog has no tool that can move a section on a page."
 */

const clock = { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z") };
const WS = "ws-move";

function harness() {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    workspaceId: WS,
    authorize: async () => ({ allowed: true }),
    postRepo: repo,
    pagesHtmlStore: (scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }),
  });
  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const ctx = { principal: { id: "admin-1", kind: "user" }, signal: new AbortController().signal };

  async function call(name: string, input: Record<string, unknown>) {
    const entry = byName.get(name);
    assert.ok(entry, `tool '${name}' is not registered`);
    return entry.handler({ ...ctx, input } as never);
  }

  return { repo, byName, call };
}

const HERO = `<section data-agent-element="page-hero" data-agent-role="region"><h1>Tovu</h1></section>`;
const ADMIN_TOUR = `<section data-agent-element="admin-tour" data-agent-role="region"><h2>Every screen, one place.</h2></section>`;
const AGENTS = `<section data-agent-element="agents" data-agent-role="region"><h2>Use the AI you already pay for.</h2></section>`;
const CLOSER = `<section data-agent-element="closer" data-agent-role="region"><p>Start.</p></section>`;
const STYLE = `<style>\n  .tv .h2 { font-size: 3rem; }\n</style>\n`;
const LANDING = `${STYLE}${HERO}\n${ADMIN_TOUR}\n${AGENTS}\n${CLOSER}\n`;

async function seedLanding(h: ReturnType<typeof harness>, id = "landing") {
  await createPost({ deps: { repo: h.repo, clock }, input: { workspaceId: WS, id, title: "Landing", kind: "page" } });
  await h.call("pages_write_html", { id, html: LANDING });
  return (await h.call("pages_read_html", { id })) as { version: number };
}

test("pages_move_region is registered and publishes an input schema requiring id and handle", () => {
  const { byName } = harness();
  const entry = byName.get("pages_move_region");
  assert.ok(entry, "pages_move_region must be registered");
  assert.deepEqual((entry.descriptor.inputSchema as { required?: string[] }).required, ["id", "handle"]);
});

test("the incident: moving 'agents' before 'admin-tour' swaps the two sections and leaves every other byte as it was", async () => {
  const h = harness();
  const { version } = await seedLanding(h);

  const result = await h.call("pages_move_region", { id: "landing", handle: "agents", before: "admin-tour", expectedVersion: version });

  assert.deepEqual(result, {
    written: true,
    id: "landing",
    handle: "agents",
    regions: ["page-hero", "agents", "admin-tour", "closer"],
    version: version + 1,
  });
  const after = (await h.call("pages_read_html", { id: "landing" })) as { html: string };
  assert.equal(after.html, `${STYLE}${HERO}\n${AGENTS}\n${ADMIN_TOUR}\n${CLOSER}\n`);
});

test("'after' places the section immediately after the target", async () => {
  const h = harness();
  await seedLanding(h);
  await h.call("pages_move_region", { id: "landing", handle: "page-hero", after: "closer" });
  const after = (await h.call("pages_read_html", { id: "landing" })) as { html: string };
  assert.equal(after.html, `${STYLE}${ADMIN_TOUR}\n${AGENTS}\n${CLOSER}\n${HERO}\n`);
});

test("exactly one of before/after is required — neither or both is refused before anything is read", async () => {
  const h = harness();
  await seedLanding(h);
  const message =
    "Send exactly one of 'before' or 'after': the handle of the region the moved section should sit immediately before, " +
    "or immediately after. Nothing was written.";
  await assert.rejects(() => h.call("pages_move_region", { id: "landing", handle: "agents" }), (err: unknown) => err instanceof ToolInputError && err.message === message);
  await assert.rejects(
    () => h.call("pages_move_region", { id: "landing", handle: "agents", before: "admin-tour", after: "closer" }),
    (err: unknown) => err instanceof ToolInputError && err.message === message
  );
});

test("an unknown target handle is refused with the handles the page actually has, and nothing is written", async () => {
  const h = harness();
  const { version } = await seedLanding(h);
  await assert.rejects(() => h.call("pages_move_region", { id: "landing", handle: "agents", before: "every-screen" }), {
    message:
      "Nothing was written: page 'landing' has no region with data-agent-element=\"every-screen\" — it has: page-hero, admin-tour, agents, closer. " +
      "Call pages_read_html to see the current handles, and target one of those; if the section you want does not exist " +
      "yet, add it with pages_write_html.",
  });
  const after = (await h.call("pages_read_html", { id: "landing" })) as { version: number; html: string };
  assert.equal(after.version, version);
  assert.equal(after.html, LANDING);
});

test("a stale expectedVersion is a VERSION_CONFLICT and nothing is moved", async () => {
  const h = harness();
  const { version } = await seedLanding(h);
  await assert.rejects(
    () => h.call("pages_move_region", { id: "landing", handle: "agents", before: "admin-tour", expectedVersion: version - 1 }),
    (err: unknown) => err instanceof ToolInputError && /^VERSION_CONFLICT: page 'landing' is at version /.test(err.message)
  );
  const after = (await h.call("pages_read_html", { id: "landing" })) as { html: string };
  assert.equal(after.html, LANDING);
});

test("moving a region relative to itself is refused with a reason, not written", async () => {
  const h = harness();
  const { version } = await seedLanding(h);
  const result = await h.call("pages_move_region", { id: "landing", handle: "agents", after: "agents" });
  assert.deepEqual(result, {
    written: false,
    reason: "Nothing was written: 'agents' cannot be placed after itself. Name a different region as the target.",
  });
  assert.equal(((await h.call("pages_read_html", { id: "landing" })) as { version: number }).version, version);
});

test("moving a region next to a region nested inside it is refused with a reason, not written", async () => {
  const h = harness();
  await createPost({ deps: { repo: h.repo, clock }, input: { workspaceId: WS, id: "nested", title: "N", kind: "page" } });
  const html = `<section data-agent-element="outer" data-agent-role="region"><div data-agent-element="inner"><p>i</p></div></section>\n`;
  await h.call("pages_write_html", { id: "nested", html });
  const result = await h.call("pages_move_region", { id: "nested", handle: "outer", before: "inner" });
  assert.deepEqual(result, {
    written: false,
    reason:
      "Nothing was written: 'inner' is inside 'outer', so 'outer' cannot be placed before it — a section cannot sit inside itself. " +
      "Name a region outside 'outer' as the target.",
  });
});

test("a region already in the requested position is reported, not rewritten", async () => {
  const h = harness();
  const { version } = await seedLanding(h);
  const result = await h.call("pages_move_region", { id: "landing", handle: "agents", after: "admin-tour" });
  assert.deepEqual(result, {
    written: false,
    reason: "Nothing was written: 'agents' already sits immediately after 'admin-tour'. Current order: page-hero, admin-tour, agents, closer.",
  });
  assert.equal(((await h.call("pages_read_html", { id: "landing" })) as { version: number }).version, version);
});

test("a page with no HTML body is reported, not converted", async () => {
  const h = harness();
  await createPost({ deps: { repo: h.repo, clock }, input: { workspaceId: WS, id: "empty", title: "E", kind: "page" } });
  const result = await h.call("pages_move_region", { id: "empty", handle: "a", before: "b" });
  assert.deepEqual(result, {
    written: false,
    reason:
      "'empty' has no bespoke HTML body to move a region of. Either it is a post (posts are edited with " +
      "content_post_update), or it is a page nobody has authored yet — author it in full with pages_write_html first.",
  });
});
