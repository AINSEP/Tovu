import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
/**
 * @file Covers all 7 Redirects catalog entries, all wired (2026-09-24: `redirects_import` joined
 * the other 6 — tool-design audit F2/F3): catalog completeness, published contracts, risk
 * cross-check, the ADR-021 authorization half (explicit-handler style — none of
 * `createRedirect`/`updateRedirect`/`tombstoneRedirect` call `authorize()` themselves), a
 * multi-tool workflow test chaining create -> update -> tombstone, asserting state stays
 * consistent across the whole sequence, and `redirects_import`'s own per-rule-failure-does-not-
 * abort-the-batch behavior.
 *
 * Uses the REAL in-memory `RedirectRepoPort` adapter, the real `redirectMatcher`, a real
 * `OriginRegistry`, and the real `createRedirect`/`updateRedirect`/`tombstoneRedirect` domain
 * functions, so "the rule actually changed" is asserted against real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryOutbox } from "../../contracts/core/events/index.js";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "../../features/origin/index.js";
import { type AgentToolDefinition } from "@jini-ai/core";
import { getRedirectsAgentToolCatalog } from "../../features/redirects/agent-tools.js";
import { redirectMatcher } from "../../features/redirects/matcher.js";
import type { RedirectDbHandle } from "../../features/redirects/ports.internal.js";
import { InMemoryRedirectRepo } from "../../features/redirects/repo.memory.js";
import { isNeverInTrash, removeVia, restoreVia } from "../../features/redirects/__tests__/remove-redirect-double.js";
import type { RedirectsWriteDeps } from "../../features/redirects/redirects.js";
import type { RedirectHitStats } from "../../features/redirects/types.js";
import type { RedirectHitSink } from "../../features/redirects/ports.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";

import { contributeRedirectsTools } from "../../features/redirects/tool-registrations.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};


// Redirects moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 — see `tool-contribution-registry.ts`'s header),
// so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs
// it first, mirroring what the real composition roots now do via `installFirstPartyToolContributors()`.
contributions.contributors.clear({});
contributions.contributors.register({ contribution: contributeRedirectsTools() });

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
    isInTrash: isNeverInTrash,
    restore: restoreVia(redirectRepo),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => `2026-07-29T00:00:${String(clockTick++).padStart(2, "0")}.000Z` },
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
  return new Map(buildAssistantToolRegistrations(deps, undefined, { contributions }).filter((r) => r.descriptor.id.startsWith("redirects_") || r.descriptor.id === "content_read.redirect").map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = redirectsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * Tombstones a rule through the real `redirects_tombstone` tool for this workflow test. It used to
 * raise the 2026-09-08 confirmation dialog (ADS-memory/reports/2026-09-08-delete-confirmation-build.md)
 * against one explicit `SurfaceExchangeStore` and immediately confirm it.
 * 6eac86229 ("confirm destructive and protected actions only", 2026-10-01) removed that dialog:
 * moving to Trash is reversible, so only permanent deletes still confirm. The tool now completes in
 * one plain call, which is all this helper ever needed (it was never certifying the gate).
 */
async function tombstoneRule(deps: RouteDeps, id: string): Promise<{ rule: { status: string; version: number } }> {
  return wired(deps, "redirects_tombstone").handler(executionContext({ id })) as Promise<{ rule: { status: string; version: number } }>;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = getRedirectsAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// redirects_get and redirects_list MERGE into the single `content_read.redirect` card (2026-09-08,
// assistant/content-read-tool.ts), which dispatches on whether `id` was supplied — so this list is
// one entry shorter than the domain catalog it used to mirror one-for-one.
const WIRED_REDIRECTS_TOOL_IDS = [
  "content_read.redirect",
  "redirects_get_hits",
  "redirects_create",
  "redirects_update",
  "redirects_tombstone",
  "redirects_import",
];

// ---------------------------------------------------------------------------
// 1. Catalog completeness
// ---------------------------------------------------------------------------

test("exactly the 6 wireable redirects entries plus redirects_import are registered — nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...redirectsRegistrations(deps).keys()].sort(), [...WIRED_REDIRECTS_TOOL_IDS].sort());
  assert.equal(getRedirectsAgentToolCatalog().length, 7, "sanity: the full redirects catalog is still 7 entries");
});

test("redirects_import is agent-callable across the whole assistant tool set", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps, undefined, { contributions }).map((r) => r.descriptor.id);
  assert.ok(ids.includes("redirects_import"));
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
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id), contributions));
  }
});

test("a redirects catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for redirects_create fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("redirects_create", { ...catalogEntry("redirects_create"), sideEffects: "none" }, contributions),
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
  redirects_update: { id: "redirect-1", priority: 7 },
  redirects_get_hits: { id: "redirect-1" },
  redirects_create: { matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301 },
  redirects_import: { rules: [{ matchType: "exact", fromPattern: "/old-1", toTarget: "/new-1", statusCode: 301 }] },
};

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with 'admin.redirects.manage' and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    if (TOOL_INPUTS[toolId]?.id) {
      await wired(deps, "redirects_create").handler(executionContext({ matchType: "exact", fromPattern: "/seed", toTarget: "/target", statusCode: 301 }));
    }
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, "admin.redirects.manage");
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    if (TOOL_INPUTS[toolId]?.id) {
      assert.equal(authorizeCalls[0].entityType, "redirect");
      assert.equal(authorizeCalls[0].entityId, "redirect-1");
    }
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
    /matchType 'regex' is not enabled in v1 \(REQ-22\)/,
  );
});

// ---------------------------------------------------------------------------
// 4a. redirects_import — batch/adversarial behavior (2026-09-24, tool-design audit F2/F3)
// ---------------------------------------------------------------------------

test("redirects_import: rejects a non-array 'rules' with the exact validation text, before any write", async () => {
  const { deps, redirectRepo } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "redirects_import").handler(executionContext({ rules: "not-an-array" })),
    /'rules' \(array of 1-500 items\) is required/,
  );
  assert.deepEqual(await redirectRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("redirects_import: rejects an empty 'rules' array with the exact validation text", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "redirects_import").handler(executionContext({ rules: [] })), /'rules' \(array of 1-500 items\) is required/);
});

test("redirects_import: rejects a batch over 500 rules with the exact validation text", async () => {
  const { deps } = fakeRouteDeps();
  const rules = Array.from({ length: 501 }, (_, i) => ({ matchType: "exact", fromPattern: `/p${i}`, toTarget: `/t${i}`, statusCode: 301 }));
  await assert.rejects(() => wired(deps, "redirects_import").handler(executionContext({ rules })), /'rules' \(array of 1-500 items\) is required/);
});

test("redirects_import: a non-object rule entry is refused by index, not silently coerced", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "redirects_import").handler(executionContext({ rules: [{ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 }, "not-an-object"] })),
    /rules\[1\] must be an object/,
  );
});

test("redirects_import: a per-rule failure (duplicate fromPattern) does NOT abort the rest of the batch — mixed created/failed in one response", async () => {
  const { deps } = fakeRouteDeps();

  // Seed one rule manually so the second batch row collides on it (exact-match dedup rule).
  await wired(deps, "redirects_create").handler(executionContext({ matchType: "exact", fromPattern: "/dup", toTarget: "/already-there", statusCode: 301 }));

  const result = (await wired(deps, "redirects_import").handler(
    executionContext({
      rules: [
        { matchType: "exact", fromPattern: "/dup", toTarget: "/collides", statusCode: 301 }, // fails: duplicate
        { matchType: "exact", fromPattern: "/ok-1", toTarget: "/target-1", statusCode: 301 }, // succeeds
        { matchType: "regex", fromPattern: "/a.*", toTarget: "/b", statusCode: 301 }, // fails: regex always rejected
        { matchType: "exact", fromPattern: "/ok-2", toTarget: "/target-2", statusCode: 302 }, // succeeds
      ],
    }),
  )) as { created: Array<{ fromPattern: string }>; failed: Array<{ index: number; code: string; message: string }> };

  assert.equal(result.created.length, 2, "the two valid rows still commit despite two invalid siblings");
  assert.deepEqual(result.created.map((r) => r.fromPattern).sort(), ["/ok-1", "/ok-2"]);
  assert.equal(result.failed.length, 2);
  assert.equal(result.failed[1]?.code, "REDIRECT_VALIDATION_ERROR");
  assert.equal(result.failed[1]?.message, "matchType 'regex' is not enabled in v1 (REQ-22)");
  assert.deepEqual(result.failed.map((f) => f.index), [0, 2], "failure indices point back at the ORIGINAL batch position, not a compacted one");
  for (const failure of result.failed) {
    assert.equal(typeof failure.code, "string");
    assert.ok(failure.code.length > 0);
  }

  const stored = await deps.redirectRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(stored.length, 3, "the pre-seeded rule plus the two newly-created ones, nothing from the two failures");
});

test("redirects_import: every created row is source:'import', distinguishable from a manual redirects_create row", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "redirects_import").handler(
    executionContext({ rules: [{ matchType: "exact", fromPattern: "/imported", toTarget: "/target", statusCode: 301 }] }),
  )) as { created: Array<{ source: string }> };
  assert.equal(result.created[0]?.source, "import");
});

test("redirects_import: every row lands under the caller's real workspace and actor, not per-row input — mirrors redirects_create's attribution", async () => {
  const { deps, redirectRepo } = fakeRouteDeps();
  await wired(deps, "redirects_import").handler(
    executionContext({
      rules: [
        { matchType: "exact", fromPattern: "/attrib-1", toTarget: "/t1", statusCode: 301 },
        { matchType: "exact", fromPattern: "/attrib-2", toTarget: "/t2", statusCode: 302 },
      ],
    }),
  );

  // Assert against the REAL stored records (toRedirectToolView deliberately drops workspaceId/
  // actor attribution from the model-facing response — see this file's own header comment), so
  // this checks the domain write, not an echo of the tool's input.
  const stored = await redirectRepo.list({ workspaceId: WORKSPACE_ID });
  const imported = stored.filter((r) => r.fromPattern === "/attrib-1" || r.fromPattern === "/attrib-2");
  assert.equal(imported.length, 2);
  for (const rule of imported) {
    assert.equal(rule.workspaceId, WORKSPACE_ID, "row must carry the caller's real workspace id, not an omitted/undefined one");
    assert.equal(rule.createdByPrincipal, PRINCIPAL_ID, "row must carry the caller's real principal id as actor, not an omitted/undefined one");
  }
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

test("redirects_get_hits selects the requested redirect's counts", async () => {
  const { deps } = fakeRouteDeps();
  const ids: string[] = [];
  for (const fromPattern of ["/first", "/second"]) {
    const created = await wired(deps, "redirects_create").handler(executionContext({ matchType: "exact", fromPattern, toTarget: "/target", statusCode: 301 })) as { rule: { id: string } };
    ids.push(created.rule.id);
  }
  assert.notEqual(ids[0], ids[1]);
  for (const redirectId of [ids[0]!, ids[1]!, ids[1]!]) {
    await deps.redirectHitSink.record({ workspaceId: WORKSPACE_ID, redirectId, at: NOW });
  }
  for (const [redirectId, hitCount] of [[ids[0]!, 1], [ids[1]!, 2]] as const) {
    assert.deepEqual(await wired(deps, "redirects_get_hits").handler(executionContext({ id: redirectId })),
      { stats: { workspaceId: WORKSPACE_ID, redirectId, hitCount, lastHitAt: NOW } });
  }
});
