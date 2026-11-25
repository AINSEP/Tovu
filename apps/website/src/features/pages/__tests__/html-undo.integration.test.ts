import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createContributionRegistry, type ToolContributor as OwnedToolContributor, type DerivedToolContributor as OwnedDerivedToolContributor, type ToolRegistration } from "@jini-ai/core";
import { RevertConflictError } from "@jini-ai/cms/core/commands";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import express from "express";

import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createPost } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { registerAdminChangeSetRevertRoute } from "#src/server/runtime/composition/modules/change-sets";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
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

type Surfaces = { surfaceExchanges: ReturnType<typeof createSurfaceExchangeStore> };

function toolsFor(deps: RootDeps, authorize: Authorize, surfaces: Surfaces): Map<string, ToolRegistration> {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const registrations = buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter, authorize } as AssistantToolRegistryDeps, { surfaces, options: { contributions } });
  return new Map(registrations.map((r) => [r.descriptor.id, r]));
}

/**
 * Runs one real tool call. `change_sets_revert` goes through the real human-confirmation exchange:
 * the channel answers `confirm` for the calling principal only, so the Undo under test is the
 * confirmed path production takes, never a bypass of the approval gate.
 */
async function call(deps: RootDeps, toolId: string, input: Record<string, unknown>, authorize: Authorize = allowAll): Promise<Record<string, unknown>> {
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  const registration = toolsFor(deps, authorize, surfaces).get(toolId);
  assert.ok(registration, `${toolId} must be registered`);
  executions += 1;
  const ctx = { executionId: `exec-undo-${executions}`, principal: { id: PRINCIPAL }, run: { id: "run-undo" }, input, signal: new AbortController().signal };
  const emitSurface = async () => {
    const exchangeId = surfaces.surfaceExchanges.findTypedAnswerTarget({ principalId: PRINCIPAL, toolId });
    assert.ok(exchangeId, "confirmation must open a principal-bound exchange");
    assert.deepEqual(surfaces.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { decision: "confirm" } }, { toolId }), { ok: true });
  };
  return (await registration.handler(ctx, { emitSurface })) as Record<string, unknown>;
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

async function sqliteRoot(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-html-undo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db") });
  await deps.identityReady;
  return deps;
}

/**
 * FIX 11: only roots with one rollback boundary over the page write and its change-set record run
 * the recorded-write cases. The in-memory root binds `recordedHtmlWrites: "disabled"` (pinned below).
 */
const ROOTS: Array<[string, (t: TestContext) => Promise<RootDeps>]> = [
  ["sqlite root", sqliteRoot],
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

  // The gateway's version preflight is not the only guard: the reverter's own restore keeps the
  // recorded version as its compare-and-set basis, so a save that lands after the preflight (or a
  // caller that skips it) still cannot be overwritten with raw HTML.
  test(`${label}: the reverter itself refuses a page that moved past the recorded version`, async (t) => {
    const deps = await makeRoot(t);
    const version = await seedPage(deps, "p-own-cas", RAW_PRIOR);
    const written = await call(deps, "pages_write_html", { id: "p-own-cas", html: NEXT, expectedVersion: version });
    const item = (await deps.changeSets.findById({ workspaceId: deps.workspaceId, id: written.changeSetId as string }))?.items[0];
    assert.ok(item);
    await humanSave(deps, "p-own-cas", NEWER);
    const reverter = createPageHtmlReverter({ store: deps.pagesHtmlStore, postRepo: deps.postRepo });
    await assert.rejects(reverter.applyInverse({ workspaceId: deps.workspaceId, item }, { actorId: PRINCIPAL }), RevertConflictError);
    assert.equal((await row(deps, "p-own-cas")).bodyHtml, NEWER);
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
  const deps = await sqliteRoot(t);
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

test("sqlite root: a failure after the HTML write leaves page, revisions, events and change sets unchanged (FIX 11)", async (t) => {
  const deps = await sqliteRoot(t);
  const version = await seedPage(deps, "p-sql-after", RAW_PRIOR);
  const revisionsBefore = await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-sql-after" });
  const drain = () => deps.outbox.claimPending({ batchSize: 1000, nowIso: "2999-01-01T00:00:00.000Z" });
  await drain();
  const realStore = deps.pagesHtmlStore;
  let landed = false;
  // The store's write (row, revision, events) completes, then the operation fails inside the transaction.
  deps.pagesHtmlStore = (scope, options) => {
    const store = realStore(scope, options);
    const write = store.write.bind(store);
    store.write = async (...args: Parameters<typeof write>) => { await write(...args); landed = true; throw new Error("injected failure after the HTML write"); };
    return store;
  };
  t.after(() => { deps.pagesHtmlStore = realStore; });

  await assert.rejects(call(deps, "pages_write_html", { id: "p-sql-after", html: NEXT, expectedVersion: version }), /injected failure after the HTML write/);
  assert.ok(landed, "the HTML write itself completed before the failure");
  const after = await row(deps, "p-sql-after");
  assert.equal(after.bodyHtml, RAW_PRIOR, "rolled back: the post row");
  assert.equal(after.version, version, "rolled back: the version");
  assert.deepEqual(await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: "p-sql-after" }), revisionsBefore, "rolled back: revisions");
  assert.deepEqual(await drain(), [], "rolled back: events");
  assert.equal((await pageHtmlSets(deps)).length, 0, "no change set recorded");
});

/**
 * The in-memory root has no shared rollback boundary between the page write and its change-set
 * record (`InMemoryPostRepo.transaction` snapshots posts, revisions and autosaves only; Jini's
 * `InMemoryChangeSetRepo.insert` pushes rows before awaiting the outbox), which once left an orphan
 * change set. FIX 11: the memory composition binds `recordedHtmlWrites: "disabled"`, so every
 * recorded HTML write refuses before anything is opened, written or recorded.
 */
async function memoryUnchanged(deps: ReturnType<typeof createRouteDeps>, id: string) {
  return {
    row: await row(deps, id),
    revisions: await deps.postRepo.listRevisions({ workspaceId: deps.workspaceId, postId: id }),
    events: await deps.outbox.claimPending({ batchSize: 1000, nowIso: "2999-01-01T00:00:00.000Z" }),
    sets: (await pageHtmlSets(deps)).length,
  };
}

test("memory root: recorded HTML write is unavailable, page/revisions/events unchanged (FIX 11, M html-record-no-rollback)", async () => {
  const deps = createRouteDeps();
  const version = await seedPage(deps, "p-mem-off", RAW_PRIOR);
  const before = await memoryUnchanged(deps, "p-mem-off");
  await assert.rejects(call(deps, "pages_write_html", { id: "p-mem-off", html: NEXT, expectedVersion: version }), /not available.*Nothing was written/s);
  const after = await memoryUnchanged(deps, "p-mem-off");
  assert.equal(after.row.bodyHtml, RAW_PRIOR);
  assert.equal(after.row.version, version);
  assert.deepEqual(after.revisions, before.revisions);
  assert.deepEqual(after.events, [], "no event queued by a refused write");
  assert.equal(after.sets, 0, "no change set recorded");
});

test("memory root: section writes and moves are unavailable too; nothing is written or recorded (FIX 11)", async () => {
  const deps = createRouteDeps();
  const version = await seedPage(deps, "p-mem-region", TWO);
  const before = await memoryUnchanged(deps, "p-mem-region");
  await assert.rejects(call(deps, "pages_write_region", { id: "p-mem-region", regionId: "a", html: "<p>Z</p>", expectedVersion: version }), /not available/);
  await assert.rejects(call(deps, "pages_move_region", { id: "p-mem-region", regionId: "a", after: "b", expectedVersion: version }), /not available/);
  const after = await memoryUnchanged(deps, "p-mem-region");
  assert.equal(after.row.bodyHtml, TWO);
  assert.equal(after.row.version, version);
  assert.deepEqual(after.revisions, before.revisions);
  assert.deepEqual(after.events, []);
  assert.equal(after.sets, 0);
});

/**
 * The mounted admin endpoint over the real sqlite root (FIX 11: memory records no HTML writes): the outer `changeset.revert` grant is
 * not raw-HTML write authority, and an operator force never overwrites a newer save with raw HTML.
 * The policy comes from the registered `page-html` reverter, never from the request body.
 */
async function mountedRevert(t: TestContext, authorize: Authorize) {
  const routeErrors = createRouteIncidentReporter().errors;
  const deps = await sqliteRoot(t);
  deps.authorize = authorize;
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ errors: routeErrors, app, deps });
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminChangeSetRevertRoute({ errors: routeErrors, app, deps });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const revert = (changeSetId: string, body: Record<string, unknown> = {}) => fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/change-sets/${changeSetId}/revert`, {
    method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { deps, revert };
}

test("mounted admin revert: a caller with changeset.revert but without pages.edit_html gets 403 and the HTML stays", async (t) => {
  const noHtml: Authorize = async ({ permission }) => ({ allowed: permission !== "pages.edit_html", reason: "test" });
  const { deps, revert } = await mountedRevert(t, noHtml);
  const version = await seedPage(deps, "p-http-perm", RAW_PRIOR);
  const written = await call(deps, "pages_write_html", { id: "p-http-perm", html: NEXT, expectedVersion: version });
  const res = await revert(written.changeSetId as string);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.ok(!JSON.stringify(body).includes("<h1>"), "no stored HTML in the refusal");
  assert.equal((await row(deps, "p-http-perm")).bodyHtml, NEXT);
  assert.equal((await deps.changeSets.findById({ workspaceId: deps.workspaceId, id: written.changeSetId as string }))?.changeSet.status, "applied");
});

test("mounted admin revert: force on a stale page-html change is 403 with plain recovery words and keeps the newer HTML", async (t) => {
  const { deps, revert } = await mountedRevert(t, allowAll);
  const version = await seedPage(deps, "p-http-force", RAW_PRIOR);
  const written = await call(deps, "pages_write_html", { id: "p-http-force", html: NEXT, expectedVersion: version });
  await humanSave(deps, "p-http-force", NEWER);
  const res = await revert(written.changeSetId as string, { force: true });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /can't be forced back over a newer version/);
  assert.match(body.error, /edit it again/);
  assert.equal((await row(deps, "p-http-force")).bodyHtml, NEWER);
  assert.equal((await deps.changeSets.findById({ workspaceId: deps.workspaceId, id: written.changeSetId as string }))?.changeSet.status, "applied");
});
