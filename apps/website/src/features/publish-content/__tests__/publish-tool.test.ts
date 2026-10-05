import assert from "node:assert/strict";
import test from "node:test";
import { plan, confirm, execute } from "../../../contracts/core/gated-mutations/gateway.js";
import { stageBundle } from "../bundle-staging.js";
import { buildPublishContentImportHooks } from "../gated-hooks.js";
import { contentHash } from "../content-hash.js";
import { contributePublishContentTools } from "../tool-registrations.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests, type PackedEntity } from "../type-registry.js";
import { fixture as pullFixture, context, tool, OWNER } from "./pull-tool-fixture.js";
import type { PublishContentReport } from "../planner.js";

const ID = "publish_content_publish";
function post(id: string, title: string): PackedEntity {
  const state = { title, slug: title.toLowerCase().replaceAll(" ", "-"), status: "published", deletedAt: null };
  return { entityType: "post", id, schemaVersion: 1, hashVersion: 1, state,
    contentHash: contentHash("post", state), requiredBlobs: [] };
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
  let supportedTypes = ["post"];
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => ({
    entityType: "post", schemaVersion: 1, permission: "content.write", dependsOn: [],
    pack: async function* () { yield* entities; },
    inspect: async id => f.destination.get(id) ?? null,
    precheck: async () => null,
    apply: async () => { throw new Error("use apply port"); },
  }) });
  f.deps.fileBlobIndex = new Map();
  f.deps.blobStore.get = async () => new Uint8Array();
  const hooks = (bundleId: string, overwrite?: string[]) => buildPublishContentImportHooks({
    workspaceId: "local", bundleId, actorId: OWNER, clock: f.deps.clock, idGen: f.deps.idGen,
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
      result = await stageBundle({ ...body, workspaceId: "local", sourcePrincipalId: OWNER },
        { repo: f.bundleRepo, clock: f.deps.clock, idGen: f.deps.idGen });
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
      result = await execute({ deps: f.deps.gatedMutations.gatewayDeps, principalId: OWNER, principalKind: "user", hooks: hooks(body.bundleId, body.overwriteEntityKeys), confirmationToken: body.confirmationToken });
    } else throw new Error(`unexpected peer call: ${path}`);
    return { status: 200, headers: {}, bodyText: JSON.stringify(result) };
  } };
  return { ...f, staged, applied, counts: () => ({ confirms, executes }), setBeforePlan: (fn: typeof beforePlan) => { beforePlan = fn; },
    setBeforeExecute: (fn: typeof beforeExecute) => { beforeExecute = fn; }, setDowngrade: (id: string) => { downgrade = id; }, setLegacy: () => { legacy = true; }, setSupportedTypes: (types: string[]) => { supportedTypes = types; } };
}
async function publish(f: Awaited<ReturnType<typeof fixture>>, input = {}) {
  return (await tool(f.deps, ID)).handler(context(input)) as Promise<any>;
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

test("selects an exact title and excludes named items before staging the confirmed bundle", async () => {
  const f = await fixture();
  const result = await publish(f, { items: ["How Tovu Saves You Time", "Contact"], excludeItems: ["Contact"] });
  assert.deepEqual(f.staged.at(-1)?.map(entity => entity.id), ["one"]);
  assert.equal(result.published.length, 1);
  assert.equal(result.skipped[0].title, "contact");
  assert.match(result.skipped[0].reason, /Excluded/);
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
  await assert.rejects(() => publish(f));
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
  await assert.rejects(() => publish(f));
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
