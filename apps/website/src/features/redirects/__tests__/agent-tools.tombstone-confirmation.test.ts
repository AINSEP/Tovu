import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "@jini-ai/http-kit/verified-origin";
import { redirectMatcher } from "@jini-ai/cms/redirects";
import type { RedirectDbHandle } from "@jini-ai/cms/redirects/sql";
import { InMemoryRedirectRepo } from "@jini-ai/cms/redirects";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { createRedirect, updateRedirect } from "@jini-ai/cms/redirects";
import { buildRedirectsRegistrations, type RedirectsToolDeps } from "../tool-registrations.js";
import { isNeverInTrash, removeVia, restoreVia } from "./remove-redirect-double.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/** Owner policy: reversible removal runs immediately; authorization and data integrity remain enforced. */

const WORKSPACE_ID = "ws-redirects-tombstone-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const TOMBSTONE_TOOL_ID = "redirects_tombstone";

function makeDeps(options: { allow?: boolean } = {}): RedirectsToolDeps {
  const allow = options.allow ?? true;
  const redirectRepo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo({ seeds: [
    { workspaceId: WORKSPACE_ID, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ] });
  let clockTick = 0;
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: isNeverInTrash,
    restore: restoreVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowMs: () => Date.parse(`2026-07-29T00:00:${String(clockTick++).padStart(2, "0")}.000Z`) },
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

test("admin.redirects.manage is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const deps = makeDeps({ allow: false });
  const authorizeCalls: unknown[] = [];
  deps.authorize = async (input) => {
    authorizeCalls.push(input);
    return { allowed: input.permission === "admin.redirects.read", reason: "insufficient_permission" };
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "whatever" } }), /not authorized/);
  assert.deepEqual(authorizeCalls, [{ principalId: PRINCIPAL_ID, permission: "admin.redirects.manage", workspaceId: WORKSPACE_ID, entityType: "redirect", entityId: "whatever" }]);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent redirect id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tombstoneTool = tool(buildRegistrations(deps, surfaceExchanges), TOMBSTONE_TOOL_ID);

  await assert.rejects(() => call(tombstoneTool, { input: { id: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});

test("list/get/hits registrations forward filters and rule identity and return stored data", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps, { fromPattern: "/read-source", toTarget: "/read-target" });
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }));
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
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }));
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
    const registrations = buildRegistrations(deps, createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }));
    const hasId = ["redirects_get", "redirects_get_hits", "redirects_update"].includes(toolId);
    await assert.rejects(() => call(tool(registrations, toolId), { input: hasId ? { id: rule.id } : {} }), /not authorized/);
    assert.deepEqual(authorizeCalls, [{ principalId: PRINCIPAL_ID, permission: "admin.redirects.manage", workspaceId: WORKSPACE_ID, entityType: "redirect", ...(hasId ? { entityId: rule.id } : {}) }]);
    assert.deepEqual(await deps.redirectRepo.list({ workspaceId: WORKSPACE_ID }), before);
  });
}

 test("n06: reversible removal runs without a confirmation channel", async () => {
  const deps = makeDeps();
  const rule = await seedRule(deps);
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const result = await call(tool(buildRegistrations(deps, store), TOMBSTONE_TOOL_ID), {input: {id: rule.id}}) as {tombstoned: boolean; rule: {status: string}};
  assert.equal(result.tombstoned, true);
  assert.equal(result.rule.status, "disabled");
  assert.equal((await deps.redirectRepo.findById({workspaceId: WORKSPACE_ID, id: rule.id}))?.status, "disabled");
  assert.equal(store.size(), 0);
});
