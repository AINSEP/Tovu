import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { InMemoryChangeSetRepo } from "#src/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/core/events/index";
import { InMemoryPostRepo, InMemoryPostSearchIndex } from "#src/features/post";
import { buildPostRegistrations } from "#src/features/post/tool-registrations";
import type { RouteDeps } from "#src/server/routes/types";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route";
import { createSurfaceExchangeStore } from "../../core/tool-surface-exchanges";

/**
 * @file The real, non-mocked round trip through the MCP-UI callback route's Shape 2 (legacy,
 * no-exchange) path for `content_post_search` — the tool the `/search` composer capability's
 * `allowlisted-tool-call` binding (`apps/admin/src/features/plugins/composer-capabilities.ts`)
 * calls. Mirrors `mcp-ui-tool-calls-route.integration.test.ts`'s own "wire the REAL ToolRegistry,
 * not a fake ToolExecutor" discipline, adapted for the tool this allowlist entry is actually for:
 * `content_post_search` never opens a `SurfaceExchangeStore` exchange (`search.ts`'s
 * `PostSearchPort.search()` has nothing to park on — it is a plain SELECT), so this is the
 * browser-initiated, no-model, no-park round trip a composer selection makes. That is the one case
 * `mcp-ui-tool-calls-route.test.ts`'s own fake-executor coverage cannot certify: a fake executor can
 * prove the ROUTE's contract, but not that the real `content_post_search` handler actually ran and
 * returned real data.
 *
 * Written and run against the pre-change code first (`MCP_UI_REDEEMABLE_TOOL_IDS` without
 * `content_post_search`), where the first test below fails with a 403 `TOOL_NOT_ALLOWLISTED` rather
 * than the 200 it asserts — the required RED evidence for this dispatch's allowlist addition. See
 * the Programmer handoff for the verbatim red output.
 */

const WORKSPACE_ID = "ws-mcp-ui-search-integration";
const NOW = "2026-08-12T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

/** Builds the real tool surface for Posts/Pages: one registry, one production-shaped executor (no
 *  `delegate`, matching `agent-daemon-server.ts`'s own construction), over an in-memory repo AND a
 *  real `InMemoryPostSearchIndex` (the same FTS5/BM25-shaped adapter `tool-registrations.post.test.ts`
 *  uses) so `content_post_search` is certified against real ranking, not a hand-fed result list. */
function buildRealPostToolExecutor() {
  const postRepo = new InMemoryPostRepo();
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    postSearch: new InMemoryPostSearchIndex(postRepo),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as RouteDeps;

  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor, postRepo };
}

async function seedPost(postRepo: InMemoryPostRepo) {
  await postRepo.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Quarterly Pricing Report",
    slug: "quarterly-pricing-report",
    bodyJson: EMPTY_DOC,
    status: "published",
    kind: "post",
    updatedAt: NOW,
    version: 1,
  } as never);
}

test("real round trip: the browser-initiated /search allowlisted-tool-call actually returns REAL search hits, not a stub", async (t) => {
  const { toolExecutor, postRepo } = buildRealPostToolExecutor();
  await seedPost(postRepo);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges: createSurfaceExchangeStore() });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-admin-1" },
    body: JSON.stringify({ toolName: "content_post_search", params: { query: "quarterly" } }),
  });

  const body = (await res.json()) as { hits?: Array<{ id: string; title: string; slug: string }> };
  assert.equal(res.status, 200, `expected the real search to execute through the allowlist: ${JSON.stringify(body)}`);
  assert.equal(body.hits?.length, 1, `expected exactly the one seeded post to match 'quarterly': ${JSON.stringify(body)}`);
  assert.equal(body.hits?.[0]?.id, "p1");
  assert.equal(body.hits?.[0]?.title, "Quarterly Pricing Report");
  assert.equal(body.hits?.[0]?.slug, "quarterly-pricing-report");
});

test("an unrelated query against the same real index returns no hits, proving this is ranked search rather than a fixed stub reply", async (t) => {
  const { toolExecutor, postRepo } = buildRealPostToolExecutor();
  await seedPost(postRepo);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges: createSurfaceExchangeStore() });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-admin-1" },
    body: JSON.stringify({ toolName: "content_post_search", params: { query: "nonexistentzzz" } }),
  });

  const body = (await res.json()) as { hits?: unknown[] };
  assert.equal(res.status, 200);
  assert.equal(body.hits?.length, 0);
});
