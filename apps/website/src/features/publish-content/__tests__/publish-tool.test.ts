import assert from "node:assert/strict";
import { NO_INCIDENT_REPORTER } from "#src/server/__tests__/helpers/composed-reporter-probe";
import test from "node:test";
import { ToolInputError, ToolPermissionDeniedError } from "@jini-ai/core";
import { plan, confirm, execute, PlanStaleError } from "../../../contracts/core/gated-mutations/gateway.js";
import { importErrorResponse } from "../../../server/inbound/admin-http/routes/publish-content/import-errors.js";
import { stageBundle } from "@jini-ai/cms/publish/transfer";
import { buildPublishContentImportHooks } from "@jini-ai/cms/publish/content/gated-hooks";
import { contentHash } from "@jini-ai/cms/publish/content/content-hash";
import { contributePublishContentTools } from "../tool-registrations.js";
import { buildPublishContentCatalog, registerPublishContentContributor, resetPublishContentContributorsForTests } from "../type-registry.js";
import { planHashOf, resolveActorClassIdentity } from "../../../contracts/core/gated-mutations/composition.js";
import type { PackedEntity } from "@jini-ai/cms/publish/transfer";
import { fixture as pullFixture, context, tool, OWNER } from "./pull-tool-fixture.js";
import type { PublishContentReport } from "@jini-ai/cms/publish/content/plan-rows";
import { planPublishToPeer } from "../push-plan.js";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { applyToolApprovalPolicy } from "../../../assistant/tool-approval-policy.js";

const ID = "publish_content_publish";
function post(id: string, title: string): PackedEntity {
  const state = { title, slug: title.toLowerCase().replaceAll(" ", "-"), status: "published", deletedAt: null };
  return { entityType: "post", id, schemaVersion: 1, hashVersion: 1, state,
    contentHash: contentHash({ entityType: "post", state }), requiredBlobs: [] };
}

/** A fake network adapter hosts the real staging, planner, gateway and single-use token store.
 * Fakes implement ports; no module mocks. Captures bundles to prove exclusions never reach apply. */
async function fixture(entities = [post("one", "How Tovu Saves You Time"), post("two", "Contact")]) {
  const f = await pullFixture(entities);
  const staged: PackedEntity[][] = [];
  const applied: PublishContentReport[] = [];
  let activeBundle = "";
  let planCount = 0;
  let confirms = 0;
  let executes = 0;
  let beforePlan: ((count: number) => void) | undefined;
  let beforeExecute: (() => void) | undefined;
  let downgrade: string | undefined;
  let legacy = false;
  resetPublishContentContributorsForTests();
  // One contributor per advertised type, each packing only its own entities, so a fixture can hold a
  // page and a same-title post side by side.
  const entityTypes = [...new Set(entities.map(entity => entity.entityType))];
  let supportedTypes = entityTypes;
  for (const entityType of entityTypes) registerPublishContentContributor({
    contributor: { entityType, dependsOn: [], build: () => ({
      entityType, schemaVersion: 1, permission: "content.write", dependsOn: [],
      pack: async function* () { yield* entities.filter(entity => entity.entityType === entityType); },
      inspect: async ({ id }) => f.destination.get(id) ?? null,
      precheck: async () => null,
      apply: async () => { throw new Error("use apply port"); },
    }) }
  });
  f.deps.fileBlobIndex = new Map();
  f.deps.blobStore.get = async () => new Uint8Array();
  const hooks = (bundleId: string, overwrite?: string[]) => buildPublishContentImportHooks({
    workspaceId: "local", bundleId, actorId: OWNER, clock: f.deps.clock, idGen: f.deps.idGen,
    planHashOf, resolveActorClassIdentity, catalog: { build: buildPublishContentCatalog },
    publishContentDeps: { workspaceId: "local", clock: f.deps.clock, idGen: f.deps.idGen, ports: {} },
    bundleRepo: f.bundleRepo, baselineRepo: f.baselineRepo, blobStore: f.deps.blobStore,
    dbOps: f.deps.dbOps, restorePointsRepo: f.deps.restorePointsRepo,
    forcedEntityKeys: overwrite ? new Set(overwrite) : undefined,
    applyPort: { applyReport: async ({ report }) => {
      const actual: PublishContentReport = { ...report, rows: report.rows.map(row => row.entityId === downgrade
        ? { ...row, outcome: "conflict", writes: false, reason: "Concurrent edit on live." } : row) };
      applied.push(actual);
      return { ...(legacy ? {} : { report: actual }), runId: "remote-run", changeSetIds: actual.rows.filter(row => row.writes).map(row => `change-${row.entityId}`),
        retiredChangeSetIds: [], repointChangeSetIds: [], menuLinksUpdated: 0, menuLinksNotUpdated: [], verificationProblems: [] };
    } },
  });
  f.deps.publishContentPeerHttpClient = { send: async request => {
    assert.equal(request.headers?.authorization, "Bearer private-key");
    const path = new URL(request.url).pathname;
    const body = request.body === undefined ? {} : JSON.parse(String(request.body));
    let result: unknown;
    if (path.endsWith("/capabilities")) result = { entityTypes: supportedTypes, features: ["overwrite-live"] };
    else if (path.endsWith("/bundles")) {
      staged.push(body.entities);
      result = await stageBundle({
                                   input: { ...body, workspaceId: "local", sourcePrincipalId: OWNER },
                                   deps: { repo: f.bundleRepo, clock: f.deps.clock, idGen: f.deps.idGen }
                                 });
      activeBundle = (result as { bundleId: string }).bundleId;
    } else if (path.endsWith("/import/plan")) {
      beforePlan?.(++planCount);
      result = await plan({ deps: f.deps.gatedMutations.gatewayDeps, principalId: OWNER, principalKind: "user", hooks: hooks(body.bundleId, body.overwriteEntityKeys) });
    } else if (path.endsWith("/import/confirm")) {
      confirms++;
      result = await confirm({ deps: f.deps.gatedMutations.gatewayDeps, principalId: OWNER, principalKind: "user", hooks: hooks(activeBundle), planId: body.planId, planHash: body.planHash });
    } else if (path.endsWith("/import/execute")) {
      executes++;
      beforeExecute?.();
      try {
        result = await execute({ deps: f.deps.gatedMutations.gatewayDeps, principalId: OWNER, principalKind: "user", hooks: hooks(body.bundleId, body.overwriteEntityKeys), confirmationToken: body.confirmationToken });
      } catch (error) {
        if (!(error instanceof PlanStaleError)) throw error;
        // The real peer turns a stale plan into an HTTP refusal instead of a network failure.
        const refusal = importErrorResponse({ err: error }, { reporter: NO_INCIDENT_REPORTER });
        return { status: refusal.status, headers: {}, bodyText: JSON.stringify(refusal.body) };
      }
    } else throw new Error(`unexpected peer call: ${path}`);
    return { status: 200, headers: {}, bodyText: JSON.stringify(result) };
  } };
  return { ...f, staged, applied, counts: () => ({ confirms, executes }), setBeforePlan: (fn: typeof beforePlan) => { beforePlan = fn; },
    setBeforeExecute: (fn: typeof beforeExecute) => { beforeExecute = fn; }, setDowngrade: (id: string) => { downgrade = id; }, setLegacy: () => { legacy = true; }, setSupportedTypes: (types: string[]) => { supportedTypes = types; } };
}
async function publish(f: Awaited<ReturnType<typeof fixture>>, input = {}) {
  return (await tool(f.deps, ID)).handler(context(input)) as Promise<any>;
}

/** Inject only the remote execute response; planning and confirmation still use the real gateway. */
async function reportFixture({ report }: { report: unknown }, _options: Record<string, never> = {}) {
  const f = await fixture();
  const send = f.deps.publishContentPeerHttpClient!.send;
  f.deps.publishContentPeerHttpClient = { send: async request => {
    if (new URL(request.url).pathname.endsWith("/import/execute")) {
      return { status: 200, headers: {}, bodyText: JSON.stringify({ runId: "remote-run", report }) };
    }
    return send(request);
  } };
  return f;
}

const remoteRow = { entityType: "post", entityId: "one", outcome: "created", writes: true, reason: null };
for (const report of [null, false, 0, "report", []]) {
  test(`remote report ${JSON.stringify(report)} retains the exact missing-report error`, async () => {
    const f = await reportFixture({ report });
    await assert.rejects(() => publish(f), { constructor: ToolInputError, message: "The live site returned no publish report." });
  });
}

for (const report of [
  {}, { refused: 0, rows: [] }, { refused: false }, { refused: false, rows: {} },
  ...[null, false, {}, { ...remoteRow, entityType: 1 }, { ...remoteRow, entityId: 1 },
    { ...remoteRow, writes: "true" }, { ...remoteRow, outcome: "unknown" },
    ...["created", "applied", "forced"].map(outcome => ({ ...remoteRow, outcome, writes: false })),
    ...["unchanged", "conflict", "blocked"].map(outcome => ({ ...remoteRow, outcome, writes: true })),
  ].map(row => ({ refused: false, rows: [remoteRow, row] })),
  { refused: true, refusalReason: "Do not use this before validating rows.", rows: [null] },
]) {
  test(`malformed remote report ${JSON.stringify(report)} retains the exact validation error`, async () => {
    const f = await reportFixture({ report });
    await assert.rejects(() => publish(f), { constructor: ToolInputError, message: "The live site returned an invalid publish report." });
  });
}

for (const outcome of ["created", "applied", "forced", "unchanged", "conflict", "blocked"]) {
  test(`a valid remote ${outcome} row preserves its actual outcome and optional-field compatibility`, async () => {
    const writes = ["created", "applied", "forced"].includes(outcome);
    const f = await reportFixture({ report: { refused: false, rows: [{ ...remoteRow, outcome, writes }] } });
    const result = await publish(f);
    assert.deepEqual(result.published.map((row: { entityKey: string; outcome: string }) => ({ entityKey: row.entityKey, outcome: row.outcome })),
      writes ? [{ entityKey: "post:one", outcome }] : []);
    assert.equal(result.unchanged.length, outcome === "unchanged" ? 1 : 0);
    assert.equal(result.skipped.some((row: { entityKey: string }) => row.entityKey === "post:one"), ["conflict", "blocked"].includes(outcome));
  });
}

for (const refusalReason of [undefined, null, "", "The destination refused this content."]) {
  test(`a refused remote report preserves refusal reason ${JSON.stringify(refusalReason)}`, async () => {
    const f = await reportFixture({ report: { refused: true, refusalReason, rows: [] } });
    await assert.rejects(() => publish(f), { constructor: ToolInputError, message: refusalReason ?? "The live site refused this publish." });
  });
}

test("publishes pending content without a UI card and returns live slug URLs", async () => {
  const f = await fixture();
  const result = await publish(f);
  assert.equal(result.published.length, 2);
  assert.equal(result.published[0].publicUrl, "https://live.example/how-tovu-saves-you-time");
  assert.match(result.message, /^Published 2 items/);
  assert.deepEqual(f.counts(), { confirms: 1, executes: 1 });
  assert.equal(contributePublishContentTools().risk.get(ID), "mutates-durable-state");
});

test("an absent input publishes exactly like an empty one", async () => {
  const f = await fixture();
  const result = await (await tool(f.deps, ID)).handler(context(undefined)) as { published: unknown[] };
  assert.equal(result.published.length, 2);
  assert.deepEqual(f.counts(), { confirms: 1, executes: 1 });
});

test("selects an exact title and excludes named items before staging the confirmed bundle", async () => {
  const f = await fixture();
  const result = await publish(f, { items: ["How Tovu Saves You Time", "Contact"], excludeItems: ["Contact"] });
  assert.deepEqual(f.staged.at(-1)?.map(entity => entity.id), ["one"]);
  assert.equal(result.published.length, 1);
  assert.equal(result.skipped[0].title, "contact");
  assert.match(result.skipped[0].reason, /Excluded/);
});

/** A page and a same-title post of a different type, both pending: only `page:one` is asked for. */
function pageAndNeighbour(): PackedEntity[] {
  const page = (id: string, title: string): PackedEntity => {
    const state = { title, slug: title.toLowerCase().replaceAll(" ", "-"), status: "published", deletedAt: null, kind: "page" };
    return { entityType: "page", id, schemaVersion: 1, hashVersion: 1, state, contentHash: contentHash({ entityType: "page", state }), requiredBlobs: [] };
  };
  return [page("one", "Pricing"), post("neighbour", "Pricing")];
}

test("one named item among other pending work → only that key reaches the confirmed plan", async () => {
  const f = await fixture(pageAndNeighbour());
  const result = await publish(f, { items: ["page:one"] });
  // The initial dry plan inspects both; the bundle that is confirmed carries the target alone.
  assert.deepEqual(f.staged.at(-1)?.map(({ entityType, id }) => `${entityType}:${id}`), ["page:one"]);
  assert.deepEqual(f.applied.at(-1)?.rows.filter(row => row.writes).map(row => `${row.entityType}:${row.entityId}`), ["page:one"]);
  assert.deepEqual(result.published.map((row: any) => row.entityKey), ["page:one"]);
  assert.deepEqual(result.published.map((row: any) => row.publicUrl), ["https://live.example/pricing"]);
  assert.deepEqual(f.counts(), { confirms: 1, executes: 1 });
});

/** The real registration, wrapped by the real approval policy, run through a real exchange store. */
async function approvalRun(f: Awaited<ReturnType<typeof fixture>>, decision: "confirm" | "cancel") {
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  const registry = createToolRegistry({});
  registry.register(applyToolApprovalPolicy({ registration: await tool(f.deps, ID, surfaces), surfaces }));
  let html = "";
  const pending = createToolExecutor({ registry }).execute({ toolId: ID, principal: { id: OWNER }, run: { id: "run" }, input: { items: ["page:one"] } }, {
    emitSurface: async emission => { html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text; },
  });
  // Bounded wait: a publish that skips the card must fail here, not hang the suite.
  for (let tick = 0; html === "" && tick < 200; tick++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.notEqual(html, "", "the approval card must open before anything is published");
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]!;
  const before = { staged: f.staged.length, applied: f.applied.length, ...f.counts() };
  const deliver = (principalId: string) => surfaces.surfaceExchanges.deliver({ exchangeId, principalId, params: { decision } }, { toolId: ID });
  return { html, pending, before, deliver };
}

test("publish_content_publish opens the approval card before any publish when the policy asks", async () => {
  const f = await fixture(pageAndNeighbour());
  const cancelled = await approvalRun(f, "cancel");
  assert.match(cancelled.html, /page:one/);
  assert.deepEqual(cancelled.before, { staged: 0, applied: 0, confirms: 0, executes: 0 });
  assert.equal(cancelled.deliver("intruder").ok, false);
  cancelled.deliver(OWNER);
  await cancelled.pending;
  assert.deepEqual([f.staged.length, f.applied.length, f.counts()], [0, 0, { confirms: 0, executes: 0 }]);

  const confirmed = await approvalRun(f, "confirm");
  assert.deepEqual(confirmed.before, { staged: 0, applied: 0, confirms: 0, executes: 0 });
  confirmed.deliver(OWNER);
  const result = await confirmed.pending;
  assert.equal(result.status, "completed");
  assert.deepEqual(f.applied.map(report => report.rows.filter(row => row.writes).map(row => `${row.entityType}:${row.entityId}`)), [["page:one"]]);
  assert.deepEqual(f.counts(), { confirms: 1, executes: 1 });
});

test("default skips conflicts; explicit overwrite forces only selected items", async () => {
  const f = await fixture();
  f.destination.set("one", { version: 1, hash: "live-edit", title: "Live edit" });
  const safe = await publish(f);
  assert.deepEqual(safe.published.map((row: any) => row.entityKey), ["post:two"]);
  assert.equal(safe.skipped[0].entityKey, "post:one");
  const forced = await publish(f, { items: ["How Tovu Saves You Time"], overwrite: true });
  assert.equal(forced.published[0].outcome, "forced");
  assert.deepEqual(f.applied.at(-1)?.rows.filter(row => row.writes).map(row => row.entityId), ["one"]);
});

test("overwrite plus exclusion never forces or applies the excluded item", async () => {
  const f = await fixture();
  f.destination.set("one", { version: 1, hash: "live-edit", title: "Live edit" });
  const result = await publish(f, { overwrite: true, excludeItems: ["How Tovu Saves You Time"] });
  assert.deepEqual(result.published.map((row: any) => row.entityKey), ["post:two"]);
  assert.equal(f.applied[0]?.rows.some(row => row.outcome === "forced"), false);
});

test("re-plan drift refuses before confirming or executing", async () => {
  const f = await fixture();
  f.destination.set("one", { version: 1, hash: "live-edit", title: "Live edit" });
  f.setBeforePlan(count => { if (count === 2) f.destination.set("two", { version: 1, hash: "other-live-edit", title: "Concurrent edit" }); });
  await assert.rejects(() => publish(f, { overwrite: true }), /changed while publishing/);
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
});

test("selection re-plan uses the same consistency check", async () => {
  const f = await fixture();
  f.setBeforePlan(count => { if (count === 2) f.destination.set("one", { version: 1, hash: "changed", title: "Changed" }); });
  await assert.rejects(() => publish(f, { items: ["How Tovu Saves You Time"] }), /changed while publishing/);
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
});

test("the destination gateway still rejects a stale plan at execute", async () => {
  const f = await fixture();
  f.setBeforeExecute(() => f.destination.set("one", { version: 1, hash: "changed", title: "Changed" }));
  await assert.rejects(() => publish(f), { constructor: ToolInputError, name: "ToolInputError", message: "the peer refused POST /api/admin/v1/workspaces/remote/publish-content/import/execute with HTTP 409. The destination changed since the plan was checked; check what would change again." });
  assert.equal(f.applied.length, 0);
});

test("actual apply-time skips are never claimed as published", async () => {
  const f = await fixture();
  f.setDowngrade("one");
  const result = await publish(f);
  assert.deepEqual(result.published.map((row: any) => row.entityKey), ["post:two"]);
  assert.equal(result.skipped[0].entityKey, "post:one");
  assert.match(result.skipped[0].reason, /Concurrent edit/);
});

test("older live builds report unverified outcomes honestly", async () => {
  const f = await fixture();
  f.setLegacy();
  const result = await publish(f);
  assert.deepEqual(result.published, []);
  assert.equal(result.unverified.length, 2);
  assert.match(result.message, /could not verify/);
});

test("an unmatched selection performs no confirm or execute", async () => {
  const f = await fixture();
  const result = await publish(f, { items: ["Missing"] });
  assert.deepEqual(result.unmatchedItems, ["Missing"]);
  assert.deepEqual(result.published, []);
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
  assert.equal(f.staged.length, 1, "only the initial plan is staged; no empty narrowed bundle reaches live");
});

test("permission and malformed input refuse the publish", async () => {
  const f = await fixture();
  f.denied.add("publish_content.apply");
  await assert.rejects(() => publish(f), { constructor: ToolPermissionDeniedError, name: "Error", message: "principal 'human-owner' is not authorized for 'publish_content.apply' (insufficient_permission)" });
  f.denied.clear();
  for (const input of [{ items: "Contact" }, { excludeItems: [""] }, { overwrite: "true" }, { confirm: true }]) {
    await assert.rejects(() => publish(f, input));
  }
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
  assert.equal(f.staged.length, 0);
});

test("already current selected items are returned as unchanged without executing", async () => {
  const f = await fixture();
  f.destination.set("one", { version: 1, hash: f.entities[0]!.contentHash, title: "Current" });
  const result = await publish(f, { items: ["How Tovu Saves You Time"] });
  assert.deepEqual(result.published, []);
  assert.equal(result.unchanged[0].entityKey, "post:one");
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
});


test("items unsupported by live are reported by name with a reason, without confirming", async () => {
  const f = await fixture();
  f.setSupportedTypes([]);
  const result = await publish(f, { items: ["How Tovu Saves You Time"] });
  assert.deepEqual(result.published, []);
  const heldBack = result.skipped.find((item: any) => item.entityKey === "post:one");
  assert.equal(heldBack.title, "How Tovu Saves You Time");
  assert.match(heldBack.reason, /does not support/);
  assert.deepEqual(result.unmatchedItems, []);
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
});

test("TW2 pins peer validation and empty selection without execution", async () => {
  const f = await fixture();
  for (const peerId of [null, 3, "", " "]) await assert.rejects(() => publish(f, { peerId }), /peerId/);
  const result = await publish(f, { excludeItems: ["How Tovu Saves You Time", "Contact"] });
  assert.deepEqual(result.published, []);
  assert.deepEqual(f.counts(), { confirms: 0, executes: 0 });
  assert.equal(result.skipped.length, 2);
});

test("planPublishToPeer labels an unnamed workspace by its id, honours a scope, and gives a URL only to routable posts", async () => {
  const unroutable = { ...post("draft", "Draft"), state: { title: "Draft", status: "draft", deletedAt: null } };
  const f = await fixture([post("one", "Kept Post"), post("out", "Out Of Scope"), unroutable]);
  const sourceLabels: unknown[] = [];
  const send = f.deps.publishContentPeerHttpClient!.send;
  f.deps.publishContentPeerHttpClient = { send: async request => {
    if (new URL(request.url).pathname.endsWith("/bundles")) sourceLabels.push(JSON.parse(String(request.body)).sourceLabel);
    return send(request);
  } };
  const credential = { id: "live", label: "Live site", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "private-key" };
  const result = await planPublishToPeer({
    deps: { ...f.deps, workspaceRepo: { findById: async () => null }, publishContentDeps: { workspaceId: "local", clock: f.deps.clock, idGen: f.deps.idGen, ports: {} } },
    peer: { credential, httpClient: f.deps.publishContentPeerHttpClient },
    principalId: OWNER,
  }, { scope: { entityKeys: ["post:one", "post:draft"] } });
  assert.deepEqual(sourceLabels, [f.deps.workspaceId]);
  assert.deepEqual(f.staged.at(-1)?.map(entity => entity.id), ["one", "draft"]);
  assert.deepEqual(Object.keys(result.publicUrls), ["post:one"]);
  assert.deepEqual(result.itemNames["post:draft"], ["Draft"]);
  assert.equal(result.entityCount, 2);
});

test("planPublishToPeer keys blob probes by this workspace's storage key and gives URLs only to post/page rows", async () => {
  const sha256 = "a".repeat(64);
  const withBlob = { ...post("one", "Has Image"), requiredBlobs: [sha256] };
  const page = { ...post("p", "A Page"), entityType: "page" };
  const note = { ...post("n", "A Note"), entityType: "note" };
  const f = await fixture([withBlob]);
  for (const extra of [page, note]) registerPublishContentContributor({
                                                                        contributor: { entityType: extra.entityType, dependsOn: [], build: () => ({
      entityType: extra.entityType, schemaVersion: 1, permission: "content.write", dependsOn: [],
      pack: async function* () { yield extra; },
      inspect: async () => null,
      precheck: async () => null,
      apply: async () => { throw new Error("not applied in a plan"); },
    }) }
                                                                      });
  const probed: unknown[] = [];
  const send = f.deps.publishContentPeerHttpClient!.send;
  f.deps.publishContentPeerHttpClient = { send: async request => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/blobs/probe")) {
      probed.push(JSON.parse(String(request.body)).shas);
      return { status: 200, headers: {}, bodyText: JSON.stringify({ missing: [sha256] }) };
    }
    return send(request);
  } };
  const storageKeys: string[] = [];
  f.deps.blobStore.exists = async ({ storageKey }: { storageKey: string }) => { storageKeys.push(storageKey); return false; };
  const credential = { id: "live", label: "Live site", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "private-key" };
  const result = await planPublishToPeer({
    deps: { ...f.deps, publishContentDeps: { workspaceId: "local", clock: f.deps.clock, idGen: f.deps.idGen, ports: {} } },
    peer: { credential, httpClient: f.deps.publishContentPeerHttpClient },
    principalId: OWNER,
  });
  assert.deepEqual(probed, [[sha256]]);
  assert.equal(storageKeys.length > 0 && storageKeys.every(key => key.includes(sha256)), true);
  assert.deepEqual(result.blobsUnavailable, [sha256]);
  assert.equal("note:n" in result.publicUrls, false);
  assert.equal(typeof result.publicUrls["page:p"], "string");
});
