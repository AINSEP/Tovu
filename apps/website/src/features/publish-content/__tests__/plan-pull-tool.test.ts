import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/** t09: real gateway spy, strict input/permission refusals and owner-facing plan mapping. */
import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import * as gateway from "../../../contracts/core/gated-mutations/gateway.js";
import { fixture, packed, peerRow, context, tool, OWNER } from "./pull-tool-fixture.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};
const plans: Parameters<typeof gateway.plan>[0][] = [];
beforeEach(() => { plans.length = 0; });
mock.module("../../../contracts/core/gated-mutations/gateway.js", { namedExports: { ...gateway, plan: async (args: Parameters<typeof gateway.plan>[0]) => { plans.push(args); return gateway.plan(args); } } });
const ID = "publish_content_plan_pull";
test("plan stages as the caller, runs the shared gateway and maps all outcomes without applying content", async () => {
  const f = await fixture([packed("create"), packed("update"), packed("same"), packed("conflict"), packed("blocked")]);
  f.destination.set("update", { version: 1, hash: "baseline", title: "Local update" });
  f.destination.set("same", { version: 1, hash: f.entities[2]!.contentHash, title: "Live same" });
  f.destination.set("conflict", { version: 1, hash: "edited", title: "Local conflict" });
  await f.baselineRepo.upsert({ workspaceId: "local", peerPrincipalId: OWNER, entityType: "pull-fixture", entityId: "update", hashAtLastSync: "baseline", hashVersion: 1, syncedAt: "2026-09-30T00:00:00.000Z", runId: "previous" });
  const before = [...f.destination];
  const result = await (await tool(f.deps, ID)).handler(context({}));
  assert.deepEqual(result, { bundleId: "pull-1", expiresAt: "2026-10-02T12:00:00.000Z", peerLabel: "Live site", counts: { create: 1, update: 1, unchanged: 1, blocked: 1 }, conflicts: [{ entityKey: "pull-fixture:conflict", title: "Live conflict", reason: "no prior sync baseline for pull-fixture 'conflict' with this peer — the destination already holds different content" }], blobsUnavailable: [], blobsDeferred: [] });
  assert.equal(plans.length, 1);
  assert.equal(plans.at(-1)?.principalId, OWNER);
  assert.equal(plans.at(-1)?.principalKind, "agent");
  assert.equal(plans.at(-1)?.hooks.domain, "publish_content.import");
  assert.deepEqual([...f.destination], before);
  assert.deepEqual(f.applied, []);
  assert.equal((await f.runRepo.findById({ workspaceId: "local", id: "pull-1" }))?.peerLabel, "Live site");
});
test("omitted peer selects the connected destination among saved peers", async () => {
  const f = await fixture();
  await f.peerRepo.update(peerRow("live", "Live site", true));
  await f.peerRepo.insert(peerRow("other", "Other site"));
  // Selection reaches the connected row's handshake, rather than opening the other saved key.
  let requested = "";
  f.deps.publishContentPeerHttpClient = { send: async request => { requested = request.url; return { status: 401, headers: {}, bodyText: "{}" }; } };
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({}))), { message: "live.example doesn't recognise this computer yet. Connect it, then deploy the site once." });
  assert.equal(requested, "https://live.example/api/publish-trust/v1/identity");
});
test("ambiguous and missing destinations give actionable exact selection messages", async () => {
  const f = await fixture();
  await f.peerRepo.insert(peerRow("other", "Other site"));
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({}))), { message: "Several destinations are saved. Choose a peerId: live (Live site), other (Other site)." });
  await f.peerRepo.delete({ workspaceId: "local", id: "live" });
  await f.peerRepo.delete({ workspaceId: "local", id: "other" });
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({}))), { message: "No live destination is connected. Connect this computer with publish_content_connect, then plan the pull again." });
  assert.deepEqual(f.requests, []);
});
test("permission is checked before peer lookup, transport or staging", async () => {
  const f = await fixture();
  f.denied.add("publish_content.apply");
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({}))), { message: "principal 'human-owner' is not authorized for 'publish_content.apply' (insufficient_permission)" });
  assert.deepEqual(f.requests, []);
  assert.equal(await f.bundleRepo.findById({ workspaceId: "local", id: "pull-1" }), null);
});
test("both pull tools honestly advertise durable writes and execute requires the human transport", async () => {
  const f = await fixture();
  const plan = await tool(f.deps, ID);
  const execute = await tool(f.deps, "publish_content_execute_pull");
  assert.equal(plan.descriptor.readOnly, false);
  assert.equal(execute.descriptor.readOnly, false);
  const { contributePublishContentTools } = await import("../tool-registrations.js");
  assert.equal(contributePublishContentTools().risk.get(ID), "mutates-durable-state");
  assert.equal(contributePublishContentTools().risk.get("publish_content_execute_pull"), "mutates-durable-state");
  const { publishContentAgentToolCatalog } = await import("../agent-tools.js");
  assert.equal(publishContentAgentToolCatalog.find(t => t.name === "publish_content_execute_pull")?.actorClassRule, "confirmer-must-equal-own-delegatedBy");
});
test("unknown peers and invalid peerId/extra URL inputs are refused before transport", async () => {
  const f = await fixture();
  const r = await tool(f.deps, ID);
  for (const value of [null, 1, "", "   "]) await assert.rejects(() => r.handler(context({ peerId: value })), { message: "'peerId' must be a non-empty string when provided." });
  await assert.rejects(() => r.handler(context({ peerId: "missing" })), { message: "The saved destination 'missing' was not found. Choose a saved peerId or connect the live site again." });
  await assert.rejects(() => r.handler(context({ url: "https://attacker.example" })), { message: "'url' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can." });
  assert.deepEqual(f.requests, []);
});
test("conflicts are capped at 50 and missing/deferred blob lists survive mapping", async () => {
  const entities = Array.from({ length: 51 }, (_, i) => packed(`conflict-${i}`));
  const missing = "a".repeat(64);
  entities.push(packed("missing", "Missing blob", [missing]));
  const f = await fixture(entities);
  for (const e of entities.slice(0, 51)) f.destination.set(e.id, { version: 1, hash: "different", title: "Local" });
  const result = await (await tool(f.deps, ID)).handler(context({ peerId: "live" })) as any;
  assert.equal(result.conflicts.length, 50);
  assert.equal(result.conflicts[49].entityKey, "pull-fixture:conflict-49");
  assert.deepEqual(result.counts, { create: 0, update: 0, unchanged: 0, blocked: 1 });
  assert.deepEqual(result.blobsUnavailable, [missing]);
  assert.deepEqual(result.blobsDeferred, []);
});

test("multiple connected destinations are listed instead of silently choosing the newest", async () => {
  const f = await fixture();
  await f.peerRepo.update(peerRow("live", "Live site", true));
  await f.peerRepo.insert({ ...peerRow("other", "Other site", true), updatedAt: "2026-10-01T13:00:00.000Z" });
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({}))), { message: "Several destinations are saved. Choose a peerId: live (Live site), other (Other site)." });
  assert.deepEqual(f.requests, []);
});
test("a refused import report is an actionable failure, never a zero-change success", async () => {
  const f = await fixture([{ ...packed("one"), schemaVersion: 2 }]);
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({ peerId: "live" }))), (error: Error) => {
    assert.equal(error.name, "ToolInputError");
    assert.equal(error.message, "pull-fixture 'one' uses schema version 2, but this instance supports version 1 for that type");
    return true;
  });
  assert.deepEqual(f.applied, []);
});
test("blob cap deferrals are returned separately from remote missing blobs", async () => {
  const hashes = Array.from({ length: 2001 }, (_, i) => (i + 1).toString(16).padStart(64, "0"));
  const f = await fixture([packed("many-blobs", "Many blobs", hashes)]);
  const result = await (await tool(f.deps, ID)).handler(context({ peerId: "live" })) as any;
  assert.deepEqual(result.blobsUnavailable, hashes.slice(0, 2000));
  assert.deepEqual(result.blobsDeferred, [hashes[2000]]);
  assert.deepEqual(result.counts, { create: 0, update: 0, unchanged: 0, blocked: 1 });
  assert.equal(f.requests.length, 2001);
});
test("the production contributor projects the same content ports the import route uses", async () => {
  const { createRouteDeps } = await import("../../../server/runtime/composition/app.js");
  const { installFirstPartyToolContributors } = await import("../../../server/runtime/composition/tool-catalog-manifest.js");
  const { registerPublishContentContributor } = await import("../type-registry.js");
  const realDeps = createRouteDeps();
  await realDeps.identityReady;
  const f = await fixture();
  let builds = 0;
  registerPublishContentContributor({ entityType: "pull-fixture", dependsOn: [], build: publishDeps => {
    builds++;
    assert.equal(publishDeps.ports.post?.repo, realDeps.postRepo);
    assert.equal(publishDeps.ports.media?.repo, realDeps.mediaRepo);
    assert.equal(publishDeps.ports.menu?.repo, realDeps.menuRepo);
    assert.equal(publishDeps.ports.form?.repo, realDeps.formDefinitionRepo);
    return { entityType: "pull-fixture", schemaVersion: 1, permission: "content.write", dependsOn: [], pack: async function* () {}, inspect: async () => null, precheck: async () => null, apply: async () => { throw new Error("planning cannot apply"); } };
  } });
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(c => c.domain === "publish-content")!;
  assert.notEqual(contributor, undefined);
  const registrations = contributor.build({ ...realDeps, ...f.deps } as never, { surfaceExchanges: {} } as never);
  const registration = registrations.find(r => r.descriptor.id === ID);
  assert.notEqual(registration, undefined);
  const result = await registration!.handler(context({ peerId: "live" })) as any;
  assert.equal(builds, 1);
  assert.deepEqual(result.counts, { create: 1, update: 0, unchanged: 0, blocked: 0 });
  assert.deepEqual(f.applied, []);
});
