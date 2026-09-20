/**
 * @file Covers the 7 Redirects catalog entries (6 wired, `redirects_import` deliberately withheld):
 * catalog completeness, published contracts, risk cross-check, the ADR-021 authorization half
 * (explicit-handler style — none of `createRedirect`/`updateRedirect`/`tombstoneRedirect` call
 * `authorize()` themselves), and a multi-tool workflow test chaining create -> update ->
 * tombstone, asserting state stays consistent across the whole sequence.
 *
 * Uses the REAL in-memory `RedirectRepoPort` adapter, the real `redirectMatcher`, a real
 * `OriginRegistry`, and the real `createRedirect`/`updateRedirect`/`tombstoneRedirect` domain
 * functions, so "the rule actually changed" is asserted against real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryOutbox } from "../../contracts/core/events/index.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { UIResource } from "../index.js";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "../../features/origin/index.js";
import { getRedirectsAgentToolCatalog, type AgentToolDefinition } from "../../features/redirects/agent-tools.js";
import { redirectMatcher } from "../../features/redirects/matcher.js";
import type { RedirectDbHandle } from "../../features/redirects/ports.internal.js";
import { InMemoryRedirectRepo } from "../../features/redirects/repo.memory.js";
import { removeVia } from "../../features/redirects/__tests__/remove-redirect-double.js";
import type { RedirectsWriteDeps } from "../../features/redirects/redirects.js";
import type { RedirectHitStats } from "../../features/redirects/types.js";
import type { RedirectHitSink } from "../../features/redirects/ports.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeRedirectsTools } from "../../features/redirects/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Redirects moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 — see `tool-contribution-registry.ts`'s header),
// so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs
// it first, mirroring what the real composition roots now do via `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
registerToolContributor(contributeRedirectsTools());

const WORKSPACE_ID = "ws-redirects-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeHitSink(): RedirectHitSink {
  const stats = new Map<string, RedirectHitStats>();
  return {
    async record(required) {
      const existing = stats.get(required.redirectId);
      stats.set(required.redirectId, { redirectId: required.redirectId, workspaceId: required.workspaceId, hitCount: (existing?.hitCount ?? 0) + 1, lastHitAt: required.at });
    },
    async getStats(required) {
      return stats.get(required.redirectId) ?? null;
    },
    async listStats(required) {
      return [...stats.values()].filter((s) => s.workspaceId === required.workspaceId);
    },
  };
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const redirectRepo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo([
    { workspaceId: WORKSPACE_ID, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ]);

  let clockTick = 0;
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    // Required since 4bbf54387 routed the tombstone through the injected Trash `remove`. Same
    // record-store double the redirects feature's own tests use; see its header.
    remove: removeVia(redirectRepo),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowIso: () => `2026-07-29T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };

  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  const deps = {
    workspaceId: WORKSPACE_ID,
    redirectRepo,
    redirectHitSink: fakeHitSink(),
    redirectsWriteDeps,
    authorize,
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, redirectRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function redirectsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("redirects_") || r.descriptor.id === "content_read.redirect").map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = redirectsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * `redirects_tombstone` now raises a confirmation dialog (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) rather than tombstoning synchronously. `wired()`/
 * `redirectsRegistrations()` above build a FRESH `buildAssistantToolRegistrations` (and so a fresh,
 * unshared `SurfaceExchangeStore`) on every call, which cannot answer a dialog raised by an earlier
 * call — this helper builds against ONE explicit store so the raise-then-confirm round trip lands on
 * the same exchange, standing in for the human's click in this workflow test (the confirmation gate
 * itself is certified by `redirects/__tests__/agent-tools.tombstone-confirmation.test.ts`).
 */
async function tombstoneRule(deps: RouteDeps, id: string): Promise<{ rule: { status: string; version: number } }> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "redirects_tombstone");
  assert.ok(trashTool, "expected 'redirects_tombstone' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({ ...executionContext({ id }), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "redirects_tombstone", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending as Promise<{ rule: { status: string; version: number } }>;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = getRedirectsAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// redirects_get and redirects_list MERGE into the single `content_read.redirect` card (2026-09-08,
// assistant/content-read-tool.ts), which dispatches on whether `id` was supplied — so this list is
// one entry shorter than the domain catalog it used to mirror one-for-one.
const WIRED_REDIRECTS_TOOL_IDS = ["content_read.redirect", "redirects_get_hits", "redirects_create", "redirects_update", "redirects_tombstone"];

// ---------------------------------------------------------------------------
// 1. Catalog completeness — wired vs. declared-but-excluded
// ---------------------------------------------------------------------------

test("exactly the 6 wireable redirects entries are registered — nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...redirectsRegistrations(deps).keys()].sort(), [...WIRED_REDIRECTS_TOOL_IDS].sort());
  assert.equal(getRedirectsAgentToolCatalog().length, 7, "sanity: the full redirects catalog is still 7 entries");
});

test("redirects_import is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(redirectsRegistrations(deps).has("redirects_import"), false);
  assert.throws(() => assertRiskMetadataIsWirable("redirects_import", catalogEntry("redirects_import")), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("no tool id across the whole assistant tool set implies a bulk redirect import is agent-callable", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps).map((r) => r.descriptor.id);
  assert.equal(ids.includes("redirects_import"), false);
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired redirects registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of redirectsRegistrations(deps)) {
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.redirect") continue;
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired redirects tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of redirectsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for every wired redirects tool", () => {
  const { deps } = fakeRouteDeps();
  for (const id of redirectsRegistrations(deps).keys()) {
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.redirect") continue;
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a redirects catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for redirects_create fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("redirects_create", { ...catalogEntry("redirects_create"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired redirects registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of redirectsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  "content_read.redirect": {},
  redirects_create: { matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301 },
};

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with 'admin.redirects.manage' and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, "admin.redirects.manage");
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected and nothing is written`, async () => {
    const { deps, redirectRepo } = fakeRouteDeps({ allow: false });
    const before = await redirectRepo.list({ workspaceId: WORKSPACE_ID });

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /is not authorized for/);
        return true;
      },
    );

    const after = await redirectRepo.list({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
  });
}

test("redirects_get: an unknown id propagates RedirectNotFoundError unwrapped", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "content_read.redirect").handler(executionContext({ id: "no-such-id" })), /was not found/);
});

test("redirects_create: rejects matchType 'regex' the same way the chokepoint does", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "redirects_create").handler(executionContext({ matchType: "regex", fromPattern: "/a.*", toTarget: "/b", statusCode: 301 })),
  );
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow
// ---------------------------------------------------------------------------

test("workflow: create a redirect, update it, tombstone it — state stays consistent at every step", async () => {
  const { deps } = fakeRouteDeps();

  const created = (await wired(deps, "redirects_create").handler(
    executionContext({ matchType: "exact", fromPattern: "/old-page", toTarget: "/new-page", statusCode: 301 }),
  )) as { rule: { id: string; version: number; status: string; toTarget: string } };
  assert.equal(created.rule.version, 1);
  assert.equal(created.rule.status, "active");
  assert.equal(created.rule.toTarget, "/new-page");

  const afterCreateList = (await wired(deps, "content_read.redirect").handler(executionContext({}))) as { rules: Array<{ id: string }> };
  assert.equal(afterCreateList.rules.length, 1);
  assert.equal(afterCreateList.rules[0].id, created.rule.id);

  const updated = (await wired(deps, "redirects_update").handler(
    executionContext({ id: created.rule.id, toTarget: "/newer-page", priority: 5 }),
  )) as { rule: { id: string; version: number; toTarget: string; priority: number; fromPattern: string } };
  assert.equal(updated.rule.id, created.rule.id);
  assert.equal(updated.rule.version, 2, "version increments on update");
  assert.equal(updated.rule.toTarget, "/newer-page");
  assert.equal(updated.rule.priority, 5);
  assert.equal(updated.rule.fromPattern, "/old-page", "untouched field survives the partial update");

  const fetched = (await wired(deps, "content_read.redirect").handler(executionContext({ id: created.rule.id }))) as {
    rule: { toTarget: string; version: number };
  };
  assert.equal(fetched.rule.toTarget, "/newer-page", "get reflects the update");
  assert.equal(fetched.rule.version, 2);

  const tombstoned = await tombstoneRule(deps, created.rule.id);
  assert.equal(tombstoned.rule.status, "disabled");
  assert.equal(tombstoned.rule.version, 3);

  const afterTombstoneGet = (await wired(deps, "content_read.redirect").handler(executionContext({ id: created.rule.id }))) as { rule: { status: string } };
  assert.equal(afterTombstoneGet.rule.status, "disabled", "tombstone is reflected on a subsequent get");

  const afterTombstoneActiveList = (await wired(deps, "content_read.redirect").handler(executionContext({ status: "active" }))) as {
    rules: unknown[];
  };
  assert.equal(afterTombstoneActiveList.rules.length, 0, "the tombstoned rule no longer appears in the active-only list");
});
