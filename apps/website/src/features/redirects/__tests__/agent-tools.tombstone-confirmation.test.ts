import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "../../origin/index.js";
import { redirectMatcher } from "../matcher.js";
import type { RedirectDbHandle } from "../ports.internal.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import type { RedirectsWriteDeps } from "../redirects.js";
import { createRedirect } from "../redirects.js";
import { buildRedirectsRegistrations, type RedirectsToolDeps } from "../tool-registrations.js";

/**
 * @file Certification of `redirects_tombstone`'s confirmation gate — migrated onto the shared
 * MCP-UI held-open exchange (2026-09-08, ADS-memory/reports/2026-09-08-delete-confirmation-build.md).
 * Modeled on `features/post/__tests__/agent-tools.delete-confirmation.test.ts`, scoped to this
 * domain's own result shape. `tombstoneRedirect` is idempotent (a second tombstone against an
 * already-disabled rule is a no-op), so there is no staleness re-check to certify here.
 */

const WORKSPACE_ID = "ws-redirects-tombstone-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const TOMBSTONE_TOOL_ID = "redirects_tombstone";

function makeDeps(options: { allow?: boolean } = {}): RedirectsToolDeps {
  const allow = options.allow ?? true;
  const redirectRepo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    { workspaceId: WORKSPACE_ID, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ]);
  let clockTick = 0;
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => `2026-07-29T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
  return {
    workspaceId: WORKSPACE_ID,
    redirectRepo,
    redirectHitSink: { record: async () => undefined, getStats: async () => null, listStats: async () => [] },
    redirectsWriteDeps,
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  } as unknown as RedirectsToolDeps;
}

async function seedRule(deps: RedirectsToolDeps, overrides: { fromPattern?: string; toTarget?: string } = {}) {
  const { record } = await createRedirect({
    deps: deps.redirectsWriteDeps,
    input: {
      workspaceId: WORKSPACE_ID,
      matchType: "exact",
      fromPattern: overrides.fromPattern ?? "/old-page",
      toTarget: overrides.toTarget ?? "/new-page",
      statusCode: 301,
      actorId: PRINCIPAL_ID,
    },
  });
  return record;
}

function buildRegistrations(deps: RedirectsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildRedirectsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raiseDialog(tombstoneTool: ToolRegistration, id: string) {
  const emitted: unknown[] = [];
  const pending = call(tombstoneTool, { input: { id }, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const html = ui.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return { pending, ui, exchangeId: match[1]! };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names the rule, nothing changes while pending
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is disabled while it is pending", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  const row = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: rule.id });
  assert.equal(row?.status, "active", "the rule must be unchanged while the dialog is open");

  surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the from/to pattern and current status, so consent is informed", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps, { fromPattern: "/legacy-blog", toTarget: "/blog" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);

  assert.match(ui.resource.text, /legacy-blog/);
  assert.match(ui.resource.text, /\/blog/);
  assert.match(ui.resource.text, /active/);

  surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. Confirm / cancel / fail-closed decision
// ---------------------------------------------------------------------------

test("confirm: the human's click disables the rule and the SAME call reports it to the agent", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { tombstoned: boolean; cancelled: boolean; rule: { status: string } };
  assert.equal(result.tombstoned, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.rule.status, "disabled");

  const row = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: rule.id });
  assert.equal(row?.status, "disabled");
});

test("cancel: nothing is disabled, and the SAME call reports the cancellation", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { tombstoned: boolean; cancelled: boolean; rule: { status: string } };
  assert.equal(result.tombstoned, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.rule.status, "active");
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is disabled (fail-closed)", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { tombstoned: boolean; cancelled: boolean };
  assert.equal(result.tombstoned, false);
  assert.equal(result.cancelled, true);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  const result = (await call(tombstoneTool, { input: { id: rule.id }, emitSurface: async () => undefined })) as {
    tombstoned: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.tombstoned, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

// ---------------------------------------------------------------------------
// 3. No emit seam, authorization, not-found
// ---------------------------------------------------------------------------

test("with no emitSurface, the tombstone is refused outright — there is no fallback second call", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: rule.id } }), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
});

test("admin.redirects.manage is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const deps = makeDeps({ allow: false });
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "whatever" } }), /not authorized/);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent redirect id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});
