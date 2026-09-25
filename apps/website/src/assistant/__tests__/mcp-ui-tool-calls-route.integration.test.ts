import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildPostRegistrations } from "#src/features/post/tool-registrations";
import type { RouteDeps } from "#src/server/routes/types";

import { removeVia } from "../../features/post/__tests__/remove-post-double.js";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The real, non-mocked round trip through the MCP-UI callback route's Shape 1 (exchange
 * delivery), requested directly by the Coordinator for the same reason the file this replaces was:
 * `mcp-ui-tool-calls-route.test.ts` only ever exercises the route's OWN contract against a fake
 * `ToolExecutor`/fake `SurfaceExchangeStore`, which cannot catch a principal-binding mismatch between
 * the call that opens an exchange and the delivery that answers it.
 *
 * ## Why this file was rewritten rather than patched (ADR-055 Decision 2)
 *
 * The file this replaces certified Shape 2 — the legacy token-redemption call — end to end for
 * `content_post_delete`, because that tool was Shape 2's only wired user. `content_post_delete` has
 * moved to Shape 1 (a held-open exchange): the model's ONE call to `toolExecutor.execute` never
 * returns until the human answers, and the human's answer arrives through THIS route as an exchange
 * delivery, not a second `toolExecutor.execute` call. So the thing worth certifying end to end changed
 * shape along with the tool, and Shape 2 currently has no wired caller to certify against (see
 * `mcp-ui-tool-calls.ts` / `mcp-ui-tool-calls-route.ts` for where that legacy branch still lives).
 *
 * This file wires the REAL `ToolRegistry` + `createToolExecutor` (no `delegate`, matching
 * `agent-daemon-server.ts`'s own construction exactly) over `buildPostRegistrations`'s REAL
 * `content_post_delete` handler and a REAL `SurfaceExchangeStore` — the same store instance the route
 * is mounted with, exactly as `agent-daemon-server.ts` requires — then:
 *
 *  1. Calls `toolExecutor.execute(...)` directly with a real `emitSurface`, exactly the way
 *     `@jini-ai/daemon`'s `delegated-tool-bridge.ts` does for a real spawned-agent tool call. The call
 *     does not resolve — it is parked on the exchange it just opened.
 *  2. Extracts the real exchange id from the ACTUAL emitted MCP-UI resource's HTML (the same
 *     regex-based extraction `demo-choices-tool.test.ts`/`agent-tools.delete-confirmation.test.ts` use
 *     — simulating what the rendered iframe reads, not stubbing it).
 *  3. Delivers the human's answer through THIS route (`registerMcpUiToolCallsRoute`, over real HTTP
 *     via `startTestServer`), for that SAME principal — and asserts the post is ACTUALLY trashed in
 *     the backing repo once the parked `execute()` call resolves, not just that the HTTP response
 *     looked right.
 *  4. Repeats step 3 with a DIFFERENT principal in {@link RUN_PRINCIPAL_HEADER} and asserts the
 *     delivery is refused (`binding-mismatch`) and nothing is delivered to the parked call.
 *
 * What this deliberately does NOT do: boot the full `agent-daemon-server.ts` process or a real
 * `RunLifecycle`/`/api/delegated-tool-calls` hop — unnecessary for what is under test here (the route's
 * own delivery contract against a real store and a real parked handler), and it would turn a focused
 * test into an integration test of unrelated machinery (run start, attachment claiming, ...).
 */

const WORKSPACE_ID = "ws-mcp-ui-exchange-integration";
const NOW = "2026-08-04T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

/** Builds the real tool surface: one registry, one production-shaped executor (no `delegate`, no
 * mocks), over an in-memory Posts repo so a real soft-delete can be asserted directly.
 *
 * `removePost` uses the project's established `RemovePostFn` double (`remove-post-double.ts`'s
 * `removeVia`) rather than the real `TrashPort` binding: production's post trash adapter
 * (`trash/adapters/post.ts`) writes raw SQL against `content.db`, which this in-memory harness has
 * no analogue for. `deletePost` (post.ts, 9822f7697) has depended on an injected `remove` since
 * 2026-09-20; this route's own test double is only for the index-less marker flip that fixture
 * covers — see `features/trash/__tests__/` for the real-store, index-included coverage. */
function buildRealPostToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
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
    removePost: removeVia(postRepo),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as RouteDeps;

  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  // Same construction as `agent-daemon-server.ts`'s own `createToolExecutor({ registry })` call —
  // no `delegate` — so this exercises the real production configuration, not an idealized one.
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor, postRepo };
}

async function seedPost(postRepo: InMemoryPostRepo) {
  const row = {
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Quarterly Report",
    slug: "quarterly-report",
    bodyJson: EMPTY_DOC,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: NOW,
    version: 1,
  };
  await postRepo.save(row as never);
  return row;
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would. */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Calls `content_post_delete` through the REAL executor, exactly as a spawned agent's first (and
 * only) call would — including the `emitSurface` `delegated-tool-bridge.ts` always supplies. */
async function openRealDialog(
  toolExecutor: ReturnType<typeof buildRealPostToolExecutor>["toolExecutor"],
  principalId: string,
): Promise<{ pending: ReturnType<typeof toolExecutor.execute>; exchangeId: string }> {
  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: principalId },
    { id: "run-1" },
    "content_post_delete",
    { id: "p1", kind: "post" },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  return { pending, exchangeId: exchangeIdFromEmission(emitted[0]) };
}

test("real round trip: an exchange delivery from the SAME principal that opened it actually trashes the post", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, postRepo } = buildRealPostToolExecutor(surfaceExchanges);
  await seedPost(postRepo);
  const PRINCIPAL = "principal-admin-1";

  const { pending, exchangeId } = await openRealDialog(toolExecutor, PRINCIPAL);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: "content_post_delete",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    }),
  });

  const body = (await res.json()) as { delivered: boolean };
  assert.equal(res.status, 202, `expected the delivery to be accepted: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  // Deliberately not the tool's own result — the route returns `{delivered:true}` because the
  // outcome belongs to the AGENT's call, not this HTTP response. Assert that call resolves truthfully.
  const executed = await pending;
  assert.equal(executed.status, "completed", `mint call must resolve completed: ${JSON.stringify(executed)}`);
  const output = executed.output as { deleted: boolean; cancelled: boolean };
  assert.equal(output.deleted, true);
  assert.equal(output.cancelled, false);

  // The load-bearing assertion: not just a 202 and a completed status, but the row is ACTUALLY
  // trashed in the backing repo.
  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "a soft delete keeps the row");
  assert.equal(row.deletedAt, NOW, "the post must be genuinely trashed, not merely reported as deleted");
  assert.equal(row.version, 2);
});

test("SECURITY: a delivery from a DIFFERENT principal than the one that opened the exchange is refused, and nothing is delivered", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, postRepo } = buildRealPostToolExecutor(surfaceExchanges);
  await seedPost(postRepo);

  // Open as one principal (models the run that raised the dialog)...
  const { pending, exchangeId } = await openRealDialog(toolExecutor, "principal-who-ran-the-agent");

  // ...deliver as a DIFFERENT principal (models a session/run-principal mismatch — exactly the
  // failure mode this route's binding check exists to catch: if the value RUN_PRINCIPAL_HEADER
  // carries at delivery time ever disagreed with the value recorded when the exchange was opened,
  // this is what it would look like).
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-someone-else" },
    body: JSON.stringify({
      toolName: "content_post_delete",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    }),
  });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { reason: string };
  assert.equal(body.reason, "binding-mismatch", "the delivery must fail on the binding check, not silently succeed");

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null, "a principal mismatch must not deliver, let alone delete anything");

  // Clean up the still-parked call so this test does not leak a pending exchange.
  surfaceExchanges.deliver({
    exchangeId,
    toolId: "content_post_delete",
    principalId: "principal-who-ran-the-agent",
    params: { decision: "cancel" },
  });
  await pending;
});

test("a delivery cannot be replayed through this route — the exchange's single-use guarantee holds end to end, not just at the store level", async (t) => {
  // The principal-mismatch test above proves the BINDING check; this proves the other half of "the
  // real store, not a mock" is load-bearing here too — a route bug that somehow bypassed
  // single-use would show up as a second 202, not a 409.
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, postRepo } = buildRealPostToolExecutor(surfaceExchanges);
  await seedPost(postRepo);
  const PRINCIPAL = "principal-admin-1";

  const { pending, exchangeId } = await openRealDialog(toolExecutor, PRINCIPAL);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const deliverOnce = () =>
    fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
      body: JSON.stringify({
        toolName: "content_post_delete",
        params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
      }),
    });

  const first = await deliverOnce();
  assert.equal(first.status, 202, `expected the first delivery to be accepted: ${await first.clone().text()}`);
  await pending;

  const second = await deliverOnce();
  assert.equal(second.status, 409);
  const secondBody = (await second.json()) as { reason: string };
  assert.equal(secondBody.reason, "unknown-or-closed", "the exchange must already be gone once its call has resolved");

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt, NOW, "still trashed exactly once, not double-processed");
  assert.equal(row?.version, 2);
});
