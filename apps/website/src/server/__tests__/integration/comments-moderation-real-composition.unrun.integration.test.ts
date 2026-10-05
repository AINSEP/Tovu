// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — comments: public
 * no-login submission (`public-http/routes/site/comments-submit.ts`) → admin moderation queue →
 * approve / spam / trash / restore / purge (`routes/comments/{moderation-queue,moderate,
 * put-settings}.ts`) through the REAL site composition on both dialects.
 *
 * Every moderation route test today mounts the hermetic root's in-memory comment repo. The Kysely
 * `SqliteCommentRepo` (`p_comments__comments`, a data-module table) is dialect-tested on its own, but
 * the composed seam — the module's `entryLookup` reading the collections `entries` table, the ledger
 * settings read per request, the moderation-version compare-and-set, the Trash index following a
 * status flip, and the keyset cursor — has never answered HTTP on Postgres.
 *
 * Comments attach to collection ENTRIES (`createCommentsModule`'s `entryRepo` is `SqliteEntryRepo`),
 * not posts, so each test registers a content type and publishes one entry first.
 *
 * Unknown queue cursor: the INTENDED answer is 400 VALIDATION_ERROR (the repo throws
 * `ToolInputError("invalid cursor")`); a fix in this area is in flight, so only status + code are
 * pinned, not the message.
 */

const TYPE = { key: "unrun_article", label: "Unrun Article", fields: [] };

interface QueuedComment {
  id: string;
  entryId: string;
  status: string;
  bodyText: string;
  authorName: string;
  version: number;
}

interface QueuePage {
  items: QueuedComment[];
  nextCursor: string | null;
}

async function publishedEntry(site: BootedSite): Promise<string> {
  await expectJson(await send(site, "POST", "/api/admin/v1/content-types", TYPE), 201);
  const { entry } = await expectJson<{ entry: { id: string; version: number } }>(
    await send(site, "POST", "/api/admin/v1/entries", { type: TYPE.key, slug: "unrun-commentable", title: "Commentable" }),
    201
  );
  await expectJson(await send(site, "POST", `/api/admin/v1/entries/${entry.id}/lifecycle`, { op: "publish", expectedVersion: entry.version }), 200);
  return entry.id;
}

/** Anonymous: no session cookie, exactly as a site visitor posts. */
async function submit(site: BootedSite, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${site.baseUrl}/api/site/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function submitOk(site: BootedSite, entryId: string, text: string): Promise<string> {
  const created = await expectJson<{ id: string; status: string }>(await submit(site, { entryId, authorName: "Visitor", body: text }), 201);
  assert.equal(created.status, "pending", "requireModeration defaults on, so a fresh comment waits in the queue");
  return created.id;
}

async function queue(site: BootedSite, query = ""): Promise<QueuePage> {
  return expectJson<QueuePage>(await send(site, "GET", `${site.ws}/comments/queue${query}`), 200);
}

async function moderate(site: BootedSite, id: string, action: string, expectedVersion: number): Promise<Response> {
  return send(site, "POST", `${site.ws}/comments/${id}/${action}`, { expectedVersion });
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] comments [${dialect}]: an anonymous comment on a published entry is stored pending and appears in the admin queue`, async (t) => {
    const site = await bootSite(t, dialect);
    const entryId = await publishedEntry(site);
    const id = await submitOk(site, entryId, "First unrun comment");

    const page = await queue(site);
    assert.deepEqual(
      page.items.map((row) => ({ id: row.id, entryId: row.entryId, status: row.status, bodyText: row.bodyText, authorName: row.authorName, version: row.version })),
      [{ id, entryId, status: "pending", bodyText: "First unrun comment", authorName: "Visitor", version: 0 }]
    );
    assert.equal(page.nextCursor, null);

    const unknownEntry = await expectJson(await submit(site, { entryId: "no-such-entry", authorName: "V", body: "x" }), 422);
    assert.deepEqual(unknownEntry, { error: "comment was not accepted", reason: "entry-not-found" });
    const honeypot = await expectJson(await submit(site, { entryId, authorName: "Bot", body: "buy", website: "http://spam.example" }), 422);
    assert.deepEqual(honeypot, { error: "comment was not accepted", reason: "honeypot-tripped" });
    assert.equal((await queue(site)).items.length, 1, "refused submissions wrote nothing");
  });

  test(`[unrun] comments [${dialect}]: approve moves it out of the pending queue; a stale expectedVersion is 409 with the current version`, async (t) => {
    const site = await bootSite(t, dialect);
    const entryId = await publishedEntry(site);
    const id = await submitOk(site, entryId, "Approve me");

    assert.equal((await moderate(site, id, "approve", 0)).status, 204);
    assert.deepEqual((await queue(site)).items, []);
    const approved = await queue(site, "?status=approved");
    assert.deepEqual(approved.items.map((row) => ({ id: row.id, status: row.status, version: row.version })), [{ id, status: "approved", version: 1 }]);

    assert.deepEqual(await expectJson(await moderate(site, id, "spam", 0), 409), { error: "conflict", currentVersion: 1 });
    assert.deepEqual(await expectJson(await moderate(site, "no-such-comment", "approve", 0), 404), { error: "not-found" });
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/comments/${id}/approve`, {}), 400), {
      error: "expectedVersion is required and must be a non-negative integer",
    });
  });

  test(`[unrun] comments [${dialect}]: spam then trash lists it in the Trash; restore clears the Trash row; purge deletes it for good`, async (t) => {
    const site = await bootSite(t, dialect);
    const entryId = await publishedEntry(site);
    const id = await submitOk(site, entryId, "Borderline comment");

    assert.equal((await moderate(site, id, "spam", 0)).status, 204);
    assert.deepEqual((await queue(site, "?status=spam")).items.map((row) => row.id), [id]);

    assert.equal((await moderate(site, id, "trash", 1)).status, 204);
    const trashRows = async (): Promise<Array<{ entityType: string; entityId: string }>> =>
      (await expectJson<{ items: Array<{ entityType: string; entityId: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200)).items
        .filter((item) => item.entityId === id)
        .map((item) => ({ entityType: item.entityType, entityId: item.entityId }));
    assert.deepEqual(await trashRows(), [{ entityType: "comment", entityId: id }]);

    assert.equal((await moderate(site, id, "restore", 2)).status, 204);
    assert.deepEqual(await trashRows(), [], "leaving trash forgets the Trash index row");
    assert.deepEqual((await queue(site, "?status=approved")).items.map((row) => ({ id: row.id, version: row.version })), [{ id, version: 3 }]);

    assert.equal((await send(site, "POST", `${site.ws}/comments/${id}/purge`, {})).status, 204);
    for (const status of ["pending", "approved", "spam", "trash"]) {
      assert.deepEqual((await queue(site, `?status=${status}`)).items, [], `nothing left under ${status}`);
    }
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/comments/${id}/purge`, {}), 404), { error: "not-found" });
  });

  test(`[unrun] comments [${dialect}]: the queue pages oldest-first by keyset cursor; an unknown cursor or bad status is 400 VALIDATION_ERROR`, async (t) => {
    const site = await bootSite(t, dialect);
    const entryId = await publishedEntry(site);
    const ids = [];
    for (const n of [1, 2, 3]) ids.push(await submitOk(site, entryId, `Queued ${n}`));

    // Order within one millisecond falls back to `id` (random), so pin page sizes and coverage, not
    // which body lands on which page.
    const first = await queue(site, "?limit=2");
    assert.equal(first.items.length, 2);
    assert.equal(first.nextCursor, first.items[1].id);
    const second = await queue(site, `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
    assert.deepEqual([...first.items, ...second.items].map((row) => row.id).sort(), [...ids].sort(), "every comment exactly once across pages");

    const unknown = await expectJson<{ code: string }>(await send(site, "GET", `${site.ws}/comments/queue?cursor=not-a-comment-id`), 400);
    assert.equal(unknown.code, "VALIDATION_ERROR");
    const badStatus = await expectJson<{ code: string }>(await send(site, "GET", `${site.ws}/comments/queue?status=bogus`), 400);
    assert.equal(badStatus.code, "VALIDATION_ERROR");
  });

  test(`[unrun] comments [${dialect}]: turning requireModeration off via settings publishes the next comment straight to approved; disabling comments refuses submissions`, async (t) => {
    const site = await bootSite(t, dialect);
    const entryId = await publishedEntry(site);

    const put = await expectJson<{ data: { requireModeration: boolean } }>(await send(site, "PUT", `${site.ws}/comments/settings`, { requireModeration: false }), 200);
    assert.equal(put.data.requireModeration, false);
    const created = await expectJson<{ id: string; status: string }>(await submit(site, { entryId, authorName: "V", body: "Straight through" }), 201);
    assert.equal(created.status, "approved", "the ledger setting is read live on the next request");

    await expectJson(await send(site, "PUT", `${site.ws}/comments/settings`, { enabled: false }), 200);
    assert.deepEqual(await expectJson(await submit(site, { entryId, authorName: "V", body: "Too late" }), 422), {
      error: "comment was not accepted",
      reason: "comments-disabled",
    });

    const invalid = await expectJson<{ code: string }>(await send(site, "PUT", `${site.ws}/comments/settings`, { maxDepth: -1 }), 400);
    assert.equal(invalid.code, "COMMENTS_SETTINGS_VALIDATION_ERROR");
  });
}
