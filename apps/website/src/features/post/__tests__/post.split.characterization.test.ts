import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxPort } from "@jini-ai/core/contracts/events";
import type { SlugChangeCapture } from "@jini-ai/cms/routing";
import { createPost } from "../post-create.js";
import { getAdminPostByIdOrSlug } from "../post-read.js";
import { importPostEntity } from "../post-import.js";
import { PostNotFoundError } from "../post.js";
import { restorePostForward } from "../post-trash.js";
import { retirePostForReplacement } from "../post-retire.js";
import { updatePost } from "../post-update.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRecord } from "./post-record.fixture.js";
import { removeVia } from "./remove-post-double.js";

const WS = "workspace-1";
const NOW = "2026-10-22T12:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };
const noopOutbox: OutboxPort = {
  enqueue: async () => {}, claimPending: async () => [],
  markDelivered: async () => {}, markFailed: async () => {},
};

// Mutation: filter the slug match before falling back to the eligible row by id.
test("a trashed slug match prevents an eligible id fallback", async () => {
  const trashed = buildPostRecord({ id: "trashed", slug: "selector", deletedAt: NOW });
  const eligible = buildPostRecord({ id: "selector", slug: "eligible" });
  const repo = new InMemoryPostRepo({}, { initialRows: [trashed, eligible] });
  let idLookups = 0;
  const findById = repo.findById.bind(repo);
  repo.findById = async (input) => { idLookups += 1; return findById(input); };
  await assert.rejects(() => getAdminPostByIdOrSlug({
    deps: { repo }, input: { workspaceId: WS, idOrSlug: "selector" },
  }), PostNotFoundError);
  assert.equal(idLookups, 0);
});

// Mutation: release the holder after saving the claimant, or advance the holder's version.
test("published create releases the trashed holder before saving without changing its bookkeeping", async () => {
  const holder = buildPostRecord({ id: "holder", slug: "claimed", version: 7, deletedAt: NOW });
  const repo = new InMemoryPostRepo({}, { initialRows: [holder] });
  const trace: string[] = [];
  const transaction = repo.transaction.bind(repo);
  const saveIfVersion = repo.saveIfVersion.bind(repo);
  const save = repo.save.bind(repo);
  const appendRevision = repo.appendRevision.bind(repo);
  repo.transaction = async (input) => { trace.push("transaction"); return transaction(input); };
  repo.saveIfVersion = async (input) => {
    trace.push(`holder CAS:${input.ifVersion}`); return saveIfVersion(input);
  };
  repo.save = async (post) => { if (post.id === "new") trace.push("save"); await save(post); };
  repo.appendRevision = async (input) => { trace.push("revision"); return appendRevision(input); };
  const outbox = { ...noopOutbox, enqueue: async (event: Parameters<OutboxPort["enqueue"]>[0]) => { trace.push(event.name); } };
  await createPost({ deps: {
    repo, outbox, clock: { nowMs: () => { trace.push("clock"); return Date.parse(NOW); } },
    beforeSaveHook: async () => { trace.push("hook"); return {}; },
  }, input: { workspaceId: WS, id: "new", title: "Claimed", slug: "claimed", status: "published" } });
  assert.deepEqual(trace, ["hook", "clock", "transaction", "holder CAS:7", "save", "revision", "content.created", "entry.published"]);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: holder.id }), { ...holder, slug: "claimed-trashed" });
});

for (const throws of [false, true]) {
  // Mutation: resolve the capture before awaiting the hook, or wrap its rejection.
  test(`published rename resolves the replacement capture after CAS (throws=${throws})`, async () => {
    const existing = buildPostRecord({ slug: "before", version: 3 });
    const repo = new InMemoryPostRepo({}, { initialRows: [existing] });
    const trace: string[] = [];
    const failure = new Error("capture failed");
    let releaseHook!: () => void;
    let enteredHook!: () => void;
    const paused = new Promise<void>((resolve) => { releaseHook = resolve; });
    const entered = new Promise<void>((resolve) => { enteredHook = resolve; });
    let capture: SlugChangeCapture = { onSlugChange: async () => { trace.push("old capture"); } };
    const saveIfVersion = repo.saveIfVersion.bind(repo);
    const appendRevision = repo.appendRevision.bind(repo);
    repo.saveIfVersion = async (input) => { const result = await saveIfVersion(input); trace.push("CAS"); return result; };
    repo.appendRevision = async (input) => { trace.push("revision"); return appendRevision(input); };
    const pending = updatePost({ deps: {
      repo, clock, outbox: { ...noopOutbox },
      beforeSaveHook: async () => { trace.push("hook"); enteredHook(); await paused; return {}; },
      slugChangeCapture: () => { trace.push("lookup"); return capture; },
    }, input: { workspaceId: WS, id: existing.id, title: existing.title, slug: "after",
      bodyJson: existing.bodyJson, status: "published", expectedVersion: 3 } });
    await entered;
    capture = { onSlugChange: async (input) => {
      trace.push("new capture");
      assert.equal(input.oldPath, "/before");
      assert.equal(input.newPath, "/after");
      if (throws) throw failure;
    } };
    releaseHook();
    if (throws) await assert.rejects(pending, (error: unknown) => error === failure);
    else await pending;
    assert.deepEqual(trace, throws ? ["hook", "CAS", "lookup", "new capture"] : ["hook", "CAS", "lookup", "new capture", "revision"]);
  });
}

// Mutation: pass the original row's version to remove instead of the renamed version.
test("retirement saves and revises the rename before removal at the renamed version", async () => {
  const existing = buildPostRecord({ slug: "live", version: 3 });
  const repo = new InMemoryPostRepo({}, { initialRows: [existing] });
  const trace: string[] = [];
  const save = repo.save.bind(repo);
  const appendRevision = repo.appendRevision.bind(repo);
  const remove = removeVia(repo);
  repo.save = async (post) => { trace.push(`save:${post.slug}:${post.version}`); await save(post); };
  repo.appendRevision = async (input) => { trace.push(`revision:${input.op}:${input.seq}`); return appendRevision(input); };
  const outbox = { ...noopOutbox, enqueue: async (event: Parameters<OutboxPort["enqueue"]>[0]) => { trace.push(event.name); } };
  const result = await retirePostForReplacement({ deps: { repo, clock, outbox, remove: async (input) => {
    trace.push(`remove:${input.expectedVersion}`); return remove(input);
  } }, input: { workspaceId: WS, id: existing.id, expectedVersion: 3, today: "20261022" } });
  assert.deepEqual(trace, ["save:live-replaced-20261022:4", "revision:update:4", "remove:4", "revision:delete:5", "entry.unpublished"]);
  assert.equal(result.post.version, 5);
  assert.equal(result.post.deletedAt, NOW);
});

// Mutation: build the hook draft from the destination, or force doc format on import.
test("HTML replication filters incoming fields and records the imported body with destination authorship", async () => {
  const existing = buildPostRecord({ kind: "page", version: 4, createdByPrincipalId: "destination", createdAt: "2026-01-01T00:00:00.000Z" });
  const incoming = buildPostRecord({ kind: "page", title: "Incoming", slug: "incoming", status: "draft",
    bodyFormat: "html", bodyHtml: "<main>Incoming</main>", bodyJson: { incoming: true },
    ext: { source: { value: true } }, createdByPrincipalId: "source", createdAt: NOW });
  const repo = new InMemoryPostRepo({}, { initialRows: [existing] });
  let hookCalls = 0;
  const result = await importPostEntity({ deps: { repo, clock, outbox: { ...noopOutbox }, beforeSaveHook: async (draft) => {
    hookCalls += 1;
    assert.deepEqual(draft, { id: incoming.id, workspaceId: WS, title: incoming.title,
      slug: incoming.slug, status: incoming.status, bodyJson: incoming.bodyJson, ext: incoming.ext });
    return { destination: { filtered: true } };
  } }, input: { workspaceId: WS, record: incoming, expectedVersion: 4, actorId: "operator" } });
  const expected = { ...incoming, version: 5, updatedAt: NOW, createdByPrincipalId: existing.createdByPrincipalId,
    createdAt: existing.createdAt, ext: { ...incoming.ext, destination: { filtered: true } } };
  assert.equal(hookCalls, 1);
  assert.deepEqual(result.post, expected);
  const revisions = await repo.listRevisions({ workspaceId: WS, postId: existing.id });
  assert.deepEqual(revisions[0].stateJson, expected);
  assert.equal(revisions[0].actorId, "operator");
});

// Mutation: select the first matching seq, or forget the Trash index outside the transaction.
test("restore names the last duplicate prior revision and forgets Trash before enqueue in the transaction", async () => {
  const prior = buildPostRecord({ version: 2 });
  const current = { ...prior, version: 3, deletedAt: NOW };
  const repo = new InMemoryPostRepo({}, { initialRows: [current] });
  const revisionInput = { workspaceId: WS, postId: prior.id, seq: 2, op: "update" as const,
    stateJson: prior, actorId: "operator", recordedAt: prior.updatedAt };
  await repo.appendRevision(revisionInput);
  const last = await repo.appendRevision(revisionInput);
  const trace: string[] = [];
  let inTransaction = false;
  const transaction = repo.transaction.bind(repo);
  const appendRevision = repo.appendRevision.bind(repo);
  repo.transaction = async ({ fn }) => transaction({ fn: async () => {
    inTransaction = true;
    try { return await fn(); } finally { inTransaction = false; }
  } });
  repo.appendRevision = async (input) => {
    assert.equal(inTransaction, true);
    assert.equal(input.restoredFrom, last.id);
    trace.push("restore revision"); return appendRevision(input);
  };
  const outbox = { ...noopOutbox, enqueue: async (event: Parameters<OutboxPort["enqueue"]>[0]) => {
    assert.equal(inTransaction, true); trace.push(event.name);
  } };
  const result = await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved: async (input) => {
    assert.equal(inTransaction, true);
    assert.deepEqual(input, { workspaceId: WS, id: prior.id }); trace.push("forget Trash");
  } }, input: { prior } });
  assert.ok(result);
  assert.deepEqual(trace, ["restore revision", "forget Trash", "entry.published"]);
  const revisions = await repo.listRevisions({ workspaceId: WS, postId: prior.id });
  assert.equal(revisions.at(-1)?.restoredFrom, last.id);
});
