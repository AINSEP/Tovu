import { invokeRegisteredTool } from "./fixtures/execute-registered-tool.js";
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolExecutionContext } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "../index.js";
import { InMemoryPostRepo, createPost } from "../../features/post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../../features/pages/html-document-store.memory.js";
import { contributePagesTools } from "../../features/pages/tool-registrations.js";
import { peerFixture } from "../../server/runtime/composition/__tests__/peer-site-reads.fixture.js";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "./fixtures/registry-deps.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { bindContentTargetInputs } from "../../server/runtime/composition/content-target-inputs.js";
import type { BatchResult } from "../batch-tool-inputs.js";

/** Real registry and page store, with authorization outcomes controlled per item. */
async function harness({ resolveTargets = false } = {}) {
  const workspaceId = "page-batch", principalId = "page-reader";
  const clock = { nowMs: () => Date.parse("2026-10-17T00:00:00.000Z") };
  const repo = new InMemoryPostRepo([]);
  const pagesHtmlStore = (scope: { workspaceId: string; postId: string; actorId?: string }) =>
    new InMemoryPagesHtmlDocumentStore(scope, { repo, clock });
  for (const id of ["first", "second", "third", "home"]) {
    await createPost({ deps: { repo, clock }, input: { workspaceId, id, title: id, kind: "page", ...(id === "home" ? { slug: "/" } : {}) } });
    await pagesHtmlStore({ workspaceId, postId: id }).ensureHtmlFormat(`<main>${id}</main>`);
  }
  const checks: unknown[] = [];
  let deniedCheck = -1;
  let denyAll = false;
  const contributions = {
    ...(resolveTargets ? { contentTargetInputs: bindContentTargetInputs } : {}),
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  contributions.contributors.register({ contribution: contributePagesTools() });
  const deps = { workspaceId, clock, postRepo: repo, pagesHtmlStore, authorize: async (input: unknown) => {
    checks.push(input);
    return { allowed: !denyAll && checks.length !== deniedCheck, reason: "batch fixture" };
  } } as unknown as RegistryDepsWithoutLimiter;
  const registration = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: deps }), undefined, { contributions })
    .find(tool => tool.descriptor.id === "pages_read_html");
  assert.ok(registration);
  const call = (input: unknown) => invokeRegisteredTool(registration, {
    executionId: "page-batch", principal: { id: principalId }, run: { id: "run" }, input,
    signal: new AbortController().signal,
  } satisfies ToolExecutionContext);
  return { registration, call, checks, repo, denySecond: () => { deniedCheck = 2; }, denyAll: () => { denyAll = true; } };
}

test("pages_read_html resolves slash-prefixed slugs and home after authorization", async () => {
  const h = await harness({ resolveTargets: true });
  const result = await h.call({ items: [{ slug: "first" }, { slug: " /FIRST " }, { slug: "/" }] }) as BatchResult;
  assert.deepEqual([result.succeeded, result.failed], [3, 0]);
  assert.deepEqual(result.results.map(item => item.ok && (item.result as { id: string }).id), ["first", "first", "home"]);
  assert.ok(h.checks.length >= 3);
  const denied = await harness({ resolveTargets: true });
  denied.denyAll();
  const lookups: string[] = [];
  const findBySlug = denied.repo.findBySlug.bind(denied.repo);
  denied.repo.findBySlug = async input => { lookups.push(input.slug); return findBySlug(input); };
  const blocked = await denied.call({ items: [{ slug: "/first" }, { slug: "/missing" }] }) as BatchResult;
  assert.deepEqual([blocked.succeeded, blocked.failed], [0, 2]);
  assert.deepEqual(lookups, [], "denied selectors must never reach slug lookup");
});

// Removing the pages_read_html opt-in must reject these calls on HEAD, before any batch result.
test("pages_read_html returns three stored HTML documents in one batch", async () => {
  const h = await harness();
  const result = await h.call({ items: [{ id: "first" }, { id: "second" }, { id: "third" }] }) as BatchResult;
  assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 3, 0]);
  assert.deepEqual(result.results.map(item => {
    if (!item.ok) return item;
    const { id, html } = item.result as { id: string; html: string };
    return { index: item.index, id, html };
  }), [
    { index: 0, id: "first", html: "<main>first</main>" },
    { index: 1, id: "second", html: "<main>second</main>" },
    { index: 2, id: "third", html: "<main>third</main>" },
  ]);
  assert.equal(h.checks.length, 3);
  assert.equal(h.registration.descriptor.readOnly, true);
  const schema = h.registration.descriptor.inputSchema as { properties: { items: { maxItems: number } } };
  assert.equal(schema.properties.items.maxItems, 25);
});

for (const [name, item, error] of [
  ["missing id field", {}, /'id' \(non-empty string\) is required/],
  ["nonexistent page", { id: "missing" }, /^PAGES_NOT_FOUND:/],
] as const) test(`pages_read_html isolates a ${name} and reads the following item`, async () => {
  const h = await harness();
  const result = await h.call({ items: [{ id: "first" }, item, { id: "third" }] }) as BatchResult;
  assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 2, 1]);
  assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
  const failed = result.results[1]!;
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, error);
  assert.deepEqual(result.results.filter(item => item.ok).map(item => (item.result as { html: string }).html), ["<main>first</main>", "<main>third</main>"]);
});

test("pages_read_html authorizes each batch item and isolates a permission denial", async () => {
  const h = await harness();
  h.denySecond();
  const result = await h.call({ items: [{ id: "first" }, { id: "second" }, { id: "third" }] }) as BatchResult;
  assert.deepEqual([result.succeeded, result.failed], [2, 1]);
  assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
  assert.equal(h.checks.length, 3);
  assert.deepEqual(result.results.filter(item => item.ok).map(item => (item.result as { html: string }).html), ["<main>first</main>", "<main>third</main>"]);
});

test("pages_read_html rejects more than 25 items before authorization", async () => {
  const h = await harness();
  await assert.rejects(h.call({ items: Array.from({ length: 26 }, () => ({ id: "first" })) }), {
    message: "pages_read_html: 'items' has 26 entries; the most one call takes is 25. Split them into several calls.",
  });
  assert.deepEqual(h.checks, []);
});

test("pages_read_html scopes shared and overridden sites per item and continues after an unknown site", async t => {
  const f = await peerFixture(t);
  const result = await f.call("pages_read_html", { site: "B", items: [
    { id: "page" }, { site: "unknown-site", id: "page" }, { site: "B", id: "page" },
  ] }) as BatchResult;
  assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 2, 1]);
  assert.deepEqual(result.results.map(item => item.ok), [true, false, true]);
  assert.deepEqual(result.results.filter(item => item.ok).map(item => (item.result as { html: string }).html), ["<main>B page</main>", "<main>B page</main>"]);
  const failed = result.results[1]!;
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, /No readable local site has that name/);
  assert.equal(f.audits.length, 2);
  assert.equal((f.b.db.$client.prepare("SELECT COUNT(*) AS n FROM agent_tool_attempts").get() as { n: number }).n, 0);
});

test("pages_read_html refuses every non-owner cross-site batch item before opening peer databases", async t => {
  const f = await peerFixture(t);
  const result = await f.call("pages_read_html", { site: "B", items: [{ id: "page" }, { id: "missing" }, { id: "page" }] }, "admin") as BatchResult;
  assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 3, 0, 3]);
  assert.deepEqual(result.results, [0, 1, 2].map(index => ({ index, ok: false, error: "Only this installation's owner can read other sites." })));
  assert.deepEqual(f.contentHandles, []);
  assert.deepEqual(f.audits, []);
});

test("scalar content readers retain batching after the production read-card collapse", async t => {
  const f = await peerFixture(t);
  const registrations = f.build(true);
  for (const id of ["pages_read_html", "forms_get_submission"]) {
    const registration = registrations.find(tool => tool.descriptor.id === id);
    assert.ok(registration, id);
    assert.equal(registration.descriptor.readOnly, true, id);
    const result = await invokeRegisteredTool(registration, {
      executionId: "scalar-batch", principal: { id: f.a.ownerId }, run: { id: "run" },
      input: { items: [{}, {}] }, signal: new AbortController().signal,
    }) as BatchResult;
    assert.deepEqual([result.batch, result.total, result.succeeded, result.failed], [true, 2, 0, 2], id);
    assert.deepEqual(result.results.map(item => item.ok), [false, false], id);
  }
});
