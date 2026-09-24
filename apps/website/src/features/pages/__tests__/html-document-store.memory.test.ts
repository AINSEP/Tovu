import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { PageConcurrentEditError } from "../html-document-store.sqlite.js";

/**
 * @file CIC-1 certification for `InMemoryPagesHtmlDocumentStore` — the store `pages_write_region`'s
 * OWN test suite (`tool-registrations.write-region.test.ts`) and the hermetic composition root
 * (`server/runtime/composition/app.ts`, "Default for tests/dev") run against.
 *
 * `html-document-store.sqlite.test.ts` certifies the real store's compare-and-set with a "read, read,
 * write, write" interleaving (two readers see the same base version, then the second writer is
 * rejected). This store's own header claims the identical guarantee ("the compare-and-set discipline
 * (CIC-1)... write() here checks the version the same way, and raises the same
 * PageConcurrentEditError") but nothing had ever exercised it — no test file for this module existed
 * at all before this one.
 *
 * That claim is FALSE for a genuinely concurrent pair of `write()` calls (both in flight at once, as
 * two parallel tool-call dispatches would be — see `tool-registrations.write-region.test.ts`'s own
 * header, defect #2: "two region edits to two DIFFERENT regions of the same page... reads as success
 * and silently drops one of them"). `write()` does `await this.load()`, a synchronous version check,
 * then `await this.deps.repo.save()` — two separate awaited steps with a gap between the CHECK and the
 * ACT. When two `write()` calls are both in flight, both can complete their `load()`+check before
 * EITHER has committed its `save()`, so both pass the compare-and-set and the later `save()` silently
 * overwrites the earlier one — full data loss, reported to BOTH callers as success.
 *
 * The real `PagesHtmlDocumentStore` (`html-document-store.sqlite.ts`) does not have this window: its
 * `write()` is one atomic `UPDATE ... WHERE version = ?` SQL statement, so there is no separate
 * check-then-act step for two writers to interleave inside. This bug is confined to the in-memory
 * double.
 */

const clock = { nowIso: () => "2026-09-09T00:00:00.000Z" };
const WS = "ws-mem-cas";

async function harness(): Promise<{ repo: InMemoryPostRepo }> {
  const repo = new InMemoryPostRepo([]);
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "T", kind: "page" } });
  return { repo };
}

test("write() after read() updates body_html and increments version (sanity, mirrors the sqlite test)", async () => {
  const { repo } = await harness();
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });

  await store.ensureHtmlFormat("<p>old</p>");
  await store.read();
  await store.write("<p>new</p>");

  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(row?.bodyHtml, "<p>new</p>");
});

test("CIC-1 (sequential): two readers, then two SEQUENTIAL writes (read, read, write, write) — the second, stale writer is rejected", async () => {
  // This is the shape `html-document-store.sqlite.test.ts` certifies, and it already passes here:
  // by the time writerB's write() runs, writerA's write() (including its own internal save()) has
  // fully resolved, so writerB's load()-inside-write() sees the already-bumped version and rejects.
  // It is NOT the shape that matters for two truly concurrent tool calls — see the next test.
  const { repo } = await harness();
  const writerA = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });
  const writerB = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });

  await writerA.ensureHtmlFormat("<p>base</p>");
  const seenByA = await writerA.read();
  const seenByB = await writerB.read();
  assert.equal(seenByA, "<p>base</p>");
  assert.equal(seenByB, "<p>base</p>");

  await writerA.write("<p>A's edit</p>");

  await assert.rejects(() => writerB.write("<p>B's edit, computed against a document A already changed</p>"), PageConcurrentEditError);

  const finalRow = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(finalRow?.bodyHtml, "<p>A's edit</p>", "B's rejected write must not have landed, even partially");
});

test("BUG: two write() calls truly IN FLIGHT AT ONCE (not sequential) both succeed, and the later save() silently destroys the earlier writer's edit with no error to either caller", async () => {
  // Same two readers-see-the-same-base-version setup as the sequential test above. The only
  // difference is that BOTH write()s are started before either is awaited — exactly what two
  // parallel `pages_write_region` tool-call dispatches to different regions of the same page would
  // produce, and exactly the scenario `tool-registrations.write-region.test.ts`'s own file header
  // names as defect #2 this feature was supposed to close.
  const { repo } = await harness();
  const writerA = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });
  const writerB = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });

  await writerA.ensureHtmlFormat("<p>base</p>");
  await writerA.read();
  await writerB.read();

  const [a, b] = await Promise.allSettled([writerA.write("<p>A's edit</p>"), writerB.write("<p>B's edit</p>")]);

  // What SHOULD happen, matching CIC-1 and the sqlite store's own atomic behavior: exactly one of
  // the two writes lands, and the OTHER is rejected with PageConcurrentEditError — never both
  // "succeeding" while one is actually discarded.
  const outcomes = [a, b].map((r) => r.status);
  const rejectedCount = outcomes.filter((s) => s === "rejected").length;
  const fulfilledCount = outcomes.filter((s) => s === "fulfilled").length;

  assert.equal(
    rejectedCount,
    1,
    `expected exactly one writer to be rejected by the compare-and-set (matching the real sqlite store's atomic UPDATE...WHERE); ` +
      `got fulfilled=${fulfilledCount} rejected=${rejectedCount} — both writes reported success, meaning one silently clobbered the other`
  );

  // And whichever writer WAS accepted, its content must be the one actually stored — no reported
  // "success" may correspond to content that is not what ended up persisted.
  const finalRow = await repo.findById({ workspaceId: WS, id: "page-1" });
  const winnerWasA = a.status === "fulfilled";
  const expectedBody = winnerWasA ? "<p>A's edit</p>" : "<p>B's edit</p>";
  assert.equal(finalRow?.bodyHtml, expectedBody, "the reported winner's content must be what is actually persisted");
});

// ---------------------------------------------------------------------------
// S5 (web-high fix plan, 2026-09-24) — this twin must apply the same entity-liveness guard as the
// real sqlite store (`html-document-store.sqlite.test.ts`'s own S5 block), using `isTrashed()` over
// the row `repo.findById` returns.
// ---------------------------------------------------------------------------

const TRASH_MESSAGE = "ENTITY_IN_TRASH: page 'page-1' is in the Trash. Restore it from the Trash before changing it.";

test("read() rejects a trashed html-format page with the entity-liveness message", async () => {
  const { repo } = await harness();
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });
  await store.ensureHtmlFormat("<p>base</p>");

  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);
  await repo.softDelete({ workspaceId: WS, id: "page-1", deletedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z", version: row.version });

  await assert.rejects(() => store.read(), { message: TRASH_MESSAGE });
});

test("write() rejects when the row was trashed between this instance's read() and write()", async () => {
  const { repo } = await harness();
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { repo, clock });
  await store.ensureHtmlFormat("<p>base</p>");
  await store.read();

  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);
  await repo.softDelete({ workspaceId: WS, id: "page-1", deletedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z", version: row.version });

  await assert.rejects(() => store.write("<p>should never land</p>"), { message: TRASH_MESSAGE });

  const finalRow = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(finalRow?.bodyHtml, "<p>base</p>", "the trashed row's body_html must be untouched");
});
