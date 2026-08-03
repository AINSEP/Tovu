import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import type { UIResource } from "#src/assistant/mcp-ui";
import { InMemoryChangeSetRepo } from "#src/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/core/events/index";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import { buildPostRegistrations } from "#src/features/post/tool-registrations";
import type { RouteDeps } from "#src/server/routes/types";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route";

/**
 * @file The real, non-mocked round trip through the MCP-UI redemption route, requested directly by
 * the Coordinator: `mcp-ui-tool-calls-route.test.ts` only ever exercises the route's OWN contract
 * against a fake `ToolExecutor`, which cannot catch a principal-binding mismatch between the mint
 * and redeem hops — a fake executor has no `PendingConfirmationStore` to disagree with.
 *
 * This file wires the REAL `ToolRegistry` + `createToolExecutor` (no `delegate`, matching
 * `agent-daemon-server.ts`'s own construction exactly) over `buildPostRegistrations`' REAL
 * `content_post_delete` handler and its REAL `PendingConfirmationStore`, then:
 *
 *  1. "Mints" a confirmation exactly the way a model's tool call does — `toolExecutor.execute` with
 *     no `confirmationToken`, for some principal.
 *  2. Extracts the real token from the ACTUAL returned UI resource (see "Pre-existing finding" below
 *     for why not by simulating a click, which is the more obviously "real" technique and the one
 *     `agent-tools.delete-confirmation.test.ts` uses).
 *  3. Redeems it through THIS route (`registerMcpUiToolCallsRoute`, over real HTTP via
 *     `startTestServer`), for that SAME principal — and asserts the post is ACTUALLY trashed in the
 *     backing repo, not just that the HTTP response looked right.
 *  4. Repeats step 3 with a DIFFERENT principal in {@link RUN_PRINCIPAL_HEADER} and asserts the
 *     redemption is refused (`binding-mismatch`) and nothing is deleted — this is the actual
 *     security property `pending-confirmations.ts`'s `redeem` exists to enforce, and the property
 *     the Coordinator asked to see proven rather than assumed from reading.
 *
 * What this deliberately does NOT do: boot the full `agent-daemon-server.ts` process or a real
 * `RunLifecycle`/`/api/delegated-tool-calls` hop. That is unnecessary for what is under test here —
 * see this file's own findings on `ToolExecutor.execute`'s `run` argument below — and would turn a
 * focused test into an integration test of unrelated machinery (run start, attachment claiming,
 * custom-instructions refresh, …). The one thing that DOES need to be real, and is real here, is:
 * one `ToolRegistry`, one `toolExecutor` built from it with no `delegate` (matching production), and
 * therefore one closure-captured `PendingConfirmationStore` shared by both the mint call and the
 * redeem call that reaches it through this route — exactly the sharing the real daemon process
 * provides by running `buildAssistantToolRegistrations` exactly once at boot.
 *
 * ## Pre-existing finding, unrelated to this dispatch's scope: the click-simulation harness is broken
 *
 * `src/features/post/__tests__/fake-mcp-ui-host.ts`'s `renderUIResource(...).click("confirm")` was
 * the obvious way to extract a real token here (it is exactly what
 * `agent-tools.delete-confirmation.test.ts` already does), and this file used it in an earlier
 * revision. It fails — `Error: the dialog has no 'confirm' button` — and re-running
 * `agent-tools.delete-confirmation.test.ts` as-is on this branch confirms the SAME failure hits 8 of
 * its pre-existing, previously-certified cases. This is not something introduced by this dispatch:
 * `delete-confirmation-ui.ts` was already rewritten (ADR-053 Decision 2, landed before this task
 * started) to render via `@jini-ai/ui/mcp-ui/surfaces`'s `buildConfirmationSurface`, which speaks the
 * real MCP Apps protocol — buttons are found by `document.querySelectorAll('[data-mcpui-action]')`
 * and wired through a real `ui/initialize` → `tools/call` JSON-RPC bridge
 * (`packages/ui/src/features/mcp-ui/surfaces/document.ts`'s `SURFACE_SCRIPT_PRELUDE`), not by
 * `getElementById('confirm')`/a bare `postMessage({type:'tool',...})` the way the fake host and the
 * OLD hand-rolled dialog both assumed. The fake host was never updated for the new protocol, so
 * EVERY test using it against real `content_post_delete` output is currently failing — independent
 * of anything in this dispatch. Flagged to the Coordinator; fixing that harness (or replacing it
 * with a real MCP-Apps-speaking fake host) is its own task, not taken on here.
 *
 * Given that, this file extracts the token directly from the real rendered resource's embedded
 * click-plan instead of simulating a click: `renderConfirmationDocument` inlines `var PLAN =
 * <escapeJsValue(plan)>;` into the script (`packages/ui/src/features/mcp-ui/surfaces/confirmation.ts`),
 * and `escapeJsValue` is `JSON.stringify` plus a `<`→`<` substitution that is STILL valid JSON
 * (verified: `JSON.parse` round-trips it). This is real output from the real minting call — nothing
 * here fabricates a token or a params object — it just reads the plan out of the HTML by parsing
 * instead of by executing the script in a `vm` sandbox. It is not a substitute for
 * `agent-tools.delete-confirmation.test.ts`'s own click-protocol certification once that harness is
 * fixed; it only needs the params a click WOULD have sent, for this file's own purpose (principal
 * binding at the redemption route), and gets them honestly.
 *
 * ## Finding: what `ToolExecutor.execute`'s `run` argument is actually used for
 *
 * Traced through `@jini-ai/daemon`'s `tool-executor.ts` and `@jini-ai/core`'s `tool-registry.ts`
 * (`authorizeToolInvocation`), not assumed:
 *
 * - `authorizeToolInvocation` passes `run` into `policy.authorize({principal, run, tool, input})`
 *   and, only if authorization already resolved `'allow'`, into an optional
 *   `delegate.onAuthorize({...})`. Every domain tool (including `content_post_delete`) is registered
 *   through `registration-kit.ts`'s `buildDomainRegistrations` with `policy: {authorize: () =>
 *   "allow"}` — a pass-through that reads none of its arguments. `agent-daemon-server.ts` constructs
 *   `createToolExecutor({registry})` with no `delegate` option at all, so `onAuthorize` is never
 *   even called. `run` is therefore READ by authorization but never actually CONSULTED, in this
 *   codebase's real configuration.
 * - `ToolExecutor.execute` itself uses `run.id` in exactly one place: `openAudit` stamps it as the
 *   `runId` field of the executor's own in-memory audit record (and, via `withToolAttemptAudit`,
 *   into the durable `tool_attempts` sink). It is a plain string label — no lookup against
 *   `RunLifecycle`, no existence check, no foreign-key-shaped constraint.
 * - `content_post_delete`'s own `ToolHandler` (`features/post/tool-registrations.ts`) destructures
 *   `ctx.principal` and `ctx.input` and never reads `ctx.run` at all.
 * - `RunLifecycle`/the run's own event log (what the browser's SSE subscription watches) is an
 *   entirely separate object from `ToolExecutor` in `agent-daemon-server.ts` — the executor never
 *   touches it. A synthetic `run.id` therefore cannot emit an event anywhere a human or the model
 *   would see one; it also cannot fail, since nothing validates it against anything.
 *
 * Net: `mcp-ui-tool-calls-route.ts`'s synthetic `{id: 'mcp-ui-redemption:' + randomUUID()}` is inert
 * outside the audit trail, where it shows up as a distinct, clearly-labeled `runId` string
 * (recognizably not a real agent run) rather than colliding with or corrupting one.
 */

const WORKSPACE_ID = "ws-mcp-ui-redemption-integration";
const NOW = "2026-08-03T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

/** Builds the real tool surface: one registry, one production-shaped executor (no `delegate`, no
 * mocks), over an in-memory Posts repo so a real soft-delete can be asserted directly. */
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
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as RouteDeps;

  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps)) {
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

/** Mints a confirmation through the REAL executor, exactly as a model's first tool call would. */
async function mintRealConfirmation(
  toolExecutor: ReturnType<typeof buildRealPostToolExecutor>["toolExecutor"],
  mintPrincipalId: string,
): Promise<UIResource> {
  const result = await toolExecutor.execute({ id: mintPrincipalId }, { id: "run-mint-1" }, "content_post_delete", {
    id: "p1",
    kind: "post",
  });
  assert.equal(result.status, "completed", `mint call must succeed: ${JSON.stringify(result)}`);
  const shaped = result.output as { content?: Array<{ type: string; resource?: unknown }> };
  assert.ok(Array.isArray(shaped.content) && shaped.content.length === 2, "expected [textBlock, uiResource]");
  return shaped.content[1] as unknown as UIResource;
}

/**
 * Extracts the real `confirm` action's `{toolName, params}` — including the real, randomly-minted
 * token — from the resource's inline script, by parsing the SAME `var PLAN = <json>;` literal the
 * dialog's own click handler reads (`confirmation.ts`'s `renderConfirmationDocument`). See this
 * file's own header ("Pre-existing finding") for why this file does not click-simulate instead.
 *
 * @throws {Error} If the resource carries no recognizable `PLAN` literal — a signal this builder's
 * output shape changed and this extraction needs updating, not that a token is missing.
 */
function extractConfirmParams(ui: UIResource): { toolName: string; params: Record<string, unknown> } {
  if (ui.type !== "resource") throw new Error(`not an embedded resource: ${String(ui.type)}`);
  const match = /var PLAN = (\{[\s\S]*?\});/.exec(ui.resource.text);
  if (!match) throw new Error("could not find the confirmation dialog's embedded action plan");
  // `escapeJsValue`'s only departure from plain `JSON.stringify` is escaping `<`/U+2028/U+2029 to
  // `\uXXXX` sequences, which are valid JSON string escapes too — `JSON.parse` reverses them.
  const plan = JSON.parse(match[1]) as { confirm: { toolName: string; params: Record<string, unknown> } };
  return plan.confirm;
}

test("real round trip: a redemption from the SAME principal that minted it actually trashes the post", async (t) => {
  const { toolExecutor, postRepo } = buildRealPostToolExecutor();
  await seedPost(postRepo);
  const MINT_AND_REDEEM_PRINCIPAL = "principal-admin-1";

  // Step 1: mint (no mocking — the real handler, the real PendingConfirmationStore).
  const ui = await mintRealConfirmation(toolExecutor, MINT_AND_REDEEM_PRINCIPAL);

  // Step 2: extract the real token from the real rendered resource.
  const confirm = extractConfirmParams(ui);
  assert.equal(confirm.toolName, "content_post_delete");
  assert.equal(typeof confirm.params.confirmationToken, "string");
  assert.ok((confirm.params.confirmationToken as string).length > 0);

  // Step 3: redeem through THIS route, over real HTTP, as the SAME principal.
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: MINT_AND_REDEEM_PRINCIPAL },
    body: JSON.stringify({ toolName: confirm.toolName, params: confirm.params }),
  });

  const body = (await res.json()) as { deleted: boolean; cancelled: boolean; error?: string };
  assert.equal(res.status, 200, `expected the redemption to succeed: ${JSON.stringify(body)}`);
  assert.equal(body.deleted, true);
  assert.equal(body.cancelled, false);

  // The load-bearing assertion: not just a 200, but the row is ACTUALLY trashed in the backing repo.
  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "a soft delete keeps the row");
  assert.equal(row.deletedAt, NOW, "the post must be genuinely trashed, not merely reported as deleted");
  assert.equal(row.version, 2);
});

test("SECURITY: a redemption from a DIFFERENT principal than the one that minted it is refused, and nothing is deleted", async (t) => {
  const { toolExecutor, postRepo } = buildRealPostToolExecutor();
  await seedPost(postRepo);

  // Mint as one principal (models the run that raised the dialog)...
  const ui = await mintRealConfirmation(toolExecutor, "principal-who-ran-the-agent");
  const confirm = extractConfirmParams(ui);

  // ...redeem as a DIFFERENT principal (models a session/run-principal mismatch — exactly the
  // failure mode named in the dispatch: if the value RUN_PRINCIPAL_HEADER carries at redeem time
  // ever disagreed with the value recorded at mint time, this is what it would look like).
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-someone-else" },
    body: JSON.stringify({ toolName: confirm.toolName, params: confirm.params }),
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /binding-mismatch/, "the redemption must fail on the binding check, not silently succeed");

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt ?? null, null, "a principal mismatch must not delete anything");
});

test("a token cannot be redeemed twice through this route — the store's single-use guarantee holds end to end, not just at the handler level", async (t) => {
  // The principal-mismatch test above proves the BINDING check; this proves the other half of
  // "the real store, not a mock" is load-bearing here too — a route bug that somehow bypassed
  // single-use (e.g. by not propagating the token exactly) would show up as a SECOND 200, not a 400.
  const { toolExecutor, postRepo } = buildRealPostToolExecutor();
  await seedPost(postRepo);
  const PRINCIPAL = "principal-admin-1";

  const ui = await mintRealConfirmation(toolExecutor, PRINCIPAL);
  const confirm = extractConfirmParams(ui);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor });
  const baseUrl = await startTestServer(app, t);

  const redeemOnce = () =>
    fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
      body: JSON.stringify({ toolName: confirm.toolName, params: confirm.params }),
    });

  const first = await redeemOnce();
  assert.equal(first.status, 200, `expected the first redemption to succeed: ${await first.clone().text()}`);
  const second = await redeemOnce();
  assert.equal(second.status, 400);
  const secondBody = (await second.json()) as { error: string };
  assert.match(
    secondBody.error,
    /post 'p1' was not found/,
    "the replay is refused by the trashed-row guard first, same ordering agent-tools.delete-confirmation.test.ts pins",
  );

  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.equal(row?.deletedAt, NOW, "still trashed exactly once, not double-processed");
});
