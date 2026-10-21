import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor, type SqlPostRepo } from "#src/features/post/repo";
import { announceDueGoLives } from "#src/features/post/go-live";
import { SqlPagesHtmlDocumentStore } from "../html-document-store.js";

/**
 * @file HTML page writes and the go-live sweep (review fix, 2026-10-21). A write moves `updated_at`
 * past a passed `publish_at`, after which the sweep (`post/go-live.ts`) no longer sees the row; a
 * scheduled page edited between its go-live and the first sweep used to lose its `entry.published`
 * for good. Both write paths (`write`, `ensureHtmlFormat`'s conversion) now announce a pending
 * go-live in the write's own transaction.
 */

const WS = "ws-pages-go-live";
const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const GO_LIVE_ID = `page-1-entry.published-at-${GO_LIVE}`;

function clockAt(iso: string) {
  let now = Date.parse(iso);
  return { nowMs: () => now, set: (next: string) => { now = Date.parse(next); } };
}

/** Records ids, a repeated id a no-op like both real outboxes; throws while `failing`. */
function recordingOutbox(): OutboxPort & { ids: string[]; failing: boolean } {
  const outbox = {
    ids: [] as string[],
    failing: false,
    enqueue: async (event: DomainEvent) => {
      if (outbox.failing) throw new Error("outbox unavailable");
      if (!outbox.ids.includes(event.id)) outbox.ids.push(event.id);
    },
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };
  return outbox;
}

/** A published page scheduled for GO_LIVE, last saved at SAVED (while still scheduled). */
async function insertScheduledPage(db: ContentKernel, spec: { html?: string } = {}): Promise<void> {
  await db.run((q) =>
    q
      .insertInto("posts")
      .values({
        id: "page-1",
        workspace_id: WS,
        title: "Launch",
        slug: "launch",
        body_json: spec.html === undefined ? JSON.stringify({ type: "doc", content: [] }) : null,
        body_format: spec.html === undefined ? "doc" : "html",
        body_html: spec.html ?? null,
        status: "published",
        kind: "page",
        publish_at: GO_LIVE,
        updated_at: SAVED,
        version: 1,
        ext: "{}",
      })
      .execute()
  );
}

async function bodyHtml(db: ContentKernel): Promise<string | null | undefined> {
  return (await db.run((q) => q.selectFrom("posts").select("body_html").where("id", "=", "page-1").executeTakeFirst()))?.body_html;
}

describeEachDialect("SqlPagesHtmlDocumentStore go-live catch-up", {
  tables: ["posts", "post_revisions"],
  make: (kernel): { db: ContentKernel; repo: SqlPostRepo } => ({ db: kernel, repo: postRepoFor(kernel) }),
}, (harness) => {
  const sweep = (repo: SqlPostRepo, outbox: OutboxPort, nowIso: string) => announceDueGoLives({ deps: { repo, outbox }, input: { workspaceId: WS, nowIso } });

  test("an HTML edit between go-live and the first sweep announces the go-live once", async () => {
    const { db, repo } = harness();
    await insertScheduledPage(db, { html: "<p>v1</p>" });
    const outbox = recordingOutbox();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock: clockAt(LATER), revisions: repo, outbox });
    await store.read();
    await store.write("<p>v2</p>");
    await sweep(repo, outbox, LATER);
    assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
  });

  test("an HTML edit before go-live announces nothing; the sweep still announces at go-live", async () => {
    const { db, repo } = harness();
    await insertScheduledPage(db, { html: "<p>v1</p>" });
    const outbox = recordingOutbox();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock: clockAt("2026-10-21T11:00:00.000Z"), revisions: repo, outbox });
    await store.read();
    await store.write("<p>v2</p>");
    assert.deepEqual(outbox.ids, []);
    await sweep(repo, outbox, GO_LIVE);
    assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
  });

  test("ensureHtmlFormat's conversion after go-live announces the pending go-live", async () => {
    const { db, repo } = harness();
    await insertScheduledPage(db);
    const outbox = recordingOutbox();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock: clockAt(LATER), revisions: repo, outbox });
    await store.ensureHtmlFormat("<p>seed</p>");
    assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
  });

  test("a failed enqueue rolls the HTML write back, so the sweep still sees the page", async () => {
    const { db, repo } = harness();
    await insertScheduledPage(db, { html: "<p>v1</p>" });
    const outbox = recordingOutbox();
    outbox.failing = true;
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock: clockAt(LATER), revisions: repo, outbox });
    await store.read();
    await assert.rejects(store.write("<p>v2</p>"), /outbox unavailable/);
    assert.equal(await bodyHtml(db), "<p>v1</p>", "rolled back");
    outbox.failing = false;
    await sweep(repo, outbox, LATER);
    assert.deepEqual(outbox.ids, [GO_LIVE_ID]);
  });

  test("without a ledger the write still runs in a kernel transaction: a failed enqueue rolls it back", async () => {
    const { db } = harness();
    await insertScheduledPage(db, { html: "<p>v1</p>" });
    const outbox = recordingOutbox();
    outbox.failing = true;
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock: clockAt(LATER), outbox });
    await store.read();
    await assert.rejects(store.write("<p>v2</p>"), /outbox unavailable/);
    assert.equal(await bodyHtml(db), "<p>v1</p>");
  });
});
