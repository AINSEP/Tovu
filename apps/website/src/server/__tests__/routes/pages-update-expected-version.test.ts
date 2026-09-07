import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../../runtime/composition/app.js";

/**
 * @file C02 (fable bugs audit, 2026-09-06) — `PUT /pages/:pageId` must honour `expectedVersion`,
 * the same way `PUT /posts/:postId` already does.
 *
 * A Page and a Post are the same `posts` row — `updatePost` is kind-blind and both routes call it.
 * `9c7d16bf` wired the optimistic-concurrency basis through the posts route and `b37864c3` wired it
 * through the `content_post_update` agent tool, calling that "the guard's last unwired arm". It was
 * not: `parsePageUpdateBody` forwards `title`/`slug`/`bodyJson`/`status` and nothing else, so a
 * client that states its basis on the pages surface has that basis silently discarded and its stale
 * write applied — the exact clobber the guard exists to refuse, still reachable through the sibling
 * door. `routes/pages/update.ts`'s own error mapper had no `PostVersionConflictError` branch either,
 * and because that class extends `PostConflictError` the generic branch would have answered a
 * version conflict as `SLUG_CONFLICT` — telling the client to fix a slug that is not the problem.
 *
 * Harness: `createApp()` — the hermetic in-memory composition (`app.ts`'s `createRouteDeps`, seeded
 * from `./seed`, no filesystem, no `content.db`) — so this exercises the REAL route, the REAL body
 * parser and the REAL error mapper end to end over HTTP, which is where the omission lives. A test
 * against `updatePost` directly would pass today and prove nothing about this route.
 */

const WS = "workspace-local";

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const server = createServer(createApp());
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

  return { baseUrl, cookie };
}

interface PageRow {
  readonly id: string;
  readonly slug: string;
  readonly version: number;
}

async function createPage(baseUrl: string, cookie: string, title: string): Promise<PageRow> {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await response.text();
  assert.equal(response.status, 201, `creating a page fixture failed: ${raw}`);
  return (JSON.parse(raw) as { post: PageRow }).post;
}

function paragraph(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function putPage(
  baseUrl: string,
  cookie: string,
  page: PageRow,
  body: Record<string, unknown>
): Promise<{ status: number; raw: string }> {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${page.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Pricing", slug: page.slug, status: "draft", ...body }),
  });
  return { status: response.status, raw: await response.text() };
}

async function readPage(baseUrl: string, cookie: string, id: string) {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  return (JSON.parse(await response.text()) as { post: { version: number; bodyJson: unknown } }).post;
}

test("C02: PUT /pages/:id with a stale expectedVersion is refused 409 VERSION_CONFLICT, and the winning content survives", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createPage(baseUrl, cookie, "Pricing");

  // Operator B saves first and wins the row.
  const winner = await putPage(baseUrl, cookie, page, {
    bodyJson: paragraph("operator B — the winner"),
    expectedVersion: page.version,
  });
  assert.equal(winner.status, 200, winner.raw);

  // Operator A's basis is now stale. On `/posts/:id` this is a 409; on `/pages/:id` it was a 200
  // that erased B's document.
  const stale = await putPage(baseUrl, cookie, page, {
    bodyJson: paragraph("operator A — must not win"),
    expectedVersion: page.version,
  });

  assert.equal(stale.status, 409, `a stale basis must be refused, got ${stale.status}: ${stale.raw}`);
  const body = JSON.parse(stale.raw) as {
    code: string;
    details: { expectedVersion: number; currentVersion: number };
  };
  // Not `SLUG_CONFLICT`: the client must be able to tell "fix your slug and resend" apart from
  // "do NOT resend, you are about to erase someone's work".
  assert.equal(body.code, "VERSION_CONFLICT");
  assert.deepEqual(body.details, { expectedVersion: page.version, currentVersion: page.version + 1 });

  // The load-bearing assertion: the refusal wrote nothing.
  const after = await readPage(baseUrl, cookie, page.id);
  assert.deepEqual(after.bodyJson, paragraph("operator B — the winner"));
  assert.equal(after.version, page.version + 1, "a refused save must not advance the version");
});

test("C02: PUT /pages/:id applies normally when expectedVersion matches", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createPage(baseUrl, cookie, "Pricing");

  const response = await putPage(baseUrl, cookie, page, {
    bodyJson: paragraph("in sync"),
    expectedVersion: page.version,
  });

  assert.equal(response.status, 200, response.raw);
  const after = await readPage(baseUrl, cookie, page.id);
  assert.deepEqual(after.bodyJson, paragraph("in sync"));
});

test("C02: PUT /pages/:id without expectedVersion keeps last-write-wins — the guard stays opt-in on this arm too", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createPage(baseUrl, cookie, "Pricing");

  const first = await putPage(baseUrl, cookie, page, { bodyJson: paragraph("first") });
  assert.equal(first.status, 200, first.raw);
  const second = await putPage(baseUrl, cookie, page, { bodyJson: paragraph("second") });

  assert.equal(second.status, 200, second.raw);
  const after = await readPage(baseUrl, cookie, page.id);
  assert.deepEqual(after.bodyJson, paragraph("second"));
});

test("C02: PUT /pages/:id rejects a malformed expectedVersion with 400 rather than treating it as 'no basis sent'", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createPage(baseUrl, cookie, "Pricing");

  // A string basis is the dangerous case: coerced to "absent", it becomes an unguarded
  // last-write-wins save by a client that believes it is protected.
  const response = await putPage(baseUrl, cookie, page, {
    bodyJson: paragraph("mistyped basis"),
    expectedVersion: "1",
  });

  assert.equal(response.status, 400, response.raw);
  const body = JSON.parse(response.raw) as { error: string; code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "'expectedVersion' must be a non-negative integer when present");

  const after = await readPage(baseUrl, cookie, page.id);
  assert.equal(after.version, page.version, "a rejected request must not have written");
});
