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
import { createRedirect, updateRedirect } from "../redirects.js";
import { buildRedirectsRegistrations, type RedirectsToolDeps } from "../tool-registrations.js";
import { isNeverInTrash, removeVia, restoreVia } from "./remove-redirect-double.js";

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
    remove: removeVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: isNeverInTrash,
    restore: restoreVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
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

async function raiseDialog(tombstoneTool: ToolRegistration, id: string, signal?: AbortSignal) {
  const emitted: unknown[] = [];
  const pending = call(tombstoneTool, { input: { id }, signal, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const html = ui.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return { pending, ui, exchangeId: match[1]! };
}

function dialogAction(ui: UIResource, action: "confirm" | "cancel") {
  const html = ui.resource.text;
  assert.match(html, new RegExp(`data-mcpui-action="${action}"`), "the action must have a rendered button");
  const plan = html.match(/var PLAN = (\{[^\n]+\});/);
  assert.ok(plan, "the dialog must contain its button action plan");
  const step = JSON.parse(plan[1]!)[action] as { toolName: string; params: Record<string, unknown> };
  assert.equal(step.toolName, TOMBSTONE_TOOL_ID);
  assert.equal(step.params.decision, action);
  return step;
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

test("aborting the run closes the pending call and rejects a late confirmation", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);
  const controller = new AbortController();
  const { ui, exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id, controller.signal);
  controller.abort();
  assert.equal(surfaceExchanges.size(), 0, "abort must remove the exchange immediately");
  const result = await pending;
  assert.deepEqual(result, {
    tombstoned: false,
    cancelled: false,
    reason: "abandoned",
    note: "The confirmation dialog was closed because the run ended. Nothing was changed.",
  });
  const confirm = dialogAction(ui, "confirm");
  assert.deepEqual(surfaceExchanges.deliver({ exchangeId, toolId: confirm.toolName, principalId: PRINCIPAL_ID, params: confirm.params }), { ok: false, reason: "unknown-or-closed" });
  const row = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: rule.id });
  assert.equal(row?.status, "active");
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
  assert.match(ui.resource.text, /<dt>From<\/dt><dd>\/legacy-blog<\/dd>/);
  assert.match(ui.resource.text, /<dt>To<\/dt><dd>\/blog<\/dd>/);
  assert.match(ui.resource.text, /<dt>Current status<\/dt><dd>active<\/dd>/);

  surfaceExchanges.deliver({ exchangeId, toolId: TOMBSTONE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog shows a disabled rule's current status under its label", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps, { fromPattern: "/legacy-docs", toTarget: "/help-center" });
  await updateRedirect({ deps: deps.redirectsWriteDeps, input: { workspaceId: WORKSPACE_ID, id: rule.id, status: "disabled", actorId: PRINCIPAL_ID } });
  const surfaceExchanges = createSurfaceExchangeStore();
  const { ui, exchangeId, pending } = await raiseDialog(tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID), rule.id);
  assert.match(ui.resource.text, /<dt>From<\/dt><dd>\/legacy-docs<\/dd>/);
  assert.match(ui.resource.text, /<dt>To<\/dt><dd>\/help-center<\/dd>/);
  assert.match(ui.resource.text, /<dt>Current status<\/dt><dd>disabled<\/dd>/);
  const cancel = dialogAction(ui, "cancel");
  surfaceExchanges.deliver({ exchangeId, toolId: cancel.toolName, principalId: PRINCIPAL_ID, params: cancel.params });
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

  const { ui, exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);
  const confirm = dialogAction(ui, "confirm");
  assert.equal(confirm.params[SURFACE_EXCHANGE_ID_PARAM], exchangeId);
  const delivered = surfaceExchanges.deliver({ exchangeId: confirm.params[SURFACE_EXCHANGE_ID_PARAM] as string, toolId: confirm.toolName, principalId: PRINCIPAL_ID, params: confirm.params });
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

  const { ui, exchangeId, pending } = await raiseDialog(tombstoneTool, rule.id);
  const cancel = dialogAction(ui, "cancel");
  assert.equal(cancel.params[SURFACE_EXCHANGE_ID_PARAM], exchangeId);
  surfaceExchanges.deliver({ exchangeId: cancel.params[SURFACE_EXCHANGE_ID_PARAM] as string, toolId: cancel.toolName, principalId: PRINCIPAL_ID, params: cancel.params });

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
  const authorizeCalls: unknown[] = [];
  deps.authorize = async (input) => {
    authorizeCalls.push(input);
    return { allowed: input.permission === "admin.redirects.read", reason: "insufficient_permission" };
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "whatever" } }), /not authorized/);
  assert.deepEqual(authorizeCalls, [{ principalId: PRINCIPAL_ID, permission: "admin.redirects.manage", workspaceId: WORKSPACE_ID, entityType: "redirect", entityId: "whatever" }]);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent redirect id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});

test("list/get/hits registrations forward filters and rule identity and return stored data", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps, { fromPattern: "/read-source", toTarget: "/read-target" });
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  const listCalls: unknown[] = [];
  const originalList = deps.redirectRepo.list.bind(deps.redirectRepo);
  deps.redirectRepo.list = async (input) => { listCalls.push(input); return originalList(input); };
  const filtered = await call(tool(registrations, "redirects_list"), { input: { status: "disabled", source: "import", matchType: "wildcard" } });
  assert.deepEqual(listCalls, [{ workspaceId: WORKSPACE_ID, status: "disabled", source: "import", matchType: "wildcard" }]);
  assert.deepEqual(filtered, { rules: [] });
  const listed = await call(tool(registrations, "redirects_list")) as { rules: Array<{ id: string; fromPattern: string; toTarget: string }> };
  assert.equal(listed.rules.length, 1);
  assert.equal(listed.rules[0]?.id, rule.id);
  assert.equal(listed.rules[0]?.fromPattern, "/read-source");
  assert.equal(listed.rules[0]?.toTarget, "/read-target");
  const fetched = await call(tool(registrations, "redirects_get"), { input: { id: rule.id } }) as { rule: unknown };
  assert.deepEqual(fetched.rule, listed.rules[0]);
  const stats = { workspaceId: WORKSPACE_ID, redirectId: rule.id, hitCount: 17, lastHitAt: NOW };
  const statsCalls: unknown[] = [];
  deps.redirectHitSink.getStats = async (input) => { statsCalls.push(input); return stats; };
  const hits = await call(tool(registrations, "redirects_get_hits"), { input: { id: rule.id } });
  assert.deepEqual(statsCalls, [{ workspaceId: WORKSPACE_ID, redirectId: rule.id }]);
  assert.deepEqual(hits, { stats });
});

test("create/update/import registrations persist the supplied fields and actor", async () => {
  const deps = makeDeps();
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  const created = await call(tool(registrations, "redirects_create"), { input: {
    matchType: "prefix", fromPattern: "/tool-old", toTarget: "/tool-new", statusCode: 307, override: true, priority: 17,
  } }) as { rule: { id: string } };
  const stored = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: created.rule.id });
  assert.ok(stored);
  assert.deepEqual(stored, {
    id: created.rule.id, workspaceId: WORKSPACE_ID, matchType: "prefix", fromPattern: "/tool-old",
    toTarget: "/tool-new", statusCode: 307, status: "active", override: true, priority: 17,
    source: "manual", createdByPrincipal: PRINCIPAL_ID, createdByPluginId: undefined,
    createdAt: NOW, updatedAt: NOW, version: 1,
  });
  const updated = await call(tool(registrations, "redirects_update"), { input: {
    id: stored.id, matchType: "wildcard", fromPattern: "/tool-other/*", toTarget: "/tool-final/$1",
    statusCode: 308, status: "disabled", override: false, priority: 29,
  } }) as { rule: Record<string, unknown> };
  const after = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: stored.id });
  assert.deepEqual(after, { ...stored, matchType: "wildcard", fromPattern: "/tool-other/*",
    toTarget: "/tool-final/$1", statusCode: 308, status: "disabled", override: false, priority: 29,
    updatedAt: "2026-07-29T00:00:02.000Z", version: 2 });
  assert.deepEqual(updated.rule, { ...created.rule, matchType: "wildcard", fromPattern: "/tool-other/*",
    toTarget: "/tool-final/$1", statusCode: 308, status: "disabled", override: false, priority: 29,
    updatedAt: "2026-07-29T00:00:02.000Z", version: 2 });
  const imported = await call(tool(registrations, "redirects_import"), { input: { rules: [
    { matchType: "exact", fromPattern: "/tool-import", toTarget: "/tool-import-target", statusCode: 302, override: true, priority: 41 },
  ] } }) as { created: Array<{ id: string }>; failed: unknown[] };
  assert.deepEqual(imported.failed, []);
  assert.equal(imported.created.length, 1);
  const importedRow = await deps.redirectRepo.findById({ workspaceId: WORKSPACE_ID, id: imported.created[0]!.id });
  assert.deepEqual(importedRow, {
    id: imported.created[0]!.id, workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/tool-import",
    toTarget: "/tool-import-target", statusCode: 302, status: "active", override: true, priority: 41,
    source: "import", createdByPrincipal: PRINCIPAL_ID, createdByPluginId: undefined,
    createdAt: "2026-07-29T00:00:04.000Z", updatedAt: "2026-07-29T00:00:04.000Z", version: 1,
  });
});

for (const toolId of ["redirects_list", "redirects_get", "redirects_get_hits", "redirects_create", "redirects_update", "redirects_import"]) {
  test(`${toolId}: a denied principal leaves all rules unchanged`, async () => {
    const deps = makeDeps();
    const rule = await seedRule(deps);
    const before = await deps.redirectRepo.list({ workspaceId: WORKSPACE_ID });
    const authorizeCalls: unknown[] = [];
    deps.authorize = async (input) => { authorizeCalls.push(input); return { allowed: false, reason: "insufficient_permission" }; };
    const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
    const hasId = ["redirects_get", "redirects_get_hits", "redirects_update"].includes(toolId);
    await assert.rejects(() => call(tool(registrations, toolId), { input: hasId ? { id: rule.id } : {} }), /not authorized/);
    assert.deepEqual(authorizeCalls, [{ principalId: PRINCIPAL_ID, permission: "admin.redirects.manage", workspaceId: WORKSPACE_ID, entityType: "redirect", entityId: hasId ? rule.id : undefined }]);
    assert.deepEqual(await deps.redirectRepo.list({ workspaceId: WORKSPACE_ID }), before);
  });
}
