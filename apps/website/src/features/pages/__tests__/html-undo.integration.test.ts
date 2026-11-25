import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createContributionRegistry, type ToolContributor as OwnedToolContributor, type DerivedToolContributor as OwnedDerivedToolContributor, type ToolRegistration } from "@jini-ai/core";
import { RevertConflictError } from "@jini-ai/cms/core/commands";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createPost } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { createPageHtmlReverter } from "../html-reverter.js";
import type { PagesHtmlDocumentStorePort } from "../html-document-store.js";

/**
 * @file P1-T2.T — every real assistant HTML write earns exactly one scoped `page-html` change set,
 * and `change_sets_revert` restores the exact prior body (never a normalized or rendered copy).
 * Runs against both real composition roots and the real first-party tool registry, so the
 * transaction, store and reverter under test are the ones production wires.
 */

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
};

type RootDeps = ReturnType<typeof createRouteDeps> | Awaited<ReturnType<typeof createSiteRouteDeps>>;
type Authorize = AssistantToolRegistryDeps["authorize"];

const PRINCIPAL = "principal-html-undo";
const allowAll: Authorize = async () => ({ allowed: true, reason: "test" });
// Stored HTML that today's write path would rewrite (`&quot;` embed config gets re-quoted): the
// inverse must keep it byte for byte, or the undo restores something nobody ever saved.
const RAW_PRIOR = `<section data-agent-element="hero" data-agent-role="region"><div data-embed-type="form" data-embed-config="{&quot;a&quot;:1}"></div><h1>Old</h1></section>`;
const NEXT = `<section data-agent-element="hero" data-agent-role="region"><h1>New</h1></section>`;
const NEWER = `<section data-agent-element="hero" data-agent-role="region"><h1>Human</h1></section>`;
const TWO = `<section data-agent-element="a" data-agent-role="region"><p>A</p></section><section data-agent-element="b" data-agent-role="region"><p>B</p></section>`;
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

let executions = 0;

function toolsFor(deps: RootDeps, authorize: Authorize = allowAll): Map<string, ToolRegistration> {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const registrations = buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter, authorize } as AssistantToolRegistryDeps, { surfaces: undefined, options: { contributions } });
  return new Map(registrations.map((r) => [r.descriptor.id, r]));
}

async function call(deps: RootDeps, toolId: string, input: Record<string, unknown>, authorize: Authorize = allowAll): Promise<Record<string, unknown>> {
  const registration = toolsFor(deps, authorize).get(toolId);
  assert.ok(registration, `${toolId} must be registered`);
  executions += 1;
  const ctx = { executionId: `exec-undo-${executions}`, principal: { id: PRINCIPAL }, run: { id: "run-undo" }, input, signal: new AbortController().signal };
  return (await registration.handler(ctx)) as Record<string, unknown>;
}

async function row(deps: RootDeps, id: string) {
  const found = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id });
  assert.ok(found);
  return found;
}

async function seedPage(deps: RootDeps, id: string, html?: string): Promise<number> {
  await createPost({ deps: { repo: deps.postRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id, title: "Landing", kind: "page", bodyJson: DOC } });
  const created = await row(deps, id);
  if (html === undefined) return created.version;
  const { applied } = await deps.postRepo.saveIfVersion({ record: { ...created, bodyFormat: "html", bodyHtml: html, version: created.version + 1 }, ifVersion: created.version });
  assert.ok(applied);
  return created.version + 1;
}

async function humanSave(deps: RootDeps, id: string, html: string): Promise<void> {
  const store = deps.pagesHtmlStore({ workspaceId: deps.workspaceId, postId: id, actorId: "human" });
  await store.read();
  await store.write({ html });
}

async function pageHtmlSets(deps: RootDeps) {
  const all = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
  const withItems = await Promise.all(all.map((record) => deps.changeSets.findById({ workspaceId: deps.workspaceId, id: record.id })));
  return withItems.filter((set) => set?.items.some((item) => item.entityType === "page-html"));
}

const ROOTS: Array<[string, (t: TestContext) => Promise<RootDeps>]> = [
  ["in-memory root", async () => createRouteDeps()],
  ["sqlite root", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-html-undo-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db") });
    await deps.identityReady;
    return deps;
  }],
];

for (const [label, makeRoot] of ROOTS) {
  test(`${label}: an assistant full write records one change set and change_sets_revert restores the earlier HTML byte for byte`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-full", RAW_PRIOR);
    const written = await call(deps, "pages_write_html", { id: "p-full", html: NEXT, expectedVersion: version });
    assert.equal(written.written, true);
    assert.equal(typeof written.changeSetId, "string", "a committed write names its Undo");
    assert.equal((await pageHtmlSets(deps)).length, 1);

    const reverted = await call(deps, "change_sets_revert", { changeSetId: written.changeSetId });
    assert.equal(reverted.reverted, true);
    const after = await row(deps, "p-full");
    assert.equal(after.bodyHtml, RAW_PRIOR, "restored verbatim, never normalized");
    assert.equal(after.version, version + 2);
  });

  test(`${label}: a section write and a section move each revert to the exact prior HTML`, async (t) => {
    const deps = await makeRoot(t);
    const v1 = await seedPage(deps, "p-reg", TWO);
    const region = await call(deps, "pages_write_region", { id: "p-reg", regionId: "a", html: "<p>A2</p>", expectedVersion: v1 });
    assert.equal(typeof region.changeSetId, "string");
    assert.equal((await call(deps, "change_sets_revert", { changeSetId: region.changeSetId })).reverted, true);
    assert.equal((await row(deps, "p-reg")).bodyHtml, TWO);

    const v2 = (await row(deps, "p-reg")).version;
    const moved = await call(deps, "pages_move_region", { id: "p-reg", regionId: "a", after: "b", expectedVersion: v2 });
    assert.equal(moved.written, true);
    assert.equal(typeof moved.changeSetId, "string");
    assert.equal((await call(deps, "change_sets_revert", { changeSetId: moved.changeSetId })).reverted, true);
    assert.equal((await row(deps, "p-reg")).bodyHtml, TWO);
  });

  test(`${label}: a first full HTML write preserves the prior doc for scoped undo`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-doc");
    const written = await call(deps, "pages_write_html", { id: "p-doc", html: NEXT, expectedVersion: version });
    assert.equal((await row(deps, "p-doc")).bodyFormat, "html");
    assert.equal((await call(deps, "change_sets_revert", { changeSetId: written.changeSetId })).reverted, true);
    const after = await row(deps, "p-doc");
    assert.equal(after.bodyFormat, "doc");
    assert.deepEqual(after.bodyJson, DOC, "the exact doc body, not rendered HTML");
    assert.ok(after.bodyHtml === null || after.bodyHtml === undefined);
  });

  test(`${label}: revert after a human save is refused and keeps the newer HTML`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-stale", RAW_PRIOR);
    const written = await call(deps, "pages_write_html", { id: "p-stale", html: NEXT, expectedVersion: version });
    await humanSave(deps, "p-stale", NEWER);
    const reverted = await call(deps, "change_sets_revert", { changeSetId: written.changeSetId });
    assert.equal(reverted.reverted, false);
    assert.equal(reverted.code, "REVERT_CONFLICT");
    assert.equal((await row(deps, "p-stale")).bodyHtml, NEWER);
  });

  test(`${label}: a human save between revert preflight and the restore CAS also wins`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-race", RAW_PRIOR);
    const written = await call(deps, "pages_write_html", { id: "p-race", html: NEXT, expectedVersion: version });
    const set = await deps.changeSets.findById({ workspaceId: deps.workspaceId, id: written.changeSetId as string });
    const item = set?.items[0];
    assert.ok(item);
    const racingStore = (scope: Parameters<typeof deps.pagesHtmlStore>[0]) => {
      const real = deps.pagesHtmlStore(scope);
      return { restore: async (required: Parameters<NonNullable<PagesHtmlDocumentStorePort["restore"]>>[0]) => {
        await humanSave(deps, "p-race", NEWER);
        return real.restore!(required);
      } } as unknown as PagesHtmlDocumentStorePort;
    };
    const reverter = createPageHtmlReverter({ store: racingStore, postRepo: deps.postRepo });
    await assert.rejects(reverter.applyInverse({ workspaceId: deps.workspaceId, item }, { actorId: PRINCIPAL }), (err: unknown) => {
      assert.ok(err instanceof RevertConflictError);
      assert.match(err.message, /changed/i);
      return true;
    });
    assert.equal((await row(deps, "p-race")).bodyHtml, NEWER);
  });

  test(`${label}: matching live HTML at the recorded version reverts the change set without bumping the page`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-same", RAW_PRIOR);
    const revisionsBefore = (await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-same" })).length;
    const reverter = createPageHtmlReverter({ store: deps.pagesHtmlStore, postRepo: deps.postRepo });
    const item = { id: "i1", changeSetId: "c1", entityType: "page-html", entityId: "p-same", operation: "update" as const, position: 0, entityVersionAtApply: version, inversePayload: { format: "html", html: RAW_PRIOR } };
    await reverter.applyInverse({ workspaceId: deps.workspaceId, item }, { actorId: PRINCIPAL });
    const after = await row(deps, "p-same");
    assert.equal(after.version, version);
    assert.equal(after.bodyHtml, RAW_PRIOR);
    assert.equal((await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-same" })).length, revisionsBefore);
  });

  test(`${label}: a refused or unchanged write records no change set`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-noop", NEXT);
    const same = await call(deps, "pages_write_html", { id: "p-noop", html: NEXT, expectedVersion: version });
    assert.equal(same.written, true);
    assert.equal(same.changeSetId, undefined, "no committed record, no Undo claim");
    const refused = await call(deps, "pages_write_html", { id: "p-noop", html: NEXT + NEXT, expectedVersion: version });
    assert.equal(refused.written, false);
    assert.equal((await pageHtmlSets(deps)).length, 0);
    assert.equal((await row(deps, "p-noop")).version, version);
  });

  test(`${label}: a caller with changeset.revert but without pages.edit_html cannot restore raw HTML`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-perm", RAW_PRIOR);
    const written = await call(deps, "pages_write_html", { id: "p-perm", html: NEXT, expectedVersion: version });
    const noHtml: Authorize = async ({ permission }) => ({ allowed: permission !== "pages.edit_html", reason: "test" });
    const reverted = await call(deps, "change_sets_revert", { changeSetId: written.changeSetId }, noHtml);
    assert.equal(reverted.reverted, false);
    assert.equal(reverted.code, "REVERT_NOT_ALLOWED");
    assert.equal((await row(deps, "p-perm")).bodyHtml, NEXT);
  });

  test(`${label}: change_sets_list omits the stored page HTML inverse`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-list", RAW_PRIOR);
    await call(deps, "pages_write_html", { id: "p-list", html: NEXT, expectedVersion: version });
    const listed = JSON.stringify(await call(deps, "change_sets_list", {}));
    assert.ok(!listed.includes("inversePayload"));
    assert.ok(!listed.includes("<h1>Old</h1>"), "the prior raw HTML never reaches the model-facing list");
  });
}

test("sqlite root: change-set insert failure leaves the row, version, revisions, references and outbox unchanged", async (t) => {
  const deps = (await ROOTS[1]![1](t)) as Awaited<ReturnType<typeof createSiteRouteDeps>>;
  const version = await seedPage(deps, "p-fail", RAW_PRIOR);
  const revisionsBefore = await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-fail" });
  const refsBefore = await deps.entryRefsRepo.findBySource({ workspaceId: deps.workspaceId, sourceEntryId: "p-fail" });
  // Drain what seeding queued, so anything pending afterwards could only have come from the failed write.
  const drain = () => deps.outbox.claimPending({ batchSize: 1000, nowIso: "2999-01-01T00:00:00.000Z" });
  await drain();
  const realInsert = deps.changeSets.insert.bind(deps.changeSets);
  deps.changeSets.insert = async () => { throw new Error("injected change-set insert failure"); };
  t.after(() => { deps.changeSets.insert = realInsert; });

  await assert.rejects(call(deps, "pages_write_html", { id: "p-fail", html: NEXT, expectedVersion: version }));
  const after = await row(deps, "p-fail");
  assert.equal(after.bodyHtml, RAW_PRIOR);
  assert.equal(after.version, version);
  assert.deepEqual(await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-fail" }), revisionsBefore);
  assert.deepEqual(await deps.entryRefsRepo.findBySource({ workspaceId: deps.workspaceId, sourceEntryId: "p-fail" }), refsBefore);
  assert.deepEqual(await drain(), [], "no outbox row survives the rolled-back write");
});
