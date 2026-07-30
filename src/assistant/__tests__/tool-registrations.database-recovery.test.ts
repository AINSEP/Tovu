import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError as CommandForbiddenError } from "../../core/commands";
import { getDatabaseAgentToolCatalog, type AgentToolDefinition as DatabaseAgentToolDefinition } from "../../features/database/agent-tools";
import {
  InMemoryDatabaseIntrospectionAdapter,
  InMemoryDatabaseLedgerRepo,
  InMemoryDbOpsAdapter,
  InMemoryMigrationRunsRepo,
  InMemoryRestorePointsRepo,
  InMemorySiteStatusRepo,
} from "../../features/database/repo.memory";
import { recoveryAgentToolCatalog, type AgentToolDefinition as RecoveryAgentToolDefinition } from "../../features/recovery/agent-tools";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "../../features/recovery/repo.memory";
import { buildGatewayDeps } from "../../server/gated-mutations-composition";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

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
 * the independent risk-metadata cross-check, the confirmation-transport guard blocking
 * `database_execute_migrate_forward`/`backup_execute_restore` structurally, the pass-through
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

  const gatewayDeps = buildGatewayDeps({ clock, idGen, authorize });

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

const DATABASE_TOOL_IDS: ReadonlySet<string> = new Set(getDatabaseAgentToolCatalog().map((tool) => tool.name));
const RECOVERY_TOOL_IDS: ReadonlySet<string> = new Set(recoveryAgentToolCatalog.map((tool) => tool.name));

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

function permissionOf(toolId: string): string {
  return (DATABASE_TOOL_IDS.has(toolId) ? databaseCatalogEntry(toolId) : recoveryCatalogEntry(toolId)).authorization.permission;
}

// ---------------------------------------------------------------------------
// 1. Catalog completeness — wired vs. declared-but-unwired, and the excluded tools stay excluded
// ---------------------------------------------------------------------------

test("database: exactly the 7 wireable entries are registered", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...databaseRegistrations(deps).keys()].sort(),
    [
      "backup_create_restore_point",
      "database_get_health",
      "database_get_schema_state",
      "database_list_pending_migrations",
      "database_list_restore_points",
      "database_plan_migrate_forward",
      "database_query_timeline",
    ],
  );
  assert.equal(getDatabaseAgentToolCatalog().length, 9, "sanity: the full database catalog is still 9 entries");
});

test("recovery: exactly the 5 wireable entries are registered, PLUS backup_create_restore_point shows up here too by id membership only — it is Database's handler, not Recovery's own (see the dedicated collision test below)", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...recoveryRegistrations(deps).keys()].sort(),
    [
      "backup_create_restore_point", // Database's wiring; recoveryRegistrations() filters by id membership in recoveryAgentToolCatalog, and this id is catalogued (but not wired) there too.
      "backup_get_capabilities",
      "backup_list_restore_points",
      "backup_plan_restore",
      "recovery_get_status",
      "recovery_resolve_deep_link",
    ],
  );
  assert.equal(recoveryAgentToolCatalog.length, 7, "sanity: 5 original SPEC-019 entries + 2 new additions");
});

test("database_execute_migrate_forward is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification, which is itself a stronger guard than the confirmation-transport check alone (an unclassified tool can never reach that second check at all)", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(databaseRegistrations(deps).has("database_execute_migrate_forward"), false);
  assert.throws(
    () => assertRiskMetadataIsWirable("database_execute_migrate_forward", databaseCatalogEntry("database_execute_migrate_forward")),
    /has no entry in DERIVED_RISK_BY_TOOL_ID/,
  );
});

test("backup_execute_restore is never registered — same double-blocked guard as database_execute_migrate_forward", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(recoveryRegistrations(deps).has("backup_execute_restore"), false);
  assert.throws(
    () => assertRiskMetadataIsWirable("backup_execute_restore", recoveryCatalogEntry("backup_execute_restore")),
    /has no entry in DERIVED_RISK_BY_TOOL_ID/,
  );
});

test("the confirmation-transport guard itself also independently refuses both excluded tools, given a (hypothetical) matching risk classification", () => {
  // `assertRiskMetadataIsWirable` checks DERIVED_RISK_BY_TOOL_ID before actorClassRule, so proving
  // the SECOND guard needs a derived-risk entry to exist. Neither excluded tool has one (by
  // design — see the two tests above), so this is exercised against a synthetic stand-in catalog
  // entry carrying the same actorClassRule, using a tool id ("forms_create_definition") that DOES
  // have a derived-risk entry, to isolate exactly the actor-class check in question.
  assert.throws(
    () =>
      assertRiskMetadataIsWirable("forms_create_definition", {
        ...databaseCatalogEntry("database_execute_migrate_forward"),
        name: "forms_create_definition",
        sideEffects: "mutates-durable-state",
      }),
    /requires a human-confirmation transport/,
  );
});

test("no tool name across the whole assistant tool set implies migrate-forward or restore can be executed directly by an agent", () => {
  const { deps } = fakeRouteDeps();
  const ids = allRegistrations(deps).map((r) => r.descriptor.id);
  assert.equal(ids.includes("database_execute_migrate_forward"), false);
  assert.equal(ids.includes("backup_execute_restore"), false);
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
    assert.deepEqual(registration.descriptor.inputSchema, databaseCatalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, databaseCatalogEntry(id).description);
  }
  for (const [id, registration] of recoveryRegistrations(deps)) {
    // Skip the one id that collides across both catalogs — this registration IS Database's own
    // handler (asserted against Database's catalog entry above), not Recovery's; Recovery's own
    // catalog entry for this id is never wired at all (see the collision test), so it publishes no
    // schema for `tool-registrations.ts` to have copied in the first place.
    if (id === "backup_create_restore_point") continue;
    assert.deepEqual(registration.descriptor.inputSchema, recoveryCatalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, recoveryCatalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired database/recovery tool — no confirmation transport exists yet", () => {
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
  database_list_restore_points: () => ({}),
  database_plan_migrate_forward: () => ({}),
  database_get_health: () => ({}),
  database_get_schema_state: () => ({}),
  database_list_pending_migrations: () => ({}),
  backup_create_restore_point: () => ({}),
  backup_list_restore_points: () => ({}),
  backup_get_capabilities: () => ({}),
  backup_plan_restore: (id) => ({ restorePointId: id }),
  recovery_get_status: () => ({}),
  recovery_resolve_deep_link: () => ({
    envelope: { v: 1, correlationId: "corr-1", siteId: WORKSPACE_ID, ledgerEventId: null, restorePointId: null, drift: "in-sync", intent: "view", issuedAt: NOW },
  }),
};

test("every wired database/recovery tool has a known input fixture — a newly wired tool must be added here, not silently skipped", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...combinedRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls, repos } = fakeRouteDeps();
    const seededId = await seedRestorePoint(repos);
    authorizeCalls.length = 0;

    await wired(combinedRegistrations(deps), toolId).handler(executionContext(TOOL_INPUTS[toolId](seededId)));

    assert.ok(authorizeCalls.length >= 1, `${toolId} must call authorize() at least once`);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, permissionOf(toolId));
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
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

  const result = await wired(combinedRegistrations(deps), "database_list_pending_migrations").handler(executionContext({}));

  assert.deepEqual(result, expected);
});

test("database_get_health / database_get_schema_state / database_list_pending_migrations all reject a populated input — they are parameterless tools", async () => {
  for (const toolId of ["database_get_health", "database_get_schema_state", "database_list_pending_migrations"]) {
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
  const listed = (await wired(registrations, "database_list_restore_points").handler(executionContext({}))) as {
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
  const listed = (await wired(registrations, "backup_list_restore_points").handler(executionContext({}))) as {
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
