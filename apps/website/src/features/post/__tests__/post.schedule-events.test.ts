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
  assert.deepEqual(await events(outbox), ["p1-entry.published-1"], "one event at go-live, none on the next pass");
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
  assert.deepEqual(await events(outbox), ["p1-entry.unpublished-2", "p1-entry.published-2"]);
});

test("an edit after go-live but before the sweep announces the go-live first, then entry.updated", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  clock.set(LATER);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited after go-live" }) });
  await sweep(LATER);
  assert.deepEqual(await events(outbox), ["p1-entry.published-1", "p1-entry.updated-2"]);
});

test("an edit after the sweep already announced does not announce twice", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow()]);
  await sweep(GO_LIVE);
  clock.set(LATER);
  await updatePost({ deps: { repo, clock, outbox }, input: updateInput({ title: "Edited after go-live" }) });
  assert.deepEqual(await events(outbox), ["p1-entry.published-1", "p1-entry.updated-2"]);
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
  assert.deepEqual(await events(late.outbox), ["p1-entry.published-1", "p1-entry.unpublished-2"]);
});

test("restorePostForward of a scheduled prior version over a draft emits nothing until go-live", async () => {
  const { repo, outbox, clock, sweep } = setup([scheduledRow({ status: "draft", version: 2 })]);
  await restorePostForward({ deps: { repo, clock, outbox, forgetRemoved: async () => {} }, input: { prior: scheduledRow() } });
  assert.deepEqual(await events(outbox), []);
  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), ["p1-entry.published-3"]);
});

test("importPostEntity of a scheduled record emits nothing at import and is announced at go-live", async () => {
  const { repo, outbox, clock, sweep } = setup();
  await importPostEntity({ deps: { repo, clock, outbox }, input: { workspaceId: WS, record: scheduledRow() } });
  assert.deepEqual(await events(outbox), []);
  await sweep(GO_LIVE);
  assert.deepEqual(await events(outbox), ["p1-entry.published-1"]);
});
