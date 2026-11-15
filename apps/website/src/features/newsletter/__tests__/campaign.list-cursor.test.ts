import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { once } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import express from "express";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { registerAdminNewsletterListCampaignsRoute } from "#src/server/inbound/admin-http/routes/newsletter/list-campaigns";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { buildNewsletterRegistrations } from "../tool-registrations.js";
import { SqlNewsletterCampaignRepo } from "../repo.js";
import { InMemoryNewsletterCampaignRepo } from "../repo.memory.js";
import type { NewsletterCampaignRepoPort } from "../ports.js";
import type { CampaignRecord } from "../types.js";

const WS = "workspace-local";
const T0 = "2026-11-13T00:00:00.000Z";

function campaign(id: string, overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return { id, workspaceId: WS, status: "draft", subject: id, preheader: null, fromName: "Sender",
    fromEmail: "sender@example.com", replyTo: "reply@example.com", listId: "list-1", scheduledAt: null,
    sendStartedAt: null, audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1, createdByPrincipal: "principal", createdAt: T0, updatedAt: T0, ...overrides };
}

function listCases(make: () => NewsletterCampaignRepoPort): void {
  test("reads every campaign exactly once, preserving workspace isolation", async () => {
    const repo = make();
    for (const id of ["c3", "c1", "c2"]) await repo.saveCampaignRow(campaign(id));
    await repo.saveCampaignRow(campaign("foreign", { workspaceId: "other" }));
    const first = await repo.list({ workspaceId: WS }, { limit: 2 });
    assert.deepEqual(first.items.map(row => row.id), ["c1", "c2"]);
    assert.equal(typeof first.nextCursor, "string");
    const second = await repo.list({ workspaceId: WS }, { limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items.map(row => row.id), ["c3"]);
    assert.equal(second.nextCursor, null);
  });

  test("rejects a malformed cursor", async () => {
    const repo = make();
    await assert.rejects(repo.list({ workspaceId: WS }, { cursor: "invalid" }), /invalid cursor/i);
    await repo.saveCampaignRow(campaign("c1"));
    await assert.rejects(repo.list({ workspaceId: WS }, { cursor: "invalid" }), /invalid cursor/i);
    await assert.rejects(repo.list({ workspaceId: WS }, { cursor: "" }), /invalid cursor/i);
  });
}

describeEachDialect("newsletter campaign cursor", { tables: ["newsletter_campaigns"], make: (kernel: ContentKernel) => new SqlNewsletterCampaignRepo(kernel) }, make => listCases(make));
describe("newsletter campaign cursor (memory)", () => listCases(() => new InMemoryNewsletterCampaignRepo()));

function routeDeps(): NewsletterRouteDeps {
  return { workspaceId: WS, newsletterReady: Promise.resolve(), newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as NewsletterRouteDeps;
}

test("campaign tool exposes a continuation even if the first page has no status matches", async () => {
  const deps = routeDeps();
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c1", { status: "sent" }));
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c2"));
  const tool = buildNewsletterRegistrations(deps).find(entry => entry.descriptor.id === "newsletter_list_campaigns");
  assert.ok(tool);
  const schema = tool.descriptor.inputSchema as { properties: { cursor: { type: string }; limit: { maximum: number } } };
  assert.equal(schema.properties.cursor.type, "string");
  assert.equal(schema.properties.limit.maximum, 100);
  const context = { executionId: "exec", principal: { id: "principal" }, run: { id: "run" }, signal: new AbortController().signal };
  const first = await tool.handler({ ...context, input: { status: "draft", limit: 1 } }) as { campaigns: CampaignRecord[]; nextCursor: string; more: string };
  assert.deepEqual(first.campaigns, []);
  assert.equal(typeof first.nextCursor, "string");
  assert.match(first.more, /newsletter_list_campaigns/);
  const second = await tool.handler({ ...context, input: { status: "draft", limit: 1, cursor: first.nextCursor } }) as { campaigns: CampaignRecord[]; nextCursor: string | null };
  assert.deepEqual(second.campaigns.map(row => row.id), ["c2"]);
  assert.equal(second.nextCursor, null);
});

test("campaign HTTP response keeps data and exposes the next page", async () => {
  const deps = routeDeps();
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c1"));
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c2"));
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "principal" }; next(); });
  registerAdminNewsletterListCampaignsRoute({ app, deps });
  // The sandbox disallows listening sockets, so send an actual Express request over an in-memory stream.
  async function request(query: string): Promise<{ status: number; body: unknown }> {
    const socket = new PassThrough();
    let response = "";
    socket.on("data", chunk => { response += chunk.toString(); });
    const req = new IncomingMessage(socket);
    req.method = "GET";
    req.url = `/api/admin/v1/workspaces/${WS}/newsletter/campaigns${query}`;
    const res = new ServerResponse(req);
    res.assignSocket(socket as unknown as Socket);
    const finished = once(res, "finish");
    app(req, res);
    await finished;
    socket.destroy();
    return { status: res.statusCode, body: JSON.parse(response.split("\r\n\r\n")[1]) };
  }
  const firstResponse = await request("?limit=1");
  assert.equal(firstResponse.status, 200);
  const first = firstResponse.body as { data: CampaignRecord[]; nextCursor: string };
  assert.deepEqual(first.data.map(row => row.id), ["c1"]);
  assert.equal(typeof first.nextCursor, "string");
  const secondResponse = await request(`?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);
  const second = secondResponse.body as { data: CampaignRecord[]; nextCursor: string | null };
  assert.deepEqual(second.data.map(row => row.id), ["c2"]);
  assert.equal(second.nextCursor, null);
  const bad = await request("?cursor=invalid");
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { code: string }).code, "VALIDATION_ERROR");
});
