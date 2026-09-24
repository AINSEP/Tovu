import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { ForbiddenError as CommandForbiddenError, assertToolIsWirable } from "@jini-ai/cms/core";
import {
  getDatabaseAgentToolCatalog,
  type AgentToolDefinition as DatabaseAgentToolDefinition,
} from "../../features/database/agent-tools.js";
import {
  InMemoryDatabaseIntrospectionAdapter,
  InMemoryDatabaseLedgerRepo,
  InMemoryDbOpsAdapter,
  InMemoryMigrationRunsRepo,
  InMemoryRestorePointsRepo,
  InMemorySiteStatusRepo,
} from "../../features/database/repo.memory.js";
import {
  recoveryAgentToolCatalog,
  type AgentToolDefinition as RecoveryAgentToolDefinition,
} from "../../features/recovery/agent-tools.js";
import {
  AlwaysUnavailableWatermarkSource,
  RestorePointDeepLinkLookup,
} from "../../features/recovery/repo.memory.js";
import { buildGatewayDeps } from "../../contracts/core/gated-mutations/composition.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type DeliverResult } from "../../contracts/core/tool-surface-exchanges.js";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeRecoveryTools } from "../../features/recovery/tool-registrations.js";
import { contributeDatabaseTools } from "../../features/database/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Recovery moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`. Database was tried in the same batch and reverted, then
// retried and landed in a later, separate pass the same day (once the one edge closing its 16-module
// SCC — `getDriftStatus`'s value import — was cut by relocating `drift.ts` into `db/`; see
// `features/database/tool-registrations.ts`'s own header) — so it now needs the identical explicit
// install call Recovery does, rather than arriving via `DOMAIN_SLICES`.
resetToolContributorsForTests();
registerToolContributor(contributeRecoveryTools());
registerToolContributor(contributeDatabaseTools());

/**
 * @file The combined Database (SPEC-017, ADR-041) + Recovery (SPEC-019, ADR-045) tool-wiring test
 * file — combined into one file (mirroring `tool-registrations.forms.test.ts`'s own precedent of
 * folding contract + authorization coverage together) because these two domains already share
 * almost their entire `RouteDeps` surface in the real codebase (`server/modules/database-recovery.ts`,
 * `server/routes/admin/database-recovery/deps.ts`'s own `DatabaseRecoveryRouteDeps` narrowing) and
 * because proving the deliberate `backup_create_restore_point` cross-domain id-collision handling
 * requires seeing both catalogs' wiring side by side.
 *
 * Covers: catalog completeness (exactly which entries are wired vs. declared-but-unwired and why),
 * published contract parity (inputSchema/description travel from catalog to descriptor unchanged),
 * the independent risk-metadata cross-check, the human-confirm gate on
 * `database_execute_migrate_forward`/`backup_execute_restore` (section 6), the pass-through
 * ToolPolicy, the ADR-021 §2 authorization half (every wired tool reaches the SAME inline
 * `authorize()` check its HTTP route reaches, ahead of any read/write), and two multi-tool
 * workflow tests (one entirely within Database, one spanning Database's create + Recovery's
 * list/plan against the exact id the earlier call returned).
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const order: string[] = [];

  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    order.push("authorize");
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  // `database.migrate`/`backup.restore` are `scopeKind: "instance"` (69f9b52c, 2026-08-12) — their
  // gateway `plan()`/`confirm()`/`execute()` calls route through `authorizeInstance`, never
  // `authorize`, and fail closed (`INSTANCE_AUTHORIZATION_NOT_CONFIGURED`) if it is left unbound
  // (`gateway.ts`'s `authorizeForHooks`). Recorded into the SAME `authorizeCalls` array as `authorize`
  // (not a separate one) so the generic per-tool loop below can observe it via one shared list, the
  // way it already does for every workspace-scoped tool.
  const authorizeInstance = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    order.push("authorizeInstance");
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  let counter = 0;
  const clock = { nowIso: () => NOW };
  const idGen = { newId: () => `id-${++counter}` };

  const realRestorePointsRepo = new InMemoryRestorePointsRepo();
  const realDbOps = new InMemoryDbOpsAdapter();
  const databaseLedgerRepo = new InMemoryDatabaseLedgerRepo();
  const siteStatusRepo = new InMemorySiteStatusRepo();
  const migrationRunsRepo = new InMemoryMigrationRunsRepo();
  const databaseIntrospection = new InMemoryDatabaseIntrospectionAdapter();
  const disclosureWatermarkSource = new AlwaysUnavailableWatermarkSource();
  const deepLinkRestorePointLookup = new RestorePointDeepLinkLookup(realRestorePointsRepo);

  // Thin logging wrappers over the two real adapters a write actually touches
  // (`backup_create_restore_point`'s only mutating path) — everything else passes straight through.
  // This is what makes "authorize before any write" directly observable via `order`, the same
  // technique `tool-registrations.forms.test.ts`'s own `fakeRouteDeps` uses.
  const restorePointsRepo = {
    list: () => realRestorePointsRepo.list(),
    findByIdempotencyKey: (key: string) => realRestorePointsRepo.findByIdempotencyKey(key),
    save: async (row: Parameters<typeof realRestorePointsRepo.save>[0]) => {
      order.push("restorePointsRepo.save");
      return realRestorePointsRepo.save(row);
    },
  };
  const dbOps = {
    getCapabilities: () => realDbOps.getCapabilities(),
    restoreFromArtifact: (r: Parameters<typeof realDbOps.restoreFromArtifact>[0]) => realDbOps.restoreFromArtifact(r),
    captureRestorePoint: async (r: Parameters<typeof realDbOps.captureRestorePoint>[0]) => {
      order.push("dbOps.captureRestorePoint");
      return realDbOps.captureRestorePoint(r);
    },
  };

  const gatewayDeps = buildGatewayDeps({ clock, idGen, authorize, authorizeInstance });

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    authorize,
    databaseLedgerRepo,
    restorePointsRepo,
    dbOps,
    databaseIntrospection,
    siteStatusRepo,
    migrationRunsRepo,
    disclosureWatermarkSource,
    deepLinkRestorePointLookup,
    gatedMutations: { gatewayDeps },
  };

  return {
    deps: deps as unknown as RouteDeps,
    authorizeCalls,
    order,
    repos: { restorePointsRepo: realRestorePointsRepo, dbOps: realDbOps, databaseLedgerRepo, siteStatusRepo, migrationRunsRepo, databaseIntrospection },
  };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

async function seedRestorePoint(
  repos: ReturnType<typeof fakeRouteDeps>["repos"],
  id = "rp-seed",
): Promise<string> {
  await repos.restorePointsRepo.save({
    restorePointId: id,
    idempotencyKey: `idem-${id}`,
    trigger: "manual",
    createdAt: NOW,
    createdBy: "seed",
    costClass: "cheap",
    kind: "file-snapshot",
    watermarkAtCapture: 0,
    artifactRef: `memory://restore-point/${id}`,
  });
  return id;
}

// Each domain's own catalog still lists its Tier-1 read tools under their ORIGINAL ids — the
// 2026-09-08 `content_read` collapse (assistant/content-read-tool.ts) rewrites only the final WIRED
// registration list, never a domain catalog. So the id sets these registration filters use must
// carry the `content_read.<resource>` cards explicitly, or the collapsed replacements are filtered
// straight back out and every lookup below reports the tool as simply "not wired".
const DATABASE_READ_CARD_IDS = ["content_read.database_pending_migration", "content_read.database_restore_point"];
const RECOVERY_READ_CARD_IDS = ["content_read.backup_restore_point"];

const DATABASE_TOOL_IDS: ReadonlySet<string> = new Set([...getDatabaseAgentToolCatalog().map((tool) => tool.name), ...DATABASE_READ_CARD_IDS]);
const RECOVERY_TOOL_IDS: ReadonlySet<string> = new Set([...recoveryAgentToolCatalog.map((tool) => tool.name), ...RECOVERY_READ_CARD_IDS]);

function allRegistrations(deps: RouteDeps): ToolRegistration[] {
  return buildAssistantToolRegistrations(deps);
}

function databaseRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(allRegistrations(deps).filter((r) => DATABASE_TOOL_IDS.has(r.descriptor.id)).map((r) => [r.descriptor.id, r]));
}

function recoveryRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(allRegistrations(deps).filter((r) => RECOVERY_TOOL_IDS.has(r.descriptor.id)).map((r) => [r.descriptor.id, r]));
}

function combinedRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map([...databaseRegistrations(deps), ...recoveryRegistrations(deps)]);
}

function wired(map: Map<string, ToolRegistration>, toolId: string): ToolRegistration {
  const found = map.get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function databaseCatalogEntry(toolId: string): DatabaseAgentToolDefinition {
  const entry = getDatabaseAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `database catalog has no entry for '${toolId}'`);
  return entry;
}

function recoveryCatalogEntry(toolId: string): RecoveryAgentToolDefinition {
  const entry = recoveryAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `recovery catalog has no entry for '${toolId}'`);
  return entry;
}

/** Each read card's single member tool, so a card's expected permission is resolved from the SAME
 *  catalog entry the collapse itself copied it from rather than re-declared as a second literal
 *  here (which could then drift from what `content-read-tool.ts` actually ships). */
const READ_CARD_MEMBER_ID: Readonly<Record<string, string>> = {
  "content_read.database_pending_migration": "database_list_pending_migrations",
  "content_read.database_restore_point": "database_list_restore_points",
  "content_read.backup_restore_point": "backup_list_restore_points",
};

function permissionOf(toolId: string): string {
  const id = READ_CARD_MEMBER_ID[toolId] ?? toolId;
  return (DATABASE_TOOL_IDS.has(id) ? databaseCatalogEntry(id) : recoveryCatalogEntry(id)).authorization.permission;
}

/** The two human-confirmed execute tools — their authorize/deny checks are in section 6, because a
 *  call without an `emitSurface` is refused before it could ever finish. */
const EXECUTE_TOOL_INPUTS: Record<string, (seededId: string) => Record<string, unknown>> = {
  database_execute_migrate_forward: () => ({}),
  backup_execute_restore: (id) => ({ restorePointId: id }),
};

// ---------------------------------------------------------------------------
// 1. Catalog completeness — wired vs. declared-but-unwired, and the excluded tools stay excluded
// ---------------------------------------------------------------------------

test("database: exactly the 8 wireable entries are registered", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...databaseRegistrations(deps).keys()].sort(),
    [
      "backup_create_restore_point",
      "content_read.database_pending_migration",
      "content_read.database_restore_point",
      "database_execute_migrate_forward",
      "database_get_health",
      "database_get_schema_state",
      "database_plan_migrate_forward",
      "database_query_timeline",
    ],
  );
  assert.equal(getDatabaseAgentToolCatalog().length, 9, "sanity: the full database catalog is still 9 entries");
});

test("recovery: exactly the 6 wireable entries are registered, PLUS backup_create_restore_point shows up here too by id membership only — it is Database's handler, not Recovery's own (see the dedicated collision test below)", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...recoveryRegistrations(deps).keys()].sort(),
    [
      "backup_create_restore_point", // Database's wiring; recoveryRegistrations() filters by id membership in recoveryAgentToolCatalog, and this id is catalogued (but not wired) there too.
      "backup_execute_restore",
      "backup_get_capabilities",
      "backup_plan_restore",
      "content_read.backup_restore_point",
      "recovery_get_status",
      "recovery_resolve_deep_link",
    ],
  );
  assert.equal(recoveryAgentToolCatalog.length, 7, "sanity: 5 original SPEC-019 entries + 2 new additions");
});

const HUMAN_CONFIRMER_REFUSAL = (toolId: string) =>
  `tool-registrations: '${toolId}' declares actorClassRule 'confirmer-must-equal-own-delegatedBy', which needs a human confirmer — ` +
  "build its handler with humanConfirmedHandler so a human answers through the host's confirmation transport (see ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT)";

test("database_execute_migrate_forward is registered and classified mutates-durable-state, but refused without its human-confirmed handler", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(databaseRegistrations(deps).has("database_execute_migrate_forward"), true);
  // The handler-less check stands for "a plain handler": still refused at build time.
  assert.throws(
    () => assertRiskMetadataIsWirable("database_execute_migrate_forward", databaseCatalogEntry("database_execute_migrate_forward")),
    { message: HUMAN_CONFIRMER_REFUSAL("database_execute_migrate_forward") },
  );
});

test("backup_execute_restore is registered and classified mutates-durable-state, but refused without its human-confirmed handler", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(recoveryRegistrations(deps).has("backup_execute_restore"), true);
  assert.throws(
    () => assertRiskMetadataIsWirable("backup_execute_restore", recoveryCatalogEntry("backup_execute_restore")),
    { message: HUMAN_CONFIRMER_REFUSAL("backup_execute_restore") },
  );
});

test("the human-confirmer guard itself refuses a plain handler for a confirmer-must-equal-own-delegatedBy tool, given a matching risk classification", () => {
  // Called against the kit's `assertToolIsWirable` directly with a self-contained, single-entry
  // `derivedRisk` map, so ambient registry state can never make this probe drift.
  assert.throws(
    () =>
      assertToolIsWirable({
        toolId: "synthetic_confirmation_probe",
        catalogEntry: {
          ...databaseCatalogEntry("database_execute_migrate_forward"),
          name: "synthetic_confirmation_probe",
          sideEffects: "mutates-durable-state",
        },
        derivedRisk: new Map([["synthetic_confirmation_probe", "mutates-durable-state"]]),
        handler: async () => ({}),
      }),
    { message: HUMAN_CONFIRMER_REFUSAL("synthetic_confirmation_probe") },
  );
});

test("migrate-forward and restore are the only execute tools here, and each says the user confirms first", () => {
  const { deps } = fakeRouteDeps();
  const executeIds = allRegistrations(deps)
    .map((r) => r.descriptor.id)
    .filter((id) => /^(database|backup)_execute_/.test(id))
    .sort();
  assert.deepEqual(executeIds, ["backup_execute_restore", "database_execute_migrate_forward"]);
  for (const id of executeIds) {
    assert.match(wired(combinedRegistrations(deps), id).descriptor.description, /Shows the user a confirm dialog first and only runs if they confirm\./);
  }
});

test("backup_create_restore_point is registered exactly ONCE across the whole assistant tool set, despite being catalogued in both Database and Recovery", () => {
  const { deps } = fakeRouteDeps();
  const matches = allRegistrations(deps).filter((r) => r.descriptor.id === "backup_create_restore_point");
  assert.equal(matches.length, 1, "a cross-domain catalog id collision must resolve to exactly one wired handler, never zero or two");
  // And it is Database's own handler that actually captures a real snapshot artifact — proven in
  // the workflow tests below (section 5), not re-asserted here by inspecting internals.
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired database/recovery registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of databaseRegistrations(deps)) {
    // A `content_read.*` card is catalogued in assistant/content-read-tool.ts, not in this
    // domain's own catalog, so there is no entry here to compare against. Its schema and
    // description are cross-checked against ITS OWN catalog by `deriveContentReadRegistrations`'s
    // `buildDomainRegistrations` call at construction time.
    if (id.startsWith("content_read.")) continue;
    assert.deepEqual(registration.descriptor.inputSchema, databaseCatalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, databaseCatalogEntry(id).description);
  }
  for (const [id, registration] of recoveryRegistrations(deps)) {
    // Skip the one id that collides across both catalogs — this registration IS Database's own
    // handler (asserted against Database's catalog entry above), not Recovery's; Recovery's own
    // catalog entry for this id is never wired at all (see the collision test), so it publishes no
    // schema for `tool-registrations.ts` to have copied in the first place.
    if (id === "backup_create_restore_point") continue;
    // A `content_read.*` card is catalogued in assistant/content-read-tool.ts, not in this
    // domain's own catalog, so there is no entry here to compare against. Its schema and
    // description are cross-checked against ITS OWN catalog by `deriveContentReadRegistrations`'s
    // `buildDomainRegistrations` call at construction time.
    if (id.startsWith("content_read.")) continue;
    assert.deepEqual(registration.descriptor.inputSchema, recoveryCatalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, recoveryCatalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired database/recovery tool — the execute tools ask inside their own handler", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of combinedRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for every wired database/recovery tool", () => {
  const { deps } = fakeRouteDeps();
  for (const id of combinedRegistrations(deps).keys()) {
    // A `content_read.*` card is catalogued in assistant/content-read-tool.ts, not in this
    // domain's own catalog, so there is no entry here to compare against. Its schema and
    // description are cross-checked against ITS OWN catalog by `deriveContentReadRegistrations`'s
    // `buildDomainRegistrations` call at construction time.
    if (id.startsWith("content_read.")) continue;
    // Their actor-class rule needs the handler too — checked in section 1 above.
    if (EXECUTE_TOOL_INPUTS[id]) continue;
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, DATABASE_TOOL_IDS.has(id) ? databaseCatalogEntry(id) : recoveryCatalogEntry(id)));
  }
});

test("a catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for the mutating tool fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("backup_create_restore_point", { ...databaseCatalogEntry("backup_create_restore_point"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired database/recovery registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of combinedRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2) — every wired tool reaches the same inline authorize() its route does
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, (seededId: string) => Record<string, unknown>> = {
  database_query_timeline: () => ({}),
  "content_read.database_restore_point": () => ({}),
  database_plan_migrate_forward: () => ({}),
  database_get_health: () => ({}),
  database_get_schema_state: () => ({}),
  "content_read.database_pending_migration": () => ({}),
  backup_create_restore_point: () => ({}),
  "content_read.backup_restore_point": () => ({}),
  backup_get_capabilities: () => ({}),
  backup_plan_restore: (id) => ({ restorePointId: id }),
  recovery_get_status: () => ({}),
  recovery_resolve_deep_link: () => ({
    envelope: { v: 1, correlationId: "corr-1", siteId: WORKSPACE_ID, ledgerEventId: null, restorePointId: null, drift: "in-sync", intent: "view", issuedAt: NOW },
  }),
};

test("every wired database/recovery tool has a known input fixture — a newly wired tool must be added here, not silently skipped", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...combinedRegistrations(deps).keys()].sort(), [...Object.keys(TOOL_INPUTS), ...Object.keys(EXECUTE_TOOL_INPUTS)].sort());
});

// `database_plan_migrate_forward` is `scopeKind: "instance"` (69f9b52c, 2026-08-12) with no
// defensive pre-check of its own (`features/database/tool-registrations.ts`: "No explicit
// pre-check here: gateway.ts's plan() calls authorize() unconditionally") — its SOLE authorize
// call is the gateway's internal `authorizeForHooks` routing to `authorizeInstance`
// (`core/gated-mutations/ports.ts`'s `InstanceAuthorizeFn`), which carries no `workspaceId` at all
// by design: an instance-wide ceremony has no single owning workspace to scope against, and
// asserting one here would assert the exact authorization-bypass shape the scope fix closed.
// `backup_plan_restore` is also `scopeKind: "instance"` but is NOT in this set — its handler runs
// its own workspace-scoped `requireToolPermission` defensively BEFORE ever reaching the gateway
// (see the dedicated "checked twice" test below), so `authorizeCalls[0]` for that tool is still the
// workspace-scoped call this loop's default branch expects.
const INSTANCE_SCOPED_FIRST_CALL_TOOL_IDS: ReadonlySet<string> = new Set(["database_plan_migrate_forward"]);

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls, repos } = fakeRouteDeps();
    const seededId = await seedRestorePoint(repos);
    authorizeCalls.length = 0;

    await wired(combinedRegistrations(deps), toolId).handler(executionContext(TOOL_INPUTS[toolId](seededId)));

    assert.ok(authorizeCalls.length >= 1, `${toolId} must call authorize() at least once`);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, permissionOf(toolId));
    if (INSTANCE_SCOPED_FIRST_CALL_TOOL_IDS.has(toolId)) {
      assert.equal(
        authorizeCalls[0].workspaceId,
        undefined,
        `${toolId} is scopeKind: "instance" — its authorize check must never carry a workspaceId (a workspace-scoped grant must never authorize an instance-wide mutation)`,
      );
    } else {
      assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    }
  });

  test(`${toolId}: a denied principal is rejected and nothing is written`, async () => {
    const { deps, repos } = fakeRouteDeps({ allow: false });
    const seededId = await seedRestorePoint(repos);
    const before = await repos.restorePointsRepo.list();

    await assert.rejects(
      () => wired(combinedRegistrations(deps), toolId).handler(executionContext(TOOL_INPUTS[toolId](seededId))),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /is not authorized for/);
        assert.ok((error as Error).message.includes(permissionOf(toolId)), `expected the denial message to name '${permissionOf(toolId)}'`);
        return true;
      },
    );

    const after = await repos.restorePointsRepo.list();
    assert.equal(after.length, before.length, "the permission gate must run ahead of any durable effect");
  });
}

test("database_query_timeline / backup_list_restore_points / plugins-style reads: a denial throws core/commands's ForbiddenError specifically (no gateway involved)", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired(combinedRegistrations(deps), "database_query_timeline").handler(executionContext({})),
    CommandForbiddenError,
  );
});

test("backup_create_restore_point: authorize() runs before any write", async () => {
  const { deps, order } = fakeRouteDeps();
  order.length = 0;

  await wired(combinedRegistrations(deps), "backup_create_restore_point").handler(executionContext({}));

  assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
  assert.ok(order.includes("dbOps.captureRestorePoint"));
  assert.ok(order.includes("restorePointsRepo.save"));
  assert.ok(order.indexOf("authorize") < order.indexOf("dbOps.captureRestorePoint"), "authorize must precede the real snapshot capture");
  assert.ok(order.indexOf("dbOps.captureRestorePoint") < order.indexOf("restorePointsRepo.save"), "the snapshot must be captured before the row is persisted");
});

test("backup_plan_restore: authorize() is checked twice — once defensively by this tool ahead of planRestore's own cost-class short-circuit, once again inside the gateway's plan() — both agree", async () => {
  const { deps, authorizeCalls, repos } = fakeRouteDeps();
  const seededId = await seedRestorePoint(repos);
  authorizeCalls.length = 0;

  await wired(combinedRegistrations(deps), "backup_plan_restore").handler(executionContext({ restorePointId: seededId }));

  assert.equal(authorizeCalls.length, 2, "this tool adds a defensive pre-check that planRestore's own cost-class short-circuit could otherwise bypass");
  assert.ok(authorizeCalls.every((call) => call.permission === "backup.read"));
});

// ---------------------------------------------------------------------------
// 4b. The three DatabaseIntrospectionPort-backed tools (this dispatch) are pure passthroughs
// ---------------------------------------------------------------------------

test("database_get_health returns exactly what routeDeps.databaseIntrospection.getHealth() returns", async () => {
  const { deps, repos } = fakeRouteDeps();
  const expected = await repos.databaseIntrospection.getHealth();

  const result = await wired(combinedRegistrations(deps), "database_get_health").handler(executionContext({}));

  assert.deepEqual(result, expected);
});

test("database_get_schema_state returns exactly what routeDeps.databaseIntrospection.getSchemaState() returns", async () => {
  const { deps, repos } = fakeRouteDeps();
  const expected = await repos.databaseIntrospection.getSchemaState();

  const result = await wired(combinedRegistrations(deps), "database_get_schema_state").handler(executionContext({}));

  assert.deepEqual(result, expected);
});

test("database_list_pending_migrations returns exactly what routeDeps.databaseIntrospection.listPendingMigrations() returns", async () => {
  const { deps, repos } = fakeRouteDeps();
  const expected = await repos.databaseIntrospection.listPendingMigrations();

  const result = await wired(combinedRegistrations(deps), "content_read.database_pending_migration").handler(executionContext({}));

  assert.deepEqual(result, expected);
});

test("database_get_health / database_get_schema_state / database_list_pending_migrations all reject a populated input — they are parameterless tools", async () => {
  for (const toolId of ["database_get_health", "database_get_schema_state", "content_read.database_pending_migration"]) {
    const { deps } = fakeRouteDeps();
    await assert.rejects(
      () => wired(combinedRegistrations(deps), toolId).handler(executionContext({ unexpected: true })),
      /accepts no input/,
      `${toolId} must refuse a populated input`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflows — proves today's tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow (Database only): database_plan_migrate_forward's reported cost class feeds backup_create_restore_point's costAck, then database_list_restore_points confirms the new point", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = combinedRegistrations(deps);

  // Step 1: preview the migration plan to learn this site's current cost class — a pure read.
  const plan = (await wired(registrations, "database_plan_migrate_forward").handler(executionContext({}))) as {
    details: { costClass: "cheap" | "expensive" | "unavailable" };
  };
  assert.equal(plan.details.costClass, "cheap", "the in-memory DbOpsAdapter fixture always reports 'cheap'");

  // Step 2: mint a restore point, deriving costAck from step 1's own output — not a hardcoded
  // literal — the way a real caller chaining these two tools would.
  const created = (await wired(registrations, "backup_create_restore_point").handler(
    executionContext({ costAck: plan.details.costClass !== "cheap" }),
  )) as { restorePoint: { id: string; costClass: string } };
  assert.equal(created.restorePoint.costClass, "cheap");

  // Step 3: the id minted in step 2 must actually show up in this fresh list call.
  const listed = (await wired(registrations, "content_read.database_restore_point").handler(executionContext({}))) as {
    items: Array<{ id: string }>;
  };
  assert.ok(
    listed.items.some((item) => item.id === created.restorePoint.id),
    "the restore point minted in step 2 must appear in step 3's list — domain state must be consistent across the sequence",
  );
});

test("workflow (Database create -> Recovery list -> Recovery plan): a restore point minted via Database is visible and previewable through Recovery, using the exact id each step handed to the next", async () => {
  const { deps } = fakeRouteDeps();
  const registrations = combinedRegistrations(deps);

  // Step 1 (Database): mint a real restore point.
  const created = (await wired(registrations, "backup_create_restore_point").handler(executionContext({}))) as {
    restorePoint: { id: string };
  };

  // Step 2 (Recovery): the SAME shared restore-points list must show it — "sibling faces" of one
  // persisted record (ADR-045 §1) — and step 3 below consumes the id THIS call returned, not the
  // id step 1 returned directly, proving the chain actually flows through Recovery's own tool.
  const listed = (await wired(registrations, "content_read.backup_restore_point").handler(executionContext({}))) as {
    items: Array<{ id: string }>;
  };
  const targetId = listed.items.find((item) => item.id === created.restorePoint.id)?.id;
  assert.ok(targetId, "the point Database just created must be visible through Recovery's own list tool");

  // Step 3 (Recovery): preview a restore against exactly the id step 2 handed forward.
  const planned = (await wired(registrations, "backup_plan_restore").handler(executionContext({ restorePointId: targetId }))) as {
    plan: { details: { restorePointId: string } };
    disclosure: { partial: true; counts: Record<string, unknown> };
  };
  assert.equal(planned.plan.details.restorePointId, targetId, "the id returned by step 2 must be exactly what step 3 previewed against");
  assert.equal(planned.disclosure.partial, true, "the disclosure this tool folds in must still be present");
});

// ---------------------------------------------------------------------------
// 6. The two execute tools — the human confirms in chat, then the action runs (2026-09-24)
// ---------------------------------------------------------------------------

/**
 * Starts an execute tool against one exchange store, waits for its dialog, and hands back the
 * answer seam. `answer(principalId, decision)` posts a click the way `mcp-ui-tool-calls-route.ts` does.
 */
async function startExecute(deps: RouteDeps, toolId: string, input: Record<string, unknown>) {
  const surfaceExchanges = createSurfaceExchangeStore();
  const tool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === toolId);
  assert.ok(tool, `expected '${toolId}' to be wired`);
  const emitted: unknown[] = [];
  const pending = tool.handler({ ...executionContext(input), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(emitted.length, 1, "exactly one confirm dialog is shown");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the dialog carries its exchange id");
  const answer = (principalId: string, decision: "confirm" | "cancel"): DeliverResult =>
    surfaceExchanges.deliver({ exchangeId: match[1]!, toolId, principalId, params: { decision } });
  return { pending, html, answer };
}

const CANCELLED = { cancelled: true, note: "The user cancelled. Nothing was changed." };

const EXECUTE_CASES = [
  {
    toolId: "database_execute_migrate_forward",
    flag: "migrated",
    errorCode: "DATABASE",
    dialogText: [/Update the database\?/, /A restore point is taken first, so you can go back to how things are now\./],
  },
  {
    toolId: "backup_execute_restore",
    flag: "restored",
    errorCode: "RECOVERY",
    dialogText: [
      /Restore the site(&#39;|&#x27;|'|\\u0027)s data\?/,
      /Your current data will be replaced with this restore point\. Anything changed since then is lost\./,
      /No restore point is taken first, so this can(&#39;|&#x27;|'|\\u0027)t be undone\./,
    ],
  },
] as const;

/** What each execute tool leaves behind when it runs — and must not leave behind when it doesn't. */
async function executeEffects(fixture: ReturnType<typeof fakeRouteDeps>): Promise<{ migrateRestorePoints: number; siteStatus: unknown }> {
  const points = await fixture.repos.restorePointsRepo.list();
  return {
    migrateRestorePoints: points.filter((point) => point.trigger === "migrate-forward").length,
    siteStatus: await fixture.repos.siteStatusRepo.get(WORKSPACE_ID),
  };
}

for (const { toolId, flag, errorCode, dialogText } of EXECUTE_CASES) {
  test(`${toolId}: the human confirms in the dialog, then it runs`, async () => {
    const fixture = fakeRouteDeps();
    const seededId = await seedRestorePoint(fixture.repos);

    const { pending, html, answer } = await startExecute(fixture.deps, toolId, EXECUTE_TOOL_INPUTS[toolId](seededId));
    for (const text of dialogText) assert.match(html, text);
    assert.deepEqual(answer(PRINCIPAL_ID, "confirm"), { ok: true });

    const result = (await pending) as Record<string, unknown>;
    assert.equal(result[flag], true);
    if (toolId === "database_execute_migrate_forward") {
      assert.equal((await executeEffects(fixture)).migrateRestorePoints, 1, "migrate-forward takes its restore point first");
    } else {
      assert.equal(result.state, "RESTORED");
      assert.equal((await executeEffects(fixture)).migrateRestorePoints, 0, "restore takes no restore point first");
    }
  });

  test(`${toolId}: the human cancels — notConfirmedResult comes back and nothing runs`, async () => {
    const fixture = fakeRouteDeps();
    const seededId = await seedRestorePoint(fixture.repos);
    const before = await executeEffects(fixture);

    const { pending, answer } = await startExecute(fixture.deps, toolId, EXECUTE_TOOL_INPUTS[toolId](seededId));
    answer(PRINCIPAL_ID, "cancel");

    assert.deepEqual(await pending, { [flag]: false, ...CANCELLED });
    assert.deepEqual(await executeEffects(fixture), before);
  });

  test(`${toolId}: nothing in the model's input can stand in for the click — a confirm/token key is refused before any dialog`, async () => {
    const { deps, repos } = fakeRouteDeps();
    const seededId = await seedRestorePoint(repos);
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === toolId);
    assert.ok(tool);

    for (const key of ["confirm", "confirmationToken"]) {
      await assert.rejects(
        () => tool.handler({ ...executionContext({ ...EXECUTE_TOOL_INPUTS[toolId](seededId), [key]: key === "confirm" ? true : "tok" }), emitSurface: async () => undefined }),
        { message: `'${key}' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.` },
      );
    }
    assert.equal(surfaceExchanges.size(), 0, "no dialog was opened");

    await assert.rejects(() => tool.handler(executionContext(EXECUTE_TOOL_INPUTS[toolId](seededId))), {
      message:
        `${errorCode}_NO_CONFIRMATION_CHANNEL: ${toolId}: this execution context has no interactive ` +
        "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
    });
  });

  test(`${toolId}: a click from anyone but the delegating human is refused and leaves the dialog waiting`, async () => {
    const fixture = fakeRouteDeps();
    const seededId = await seedRestorePoint(fixture.repos);
    const before = await executeEffects(fixture);

    const { pending, answer } = await startExecute(fixture.deps, toolId, EXECUTE_TOOL_INPUTS[toolId](seededId));
    assert.deepEqual(answer("someone-else", "confirm"), { ok: false, reason: "binding-mismatch" });
    assert.deepEqual(await executeEffects(fixture), before, "the other principal's confirm ran nothing");

    answer(PRINCIPAL_ID, "cancel");
    assert.deepEqual(await pending, { [flag]: false, ...CANCELLED });
    assert.deepEqual(await executeEffects(fixture), before);
  });

  test(`${toolId}: a denied principal is refused before any dialog is shown`, async () => {
    const { deps, repos } = fakeRouteDeps({ allow: false });
    const seededId = await seedRestorePoint(repos);
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === toolId);
    assert.ok(tool);

    await assert.rejects(
      () => tool.handler({ ...executionContext(EXECUTE_TOOL_INPUTS[toolId](seededId)), emitSurface: async () => undefined }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /is not authorized for/);
        assert.ok(error.message.includes(permissionOf(toolId)), `expected the denial message to name '${permissionOf(toolId)}'`);
        return true;
      },
    );
    assert.equal(surfaceExchanges.size(), 0, "no dialog was opened");
  });
}
