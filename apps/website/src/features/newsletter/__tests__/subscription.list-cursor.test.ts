import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { once } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import express from "express";
import { sql } from "kysely";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { registerAdminNewsletterListSubscriptionsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-subscriptions";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { installNewsletterDataModule, NEWSLETTER_TABLE_NAMES } from "../data-module-manifest.js";
import { SqlNewsletterSubscriptionRepo } from "../repo-subscribers.js";
import { InMemoryNewsletterSubscriptionRepo } from "@jini-ai/user-management/newsletter/repo.memory";
import { buildNewsletterRegistrations, type NewsletterToolDeps } from "../tool-registrations.js";
import type { NewsletterSubscriptionRepoPort } from "@jini-ai/user-management/newsletter/ports";
import type { SubscriptionRow } from "@jini-ai/user-management/newsletter/types";

const WS = "ws-cursor";
const T0 = "2026-11-13T00:00:00.000Z";
function subscription(id: string, overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return { id, workspaceId: WS, listId: "list", subscriberId: `subscriber-${id}`, status: "subscribed",
    source: "admin", consentRevisionIdAtSubscribe: null, subscribedAt: T0, unsubscribedAt: null,
    createdAt: T0, updatedAt: T0, ...overrides };
}

function cases(make: () => NewsletterSubscriptionRepoPort): void {
  test("pages in ID order without crossing workspace or list boundaries", async () => {
    const repo = make();
    for (const id of ["s3", "s1", "s2"]) await repo.save(subscription(id));
    await repo.save(subscription("outside", { listId: "other" }));
    const first = await repo.list({ workspaceId: WS, listId: "list" }, { limit: 2 });
    assert.deepEqual(first.items.map(row => row.id), ["s1", "s2"]);
    assert.equal(typeof first.nextCursor, "string");
    const second = await repo.list({ workspaceId: WS, listId: "list" }, { limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items.map(row => row.id), ["s3"]);
    assert.equal(second.nextCursor, null);
    await assert.rejects(repo.list({ workspaceId: WS, listId: "list" }, { cursor: "invalid" }), /invalid cursor/i);
    await assert.rejects(repo.list({ workspaceId: WS, listId: "empty" }, { cursor: "invalid" }), /invalid cursor/i);
    await assert.rejects(repo.list({ workspaceId: WS, listId: "list" }, { cursor: "" }), /invalid cursor/i);
  });
}

function sqlRepo(base: ContentKernel): SqlNewsletterSubscriptionRepo {
  const ready = Object.values(NEWSLETTER_TABLE_NAMES).reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)), Promise.resolve(),
  ).then(() => installNewsletterDataModule({ db: base, dbPath: ":memory:" }));
  ready.catch(() => {});
  return new SqlNewsletterSubscriptionRepo(heldUntil(base, ready));
}
describeEachDialect("newsletter subscription cursor", { tables: [], make: sqlRepo }, make => cases(make));
describe("newsletter subscription cursor (memory)", () => cases(() => new InMemoryNewsletterSubscriptionRepo()));

test("subscription tool reports the next page in the existing subscriptions field", async () => {
  const repo = new InMemoryNewsletterSubscriptionRepo();
  for (const id of ["s1", "s2"]) await repo.save(subscription(id));
  const deps = { workspaceId: WS, newsletterReady: Promise.resolve(), newsletterSubscriptionRepo: repo,
    authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as NewsletterToolDeps;
  const tool = buildNewsletterRegistrations(deps).find(entry => entry.descriptor.id === "newsletter_list_subscriptions");
  assert.ok(tool);
  const schema = tool.descriptor.inputSchema as { properties: { cursor: { type: string }; limit: { maximum: number } } };
  assert.equal(schema.properties.cursor.type, "string");
  assert.equal(schema.properties.limit.maximum, 100);
  const ctx = { executionId: "exec", principal: { id: "principal" }, run: { id: "run" }, signal: new AbortController().signal };
  const first = await tool.handler({ ...ctx, input: { listId: "list", limit: 1 } }) as { subscriptions: SubscriptionRow[]; nextCursor: string; more: string };
  assert.deepEqual(first.subscriptions.map(row => row.id), ["s1"]);
  assert.equal(typeof first.nextCursor, "string");
  assert.match(first.more, /newsletter_list_subscriptions/);
  const second = await tool.handler({ ...ctx, input: { listId: "list", limit: 1, cursor: first.nextCursor } }) as { subscriptions: SubscriptionRow[]; nextCursor: string | null };
  assert.deepEqual(second.subscriptions.map(row => row.id), ["s2"]);
  assert.equal(second.nextCursor, null);
});

test("subscription route keeps its data envelope and continues through cursor", async () => {
  const repo = new InMemoryNewsletterSubscriptionRepo();
  for (const id of ["s1", "s2"]) await repo.save(subscription(id));
  const deps = { workspaceId: WS, newsletterReady: Promise.resolve(), newsletterSubscriptionRepo: repo,
    authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as NewsletterRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "principal" }; next(); });
  registerAdminNewsletterListSubscriptionsRoute({ app, deps });
  async function request(query: string): Promise<{ status: number; body: unknown }> {
    const socket = new PassThrough();
    let text = "";
    socket.on("data", chunk => { text += chunk.toString(); });
    const req = new IncomingMessage(socket as unknown as Socket);
    req.method = "GET";
    req.url = `/api/admin/v1/workspaces/${WS}/newsletter/lists/list/subscriptions${query}`;
    const res = new ServerResponse(req);
    res.assignSocket(socket as unknown as Socket);
    const finished = once(res, "finish");
    app(req, res);
    await finished;
    socket.destroy();
    return { status: res.statusCode, body: JSON.parse(text.split("\r\n\r\n")[1]) };
  }
  const response = await request("?limit=1");
  assert.equal(response.status, 200);
  const first = response.body as { data: SubscriptionRow[]; nextCursor: string };
  assert.deepEqual(first.data.map(row => row.id), ["s1"]);
  assert.equal(typeof first.nextCursor, "string");
  const second = (await request(`?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).body as { data: SubscriptionRow[]; nextCursor: string | null };
  assert.deepEqual(second.data.map(row => row.id), ["s2"]);
  assert.equal(second.nextCursor, null);
  const bad = await request("?cursor=invalid");
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { code: string }).code, "VALIDATION_ERROR");
});
