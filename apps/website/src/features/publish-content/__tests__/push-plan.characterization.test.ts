/**
 * @file Characterization of `planPublishToPeer`'s decisions that `publish-tool.test.ts` and the route
 * suites leave unpinned, written before the function was split (publish-engine P0.6). The peer is a
 * fake `HttpClient`: it records what the plan builder sends and answers with the shapes the live
 * site uses, so every assertion is about what this side sends and reports.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { contentHash } from "../content-hash.js";
import { createFileBlobIndex } from "../file-blob-index.js";
import { planPublishToPeer } from "../push-plan.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests, type PackedEntity } from "../type-registry.js";

const clock = { nowMs: () => Date.parse("2026-10-01T12:00:00.000Z") };
const idGen = { newId: () => "id-1" };
const credential = { id: "live", label: "Live site", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "private-key" };

function entity(id: string, state: Record<string, unknown>, extra: Partial<PackedEntity> = {}): PackedEntity {
  const entityType = extra.entityType ?? "post";
  return { entityType, id, schemaVersion: 1, hashVersion: 1, state, contentHash: contentHash({ entityType, state }), requiredBlobs: [], ...extra };
}

interface Fixture {
  readonly bodies: Record<string, unknown[]>;
  readonly storageKeys: string[];
  run(input?: Parameters<typeof planPublishToPeer>[1], options?: { workspaceName?: string; plan?: unknown }): ReturnType<typeof planPublishToPeer>;
}

/** Registers one contributor per entity type; `types` is what the fake live site says it supports. */
function setup({ entities, skipped = [], types = ["post", "page", "note"], missingBlobs = [] }: {
  entities: PackedEntity[]; skipped?: Array<{ entityType: string; id: string; label: string; reason: string }>; types?: string[]; missingBlobs?: string[];
}): Fixture {
  resetPublishContentContributorsForTests();
  for (const entityType of new Set(entities.map((e) => e.entityType).concat(skipped.map((s) => s.entityType)))) {
    registerPublishContentContributor({
                                        contributor: { entityType, dependsOn: [], build: () => ({
        entityType, schemaVersion: 1, permission: "content.write", dependsOn: [],
        pack: async function* () { yield* entities.filter((e) => e.entityType === entityType); },
        inspect: async () => null, precheck: async () => null,
        apply: async () => { throw new Error("a plan never applies"); },
        listSkipped: async () => skipped.filter((s) => s.entityType === entityType),
        references: ({ entity }) => ((entity.state.uses as string[] | undefined) ?? []).map((key) => ({ entityType: "media", key })),
      }) }
                                      });
  }
  const bodies: Record<string, unknown[]> = {};
  const storageKeys: string[] = [];
  return { bodies, storageKeys, run: (input, options = {}) => {
    const send = async (request: { url: string; body?: unknown }) => {
      const path = new URL(request.url).pathname.replace(/^.*publish-content/, "");
      (bodies[path] ??= []).push(request.body === undefined ? undefined : JSON.parse(String(request.body)));
      const answer = path === "/capabilities" ? { entityTypes: types, features: ["overwrite-live"] }
        : path === "/blobs/probe" ? { missing: missingBlobs }
        : path === "/bundles" ? { bundleId: "bundle-9" }
        : options.plan ?? { domain: "publish_content.import", planId: "plan-1", planHash: "h", details: { refused: false, rows: [] } };
      return { status: 200, headers: {}, bodyText: JSON.stringify(answer) };
    };
    return planPublishToPeer({
      deps: {
        workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }),
        publishContentDeps: { workspaceId: "local", clock, idGen, ports: {} },
        workspaceRepo: { findById: async () => (options.workspaceName ? { name: options.workspaceName } : null) },
        blobStore: { exists: async ({ storageKey }: { storageKey: string }) => { storageKeys.push(storageKey); return false; }, get: async () => new Uint8Array() } as never,
        fileBlobIndex: createFileBlobIndex(),
      },
      peer: { credential, httpClient: { send } as never },
      principalId: "owner",
    }, input);
  } };
}

test("the bundle is labelled with the workspace name when there is one", async () => {
  const f = setup({ entities: [entity("a", { title: "A" })] });
  await f.run({}, { workspaceName: "Acme Site" });
  assert.equal((f.bodies["/bundles"]![0] as { sourceLabel: string }).sourceLabel, "Acme Site");
});

test("the answer names the peer and the staged bundle, and counts only what live accepts", async () => {
  const f = setup({
    entities: [entity("a", { title: "A" }), entity("n1", { title: "N1" }, { entityType: "note" }), entity("n2", { title: "N2" }, { entityType: "note" })],
    types: ["post"],
  });
  const result = await f.run();
  assert.deepEqual([result.peerId, result.peerLabel, result.bundleId, result.liveCanOverwrite], ["live", "Live site", "bundle-9", true]);
  assert.deepEqual(result.notSupportedByLive.map((entry) => [entry.entityType, entry.count]), [["note", 2]]);
  assert.equal(result.entityCount, 1, "three selected, two of them held back by one entry of count 2");
  assert.deepEqual(result.blobsUploaded, []);
});

test("itemNames lists the title, the slug and the display label, and leaves out empty ones", async () => {
  const f = setup({ entities: [
    entity("a", { title: "Title", slug: "the-slug" }, { displayLabel: "Label" }),
    entity("b", { title: "", slug: "only-slug" }),
    entity("c", { title: 5 }),
  ] });
  const result = await f.run();
  assert.deepEqual(result.itemNames, { "post:a": ["Title", "the-slug", "Label"], "post:b": ["only-slug"], "post:c": [] });
});

test("a ticked overwrite is sent to live and echoed back, and an untouched one is omitted from both", async () => {
  const f = setup({ entities: [entity("a", { title: "A" })] });
  const ticked = await f.run({ overwriteEntityKeys: ["post:a"] });
  assert.deepEqual((f.bodies["/import/plan"]![0] as { overwriteEntityKeys?: string[] }).overwriteEntityKeys, ["post:a"]);
  assert.deepEqual(ticked.overwriteEntityKeys, ["post:a"]);
  const none = await f.run();
  assert.equal("overwriteEntityKeys" in (f.bodies["/import/plan"]![1] as object), false);
  assert.equal("overwriteEntityKeys" in none, false);
});

test("a row this side holds trashed is tagged trashes when live would update it", async () => {
  const f = setup({ entities: [entity("t", { title: "T", status: "trashed" }), entity("k", { title: "K" })] });
  const rows = [
    { entityType: "post", entityId: "t", outcome: "applied", writes: true, reason: null },
    { entityType: "post", entityId: "k", outcome: "applied", writes: true, reason: null },
  ];
  const result = await f.run({}, { plan: { domain: "publish_content.import", planId: "p", planHash: "h", details: { refused: false, rows } } });
  const details = result.details as { rows: Array<{ entityId: string; trashes?: true }> };
  assert.deepEqual(details.rows.map((row) => [row.entityId, row.trashes]), [["t", true], ["k", undefined]]);
});

test("a unit this side refused to pack is appended to the peer's plan as a blocked row", async () => {
  const f = setup({ entities: [entity("a", { title: "A" })], skipped: [{ entityType: "post", id: "s", label: "Skipped one", reason: "Policy says no." }] });
  const result = await f.run();
  const details = result.details as { rows: Array<{ entityId: string; outcome: string; reason: string; entityLabel: string }> };
  assert.deepEqual(details.rows.filter((row) => row.entityId === "s").map((row) => [row.outcome, row.reason, row.entityLabel]), [["blocked", "Policy says no.", "Skipped one"]]);
});

test("blob probes read this workspace's storage key for the blob", async () => {
  const sha256 = "b".repeat(64);
  const f = setup({ entities: [entity("a", { title: "A" }, { requiredBlobs: [sha256] })], missingBlobs: [sha256] });
  await f.run();
  assert.deepEqual([...new Set(f.storageKeys)], [computeBlobStorageKey({ workspaceId: "local", sha256 })]);
});

test("a scoped plan carries along what its rows use, drawn from the full bundle, and keeps only the carried rows live would change", async () => {
  const f = setup({ entities: [
    entity("a", { title: "A", uses: ["m-new", "m-same"] }),
    entity("other", { title: "Other" }),
    entity("m-new", { title: "New image" }, { entityType: "media" }),
    entity("m-same", { title: "Same image" }, { entityType: "media" }),
    entity("m-unused", { title: "Unused image" }, { entityType: "media" }),
  ] , types: ["post", "media"] });
  const rows = [
    { entityType: "media", entityId: "m-new", outcome: "created", writes: true, reason: null },
    { entityType: "media", entityId: "m-same", outcome: "unchanged", writes: false, reason: null },
    { entityType: "post", entityId: "a", outcome: "created", writes: true, reason: null },
  ];
  const result = await f.run({ scope: { entityKeys: ["post:a"] } }, { plan: { domain: "publish_content.import", planId: "p", planHash: "h", details: { refused: false, rows } } });
  const sent = (f.bodies["/bundles"]![0] as { entities: Array<{ entityType: string; id: string }> }).entities;
  assert.deepEqual(sent.map((e) => `${e.entityType}:${e.id}`).sort(), ["media:m-new", "media:m-same", "post:a"], "the unused image and the other post stay out");
  const kept = (result.details as { rows: Array<{ entityId: string; includedFor?: string[] }> }).rows;
  assert.deepEqual(kept.map((row) => [row.entityId, row.includedFor]), [["m-new", ["post:a"]], ["a", undefined]], "the unchanged carried row is dropped and the changing one names its referrer");
});
