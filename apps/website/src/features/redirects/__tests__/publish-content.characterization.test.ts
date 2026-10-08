import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "@jini-ai/http-kit/verified-origin";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import { redirectMatcher } from "@jini-ai/cms/redirects";
import type { RedirectDbHandle } from "@jini-ai/cms/redirects/sql";
import { contributeRedirectPublish } from "../publish-content.js";
import { createRedirect, tombstoneRedirect, type RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { InMemoryRedirectRepo } from "@jini-ai/cms/redirects";
import { isNeverInTrash, removeVia, restoreVia } from "./remove-redirect-double.js";

/**
 * @file Characterization pin for M-RED (`plan-publish-all-types-2026-09-25.md` §5, §7): the live site
 * holds a baseline `contentHash` for every published redirect, so moving the handler onto
 * `createRepoPublishHandler` must keep every hash, packed state and precheck/apply reason byte-identical.
 * Written against the hand-written handler and kept green across the migration.
 */

const WORKSPACE_ID = "workspace-1";
const ACTOR_ID = "user-1";

function makeWriteDeps(): RedirectsWriteDeps {
  const repo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo({ seeds: [
    {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" }),
      redirectAllowlist: [],
    },
  ] });
  let clockTick = 0;
  let idTick = 0;
  return {
    repo,
    remove: removeVia(repo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: isNeverInTrash,
    restore: restoreVia(repo as unknown as Parameters<typeof removeVia>[0]),
    db: repo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowMs: () => Date.parse(`2026-09-24T00:00:${String(clockTick++).padStart(2, "0")}.000Z`) },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
}

const publishDeps = (writeDeps?: RedirectsWriteDeps): PublishContentDeps => ({
  workspaceId: WORKSPACE_ID,
  clock: { nowMs: () => Date.parse("2026-09-24T00:00:00.000Z") },
  idGen: { newId: () => "unused" },
  ports: writeDeps === undefined ? {} : { redirect: writeDeps },
});

const entity = (id: string, state: Record<string, unknown>): PackedEntity => ({
  entityType: "redirect",
  id,
  schemaVersion: 1,
  contentHash: "unused",
  hashVersion: 1,
  requiredBlobs: [],
  state,
});

async function seeded() {
  const writeDeps = makeWriteDeps();
  await createRedirect({
    deps: writeDeps,
    input: { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/old-promo", toTarget: "/new-promo", statusCode: 301, override: true, actorId: ACTOR_ID },
  });
  await createRedirect({
    deps: writeDeps,
    input: { workspaceId: WORKSPACE_ID, matchType: "prefix", fromPattern: "/blog", toTarget: "/posts", statusCode: 302, priority: 7, actorId: ACTOR_ID },
  });
  const { record: gone } = await createRedirect({
    deps: writeDeps,
    input: { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/gone", toTarget: "/x", statusCode: 301, actorId: ACTOR_ID },
  });
  await tombstoneRedirect({ deps: writeDeps, input: { workspaceId: WORKSPACE_ID, id: gone.id, actorId: ACTOR_ID } });
  return writeDeps;
}

const PINNED_HASHES: Record<string, string> = {
  "exact:/old-promo": "05966d29b56ef7ef61073aaa4618147126c07bdf653b70b5c0fc1d3f38302444",
  "prefix:/blog": "e289e252c4d9c08611bc1f595596359ddc49076c4805fc398cb9d62adf7ae201",
};

test("pack(): pinned contentHash, schemaVersion and packed state per redirect; disabled rows skipped", async () => {
  const handler = contributeRedirectPublish().build(publishDeps(await seeded()));
  const packed: PackedEntity[] = [];
  for await (const e of handler.pack()) packed.push(e);

  assert.deepEqual(
    packed.map((e) => [e.id, e.contentHash, e.schemaVersion, e.hashVersion, e.requiredBlobs]),
    Object.entries(PINNED_HASHES).map(([id, hash]) => [id, hash, 1, 1, []])
  );
  assert.deepEqual(packed[0].state, {
    matchType: "exact",
    fromPattern: "/old-promo",
    toTarget: "/new-promo",
    statusCode: 301,
    status: "active",
    override: true,
    priority: 0,
    createdAt: "2026-09-24T00:00:00.000Z",
    source: "manual",
    sourceEntryId: null,
    fromPathAtCapture: null,
    toPathAtCapture: null,
    title: "/old-promo → /new-promo",
  });
  assert.equal(packed[1].state.title, "starts with /blog → /posts");
});

test("inspect(): the destination's hash equals the pinned pack hash", async () => {
  const handler = contributeRedirectPublish().build(publishDeps(await seeded()));
  for (const [id, hash] of Object.entries(PINNED_HASHES)) {
    assert.equal((await handler.inspect(id))?.hash, hash);
  }
});

test("pack(): wildcard state, title and independently calculated content hash are pinned", async () => {
  const deps = makeWriteDeps();
  await createRedirect({ deps, input: { workspaceId: WORKSPACE_ID, matchType: "wildcard", fromPattern: "/legacy/*", toTarget: "/new/$1", statusCode: 301, actorId: ACTOR_ID } });
  const handler = contributeRedirectPublish().build(publishDeps(deps));
  const rows: PackedEntity[] = [];
  for await (const row of handler.pack()) rows.push(row);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "wildcard:/legacy/*");
  // SHA-256 of the canonical literal transferred state, sorted by field name.
  assert.equal(rows[0].contentHash, "c20946aedc3f5798aa9a2439054e36578775cfdae66e4bbbc63a67306be9abc6");
  assert.deepEqual(rows[0].state, { matchType: "wildcard", fromPattern: "/legacy/*", toTarget: "/new/$1", statusCode: 301, status: "active", override: false, priority: 0, createdAt: "2026-09-24T00:00:00.000Z", source: "manual", sourceEntryId: null, fromPathAtCapture: null, toPathAtCapture: null, title: "matches /legacy/* → /new/$1" });
});

test("precheck(): exact reason strings", async () => {
  const unwired = contributeRedirectPublish().build(publishDeps(undefined));
  assert.equal(
    await unwired.precheck(entity("exact:/x", {})),
    "redirect entity 'exact:/x' cannot be prechecked — no redirect port wired for this deps bag"
  );
  const handler = contributeRedirectPublish().build(publishDeps(await seeded()));
  assert.equal(
    await handler.precheck(entity("no-colon", {})),
    "redirect entity 'no-colon' has a malformed natural key (expected 'matchType:fromPattern')"
  );
  assert.equal(
    await handler.precheck(entity("exact:/new-promo", { matchType: "exact", fromPattern: "/new-promo", toTarget: "/old-promo", statusCode: 301, status: "active", override: false, priority: 0 })),
    "redirect from '/new-promo' would create a cycle via '/old-promo' (resolves back to '/new-promo')"
  );
  assert.equal(
    await handler.precheck(entity("exact:/old-promo", { matchType: "exact", fromPattern: "/old-promo", toTarget: "/newest", statusCode: 301, status: "active", override: true, priority: 0 })),
    null
  );
});

test("apply(): exact blocked text; unwired throws naming the port", async () => {
  const handler = contributeRedirectPublish().build(publishDeps(makeWriteDeps()));
  const state = { matchType: "exact", fromPattern: "/off", toTarget: "https://not-allowed.example/x", statusCode: 301, status: "active", override: false, priority: 0 };
  await assert.rejects(
    () => handler.apply({ entity: entity("exact:/off", state), expectedVersion: undefined, principalId: "op", idempotencyKey: "k1" }),
    (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === "blocked" && err.message === "toTarget 'https://not-allowed.example/x' is not an allowed redirect destination"
  );
  const unwired = contributeRedirectPublish().build(publishDeps(undefined));
  await assert.rejects(
    () => unwired.apply({ entity: entity("exact:/x", {}), expectedVersion: undefined, principalId: "op", idempotencyKey: "k2" }),
    /^Error: publish-content: redirect\.apply\(\) requires PublishContentDeps\.ports\.redirect/
  );
});

test("apply(): a vanished destination row is a conflict (text changes to changedSincePlan by the plan)", async () => {
  const handler = contributeRedirectPublish().build(publishDeps(makeWriteDeps()));
  const state = { matchType: "exact", fromPattern: "/gone", toTarget: "/x", statusCode: 301, status: "active", override: false, priority: 0 };
  await assert.rejects(
    () => handler.apply({ entity: entity("exact:/gone", state), expectedVersion: 1, principalId: "op", idempotencyKey: "k3" }),
    (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === "conflict" && err.message.startsWith("redirect 'exact:/gone' ")
  );
});

test("apply(): update keeps the destination row id as changeSetId and ignores the synthetic title", async () => {
  const writeDeps = await seeded();
  const handler = contributeRedirectPublish().build(publishDeps(writeDeps));
  const before = (await writeDeps.repo.list({ workspaceId: WORKSPACE_ID })).find((r) => r.fromPattern === "/old-promo")!;
  const { changeSetId } = await handler.apply({
    entity: entity("exact:/old-promo", { matchType: "exact", fromPattern: "/old-promo", toTarget: "/newest", statusCode: 301, status: "active", override: true, priority: 0, title: "/old-promo → /newest" }),
    expectedVersion: before.version,
    principalId: "op",
    idempotencyKey: "k4",
  });
  assert.equal(changeSetId, before.id);
  const after = await writeDeps.repo.findById({ workspaceId: WORKSPACE_ID, id: before.id });
  assert.equal(after?.toTarget, "/newest");
  assert.equal(after?.version, before.version + 1);
});
