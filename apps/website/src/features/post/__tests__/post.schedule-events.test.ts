import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { InMemoryOutbox } from "#src/contracts/core/events/memory-bus";
import { announceDueGoLives } from "../go-live.js";
import { createPost, deletePost, importPostEntity, restorePostForward, updatePost, type PostRecord } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRecord } from "./post-record.fixture.js";
import { removeVia } from "./remove-post-double.js";

/**
 * @file Scheduled posts announce `entry.published` at GO-LIVE, never at save (2026-10-21). A save of
 * a post scheduled for later used to emit it at once, leaking embargoed content to every outbox
 * consumer, and nothing fired when it really went live. Each write path below classifies by what
 * the public sees at the write's instant; `announceDueGoLives` fires the event once the time passes.
 */

const WS = "ws-1";
const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
/** The go-live event's id: the scheduled publication (post + publishAt), never a content version. */
const GO_LIVE_ID = `p1-entry.published-at-${GO_LIVE}`;

/** A fake clock the test moves. */
function fakeClock(startIso: string) {
  let now = Date.parse(startIso);
  return { nowMs: () => now, set: (iso: string) => { now = Date.parse(iso); } };
}

/** The ids of the events enqueued since the previous call (claiming marks them taken). */
async function events(outbox: InMemoryOutbox): Promise<string[]> {
  const claimed = await outbox.claimPending({ batchSize: 100, nowIso: "2100-01-01T00:00:00.000Z" });
  return claimed.map(({ event }: { event: DomainEvent }) => event.id);
}

function setup(rows: PostRecord[] = []) {
  const repo = new InMemoryPostRepo(rows);
  const outbox = new InMemoryOutbox();
  const clock = fakeClock(SAVED);
  const sweep = (nowIso: string) => announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: WS, nowIso } });
  return { repo, outbox, clock, sweep };
}

const scheduledRow = (fields: Partial<PostRecord> = {}) =>
  buildPostRecord({ id: "p1", workspaceId: WS, slug: "p1", status: "published", publishAt: GO_LIVE, updatedAt: SAVED, version: 1, ...fields });

const updateInput = (fields: Record<string, unknown> = {}) => ({
  workspaceId: WS, id: "p1", title: "Hello World", slug: "p1", bodyJson: { type: "doc", content: [] }, status: "published" as const, ...fields,
});

test("createPost scheduled for later emits nothing; the sweep announces it exactly once at go-live", async () => {
  const { repo, outbox, clock, sweep } = setup();
  await createPost({ deps: { repo, clock, outbox }, input: { workspaceId: WS, id: "p1", title: "Embargoed", status: "published", publishAt: GO_LIVE } });
  await sweep(SAVED);
  assert.deepEqual(await events(outbox), [], "nothing before go-live");

  await sweep(GO_LIVE);
  await sweep(LATER);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID], "one event at go-live, none on the next pass");
});

test("createPost with a past publishAt is live now and emits entry.published at save; the sweep leaves it alone", async () => {
  const { repo, outbox, clock, sweep } = setup();
  clock.set(LATER);
  await createPost({ deps: { repo, clock, outbox }, input: { workspaceId: WS, id: "p1", title: "Backdated", status: "published", publishAt: GO_LIVE } });
  await sweep(LATER);
  assert.deepEqual(await events(outbox), ["p1-entry.published-1"]);
});

test("updatePost: draft -> scheduled, reschedule and unschedule-to-draft before go-live emit nothing", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow({ status: "draft", publishAt: null })]);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ publishAt: GO_LIVE }) });
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ publishAt: LATER }) });
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited while scheduled" }) });
  assert.deepEqual(await events(outbox), []);

  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), [], "rescheduled to LATER: not due at the old time");
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ status: "draft" }) });
  await sweep(LATER);
  assert.deepEqual(await events(outbox), [], "unscheduled to draft: never announced");
});

test("updatePost clearing publishAt on a scheduled post publishes it now, once", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ publishAt: null }) });
  await sweep(LATER);
  assert.deepEqual(await events(outbox), ["p1-entry.published-2"]);
});

test("moving a live post to a future publishAt unpublishes it now and republishes at go-live", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow({ publishAt: null })]);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ publishAt: GO_LIVE }) });
  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), ["p1-entry.unpublished-2", GO_LIVE_ID]);
});

test("an edit after go-live but before the sweep announces the go-live first, then entry.updated", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  clock.set(LATER);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited after go-live" }) });
  await sweep(LATER);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID, "p1-entry.updated-2"]);
});

test("an edit after the sweep already announced does not announce twice", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  await sweep(GO_LIVE);
  clock.set(LATER);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited after go-live" }) });
  assert.deepEqual(await events(outbox), [GO_LIVE_ID, "p1-entry.updated-2"]);
});

test("deletePost: trashing a still-scheduled post emits nothing; trashing one that went live unannounced announces then unpublishes", async () => {
  const early = setup([scheduledRow()]);
  await deletePost({ deps: { repo: early.repo, clock: early.clock, outbox: early.outbox, remove: removeVia(early.repo) }, input: { workspaceId: WS, id: "p1" } });
  await early.sweep(LATER);
  assert.deepEqual(await events(early.outbox), [], "never public, never announced, trashed before go-live");

  const late = setup([scheduledRow()]);
  late.clock.set(LATER);
  await deletePost({ deps: { repo: late.repo, clock: late.clock, outbox: late.outbox, remove: removeVia(late.repo) }, input: { workspaceId: WS, id: "p1" } });
  await late.sweep(LATER);
  assert.deepEqual(await events(late.outbox), [GO_LIVE_ID, "p1-entry.unpublished-2"]);
});

test("restorePostForward of a scheduled prior version over a draft emits nothing until go-live", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow({ status: "draft", version: 2 })]);
  await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved: async () => {} }, input: { prior: scheduledRow() } });
  assert.deepEqual(await events(outbox), []);
  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID]);
});

test("importPostEntity of a scheduled record emits nothing at import and is announced at go-live", async () => {
  const { repo, outbox, clock, sweep } = setup();
  await importPostEntity({ deps: { repo, clock, outbox }, input: { workspaceId: WS, record: scheduledRow() } });
  assert.deepEqual(await events(outbox), []);
  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID]);
});

// ---- Review fixes (2026-10-21) ----

/** An outbox whose `enqueue` throws while `failing` — a lost connection or crash mid-write. */
class FailingOutbox extends InMemoryOutbox {
  failing = true;
  override async enqueue(event: DomainEvent): Promise<void> {
    if (this.failing) throw new Error("outbox unavailable");
    return super.enqueue(event);
  }
}

test("a post scheduled before this fix, whose save already emitted (and delivered) the legacy version-keyed entry.published, is still announced at go-live", async () => {
  const { outbox, sweep } = setup([scheduledRow()]);
  // What the previous code enqueued at SAVE time for version 1 — the id the old go-live event reused.
  await outbox.enqueue({ id: "p1-entry.published-1", name: "entry.published", occurredAt: SAVED, aggregateId: "p1", workspaceId: WS, payload: { entryId: "p1", contentType: "post" } });
  const [legacy] = await outbox.claimPending({ batchSize: 10, nowIso: SAVED });
  await outbox.markDelivered({ id: legacy!.id });

  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID], "the real go-live is announced, not swallowed by the legacy row");
});

test("an edit straddling go-live (pre-deadline clock, committed after a sweep read the prior version) announces once", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  // PostgreSQL READ COMMITTED: the sweep at the deadline still reads version 1, because the edit's
  // transaction (which captured its clock just before the deadline) has not committed yet.
  const priorVersion = scheduledRow();
  await announceDueGoLives({ deps: { repo: { listGoLiveCandidates: async () => [priorVersion] }, outbox }, input: { workspaceId: WS, nowIso: GO_LIVE } });
  clock.set("2026-10-21T11:59:59.999Z");
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited at the deadline" }) });

  await sweep(LATER); // sees version 2, still saved while scheduled, same publishAt
  assert.deepEqual(await events(outbox), [GO_LIVE_ID], "one publication, whatever version the sweeps saw");
});

test("rescheduling after an announced go-live is a new publication and announces again at the new time", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  await sweep(GO_LIVE);
  clock.set(LATER);
  const NEXT = "2026-10-21T14:00:00.000Z";
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ publishAt: NEXT }) });
  await sweep(NEXT);
  assert.deepEqual(await events(outbox), [GO_LIVE_ID, "p1-entry.unpublished-2", `p1-entry.published-at-${NEXT}`]);
});

/** Each write path that can move a due, unannounced row's `updatedAt` past its `publishAt`. */
const failingWrites: Array<[string, (deps: { repo: InMemoryPostRepo; clock: ReturnType<typeof fakeClock>; outbox: InMemoryOutbox }) => Promise<unknown>]> = [
  ["updatePost", ({ repo, clock, outbox }) => updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited after go-live" }) })],
  ["deletePost", ({ repo, clock, outbox }) => deletePost({ deps: { repo, clock, outbox, remove: removeVia(repo) }, input: { workspaceId: WS, id: "p1" } })],
  ["importPostEntity", ({ repo, clock, outbox }) => importPostEntity({ deps: { repo, clock, outbox }, input: { workspaceId: WS, record: scheduledRow({ title: "Imported over" }), expectedVersion: 1 } })],
  ["restorePostForward", ({ repo, clock, outbox }) => restorePostForward({ deps: { repo, clock, outbox, forgetRemoved: async () => {} }, input: { prior: scheduledRow({ version: 0, title: "Older" }) } })],
];

for (const [name, write] of failingWrites) {
  test(`${name}: a failed event enqueue rolls the write back, so a restart's catch-up sweep still announces the go-live`, async () => {
    const repo = new InMemoryPostRepo([scheduledRow()]);
    const clock = fakeClock(LATER);
    const outbox = new FailingOutbox();
    await assert.rejects(write({ repo, clock, outbox }), /outbox unavailable/);
    const row = await repo.findById({ workspaceId: WS, id: "p1" });
    assert.equal(row?.version, 1, "the write did not commit without its events");
    assert.equal(row?.updatedAt, SAVED);

    // Restart: a fresh process's full catch-up pass (no afterIso).
    outbox.failing = false;
    await announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: WS, nowIso: LATER } });
    assert.deepEqual(await events(outbox), [GO_LIVE_ID]);
  });
}

test("createPost: a failed event enqueue leaves no row behind", async () => {
  const repo = new InMemoryPostRepo([]);
  await assert.rejects(
    createPost({ deps: { repo, clock: fakeClock(LATER), outbox: new FailingOutbox() }, input: { workspaceId: WS, id: "p1", title: "Live now", status: "published" } }),
    /outbox unavailable/
  );
  assert.equal(await repo.findById({ workspaceId: WS, id: "p1" }), null);
});
