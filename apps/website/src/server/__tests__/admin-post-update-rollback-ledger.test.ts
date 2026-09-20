import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Regression certification for sol's 2026-09-20 High finding 3 — "rollback restores the
 * current post row but leaves a ghost revision and a ghost event behind".
 *
 * `PUT /posts/:postId` and `PUT /pages/:pageId` run their write through the command gateway, whose
 * compensating `rollback` fires when `changeSets.insert()` fails AFTER `updatePost()` already
 * applied. `updatePost` writes the row and appends an immutable `post_revisions` row as ONE
 * transaction (`features/post/post.ts`), then enqueues a status-transition event. A rollback that
 * only rewrites the row therefore leaves both side effects standing: a revision describing a state
 * that no longer exists, and an event announcing a transition that was undone.
 *
 * What is asserted here is the ledger and the outbox, not just "the row came back" — the row half
 * was already covered by `admin-post-page-delete-routes.test.ts` and passed while the ledger lied.
 *
 * Harness: the real composition root plus a real HTTP server, monkey-patching
 * `deps.changeSets.insert` to throw — the same technique the delete-routes suite uses to reach the
 * rollback branch, which no fixture data alone can force.
 */

const WS = "workspace-local";

async function startServerWithDeps(t: { after: (fn: () => Promise<void>) => void }): Promise<{
  baseUrl: string;
  cookie: string;
  deps: RouteDeps;
}> {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  return { baseUrl, cookie, deps };
}

async function createRow(
  baseUrl: string,
  cookie: string,
  surface: "posts" | "pages",
  body: Record<string, unknown>
): Promise<{ id: string; version: number }> {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  assert.equal(response.status, 201, `creating a ${surface} fixture failed: ${raw}`);
  const { post } = JSON.parse(raw) as { post: { id: string; version: number } };
  return { id: post.id, version: post.version };
}

/** Records every event the route enqueues, without claiming or draining the real outbox rows. */
function spyOnOutbox(deps: RouteDeps): { names: () => string[]; restore: () => void } {
  const enqueued: string[] = [];
  const original = deps.outbox.enqueue.bind(deps.outbox);
  deps.outbox.enqueue = async (event: DomainEvent) => {
    if (event.name.startsWith("entry.")) enqueued.push(event.name);
    return original(event);
  };
  return { names: () => enqueued, restore: () => void (deps.outbox.enqueue = original) };
}

/**
 * Drives one surface's update route into the gateway's rollback branch and hands back the state the
 * assertions below judge: the row that survived, its revision ledger, and the status events the
 * undone write announced.
 */
async function rollBackAnUpdate(
  t: { after: (fn: () => Promise<void>) => void },
  surface: "posts" | "pages"
) {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const { id, version } = await createRow(baseUrl, cookie, surface, {
    title: "Ledger Fixture",
    status: "draft",
  });

  const outbox = spyOnOutbox(deps);
  const originalInsert = deps.changeSets.insert.bind(deps.changeSets);
  deps.changeSets.insert = async () => {
    throw new Error("simulated change-set persistence failure");
  };
  try {
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        title: "Ghost Title",
        slug: "ghost-title",
        bodyJson: { type: "doc", content: [] },
        status: "published",
        expectedVersion: version,
      }),
    });
    assert.equal(response.status, 500, await response.text());
  } finally {
    deps.changeSets.insert = originalInsert;
    outbox.restore();
  }

  const current = await deps.postRepo.findById({ workspaceId: WS, id });
  assert.ok(current, "the rolled-back row must still exist");
  const revisions = await deps.postRepo.listRevisions({ workspaceId: WS, postId: id });
  return { current, revisions, statusEvents: outbox.names() };
}

for (const surface of ["posts", "pages"] as const) {
  test(`PUT ${surface}: a rolled-back update leaves no revision describing a state the row never kept`, async (t) => {
    const { current, revisions } = await rollBackAnUpdate(t, surface);

    assert.equal(current.title, "Ledger Fixture", "the rollback must restore the pre-edit title");
    assert.equal(current.status, "draft", "the rollback must restore the pre-edit status");

    const newest = revisions.at(-1);
    assert.ok(newest, "the ledger must carry at least the create revision");
    assert.equal(
      newest.seq,
      current.version,
      `the newest revision must describe the row that actually exists (seq ${newest.seq} vs row version ${current.version})`
    );
    assert.equal(
      newest.stateJson.title,
      current.title,
      "the newest revision's snapshot must be the row's real current state, not the undone write's"
    );
    assert.equal(
      revisions.filter((revision) => revision.seq > current.version).length,
      0,
      "no revision may sit at a seq beyond the row's own version — that seq belongs to a state that never survived"
    );
    assert.equal(
      new Set(revisions.map((revision) => revision.seq)).size,
      revisions.length,
      "every seq in the ledger must map to exactly one state (post_revisions has an index, not a unique constraint, so a duplicate seq is silently accepted)"
    );
  });

  test(`PUT ${surface}: a rolled-back publish does not leave an uncompensated entry.published event`, async (t) => {
    const { current, statusEvents } = await rollBackAnUpdate(t, surface);

    assert.equal(current.status, "draft", "the rollback must restore the pre-edit status");
    assert.deepEqual(
      statusEvents,
      ["entry.published", "entry.unpublished"],
      "the undone draft->published write announced entry.published; the rollback must announce the matching entry.unpublished rather than leave subscribers believing the row is live"
    );
  });
}
