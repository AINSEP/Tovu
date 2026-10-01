import assert from "node:assert/strict";
import test from "node:test";

import { evaluateBootMigrationPolicy, UnresolvedInterruptedMigrationError } from "../../boot/evaluate-boot-migration-policy.js";
import { reconcileInterruptedMigrationOnBoot, type SiteServeStatus } from "../../boot/reconcile-interrupted-migration.js";

/**
 * @file SPEC-017 C-106 / C-107 / CIC U-004 / INV-08 / REQ-15 / REQ-28 / REQ-29 — boot-sequence
 * defensive guard: reconciliation blocks a site and policy independently refuses unresolved runs.
 * Production reconciliation is wired; the auto-migrate policy is not yet wired into boot.
 *
 * Assumed seam design:
 *
 * ```ts
 * export interface MigrationRunsRepoPort {
 *   findNonTerminalForSite(siteId: string): Promise<{ id: string; status: string } | null>;
 * }
 * export interface BootLedgerPort {
 *   appendInterruptedRow(params: { siteId: string; migrationRunId: string }): Promise<void>;
 * }
 * export interface SiteStatusPort {
 *   get(siteId: string): Promise<"SERVING" | "PENDING_MIGRATION" | "BLOCKED_PENDING_RECOVERY">;
 *   set(siteId: string, status: "SERVING" | "PENDING_MIGRATION" | "BLOCKED_PENDING_RECOVERY"): Promise<void>;
 * }
 *
 * export async function reconcileInterruptedMigrationOnBoot(
 *   required: { siteId: string; migrationRuns: MigrationRunsRepoPort; ledger: BootLedgerPort; siteStatus: SiteStatusPort },
 *   optional?: {}
 * ): Promise<{ blocked: boolean }>;
 *
 * export async function evaluateBootMigrationPolicy(
 *   required: { siteId: string; costClass: "cheap" | "expensive" | "unavailable"; siteStatus: SiteStatusPort;
 *     migrationRuns: MigrationRunsRepoPort; runAutoMigrate: () => Promise<void> },
 *   optional?: {}
 * ): Promise<void>; // throws if a non-terminal migration_runs row still exists (defense-in-depth per U-004-B1)
 * ```
 *
 * Certifies CIC U-004-B1/ORD1: `evaluateBootMigrationPolicy` must never be invoked (nor, as
 * defense-in-depth, ever proceed) while a non-terminal `migration_runs` row exists for the site.
 * The boot composition root's own call-site ordering (calling C-106 then, only after resolution,
 * C-107) cannot be asserted by a unit test alone — this integration test additionally verifies
 * C-107 is defensively self-protecting: even if a future edit to the composition root accidentally
 * invoked it too early, it refuses to proceed.
 */

function fakeMigrationRunsRepo(nonTerminal: { id: string; status: string } | null) {
  const lookups: string[] = [];
  return {
    lookups,
    async findNonTerminalForSite(siteId: string) {
      lookups.push(siteId);
      return siteId === "site-1" ? nonTerminal : null;
    },
    async markResolved() { throw new Error("boot reconciliation must not resolve runs"); },
  };
}

function fakeSiteStatus(initial: SiteServeStatus) {
  const statuses = new Map<string, SiteServeStatus>([["site-1", initial], ["site-2", "SERVING"]]);
  return {
    async get(siteId: string) {
      assert.ok(statuses.has(siteId), `unexpected site ${siteId}`);
      return statuses.get(siteId)!;
    },
    async set(siteId: string, next: SiteServeStatus) {
      assert.ok(statuses.has(siteId), `unexpected site ${siteId}`);
      statuses.set(siteId, next);
    },
  };
}

test("U-004-B1 / REQ-15 / AC-17: reconcileInterruptedMigrationOnBoot converts a non-terminal row into a blocking state and appends a migration.interrupted ledger row", async () => {
  const migrationRuns = fakeMigrationRunsRepo({ id: "run-1", status: "APPLYING" });
  const siteStatus = fakeSiteStatus("SERVING");
  const ledgerRows: Array<{ siteId: string; migrationRunId: string }> = [];
  const ledger = {
    async appendInterruptedRow(params: { siteId: string; migrationRunId: string }) {
      ledgerRows.push(params);
    },
  };

  const result = await reconcileInterruptedMigrationOnBoot({ siteId: "site-1", migrationRuns, ledger, siteStatus });

  assert.equal(result.blocked, true);
  assert.deepEqual(migrationRuns.lookups, ["site-1"]);
  assert.deepEqual(ledgerRows, [{ siteId: "site-1", migrationRunId: "run-1" }]);
  assert.equal(await siteStatus.get("site-2"), "SERVING");
  assert.equal(await siteStatus.get("site-1"), "BLOCKED_PENDING_RECOVERY");
});

test("reconcileInterruptedMigrationOnBoot resolves (does not block) when no non-terminal row exists", async () => {
  const migrationRuns = fakeMigrationRunsRepo(null);
  const siteStatus = fakeSiteStatus("SERVING");
  const ledger = { async appendInterruptedRow() {} };

  const result = await reconcileInterruptedMigrationOnBoot({ siteId: "site-1", migrationRuns, ledger, siteStatus });

  assert.equal(result.blocked, false);
  assert.equal(await siteStatus.get("site-1"), "SERVING");
});

test("U-004-B1 / U-004-ORD1 / INV-08: evaluateBootMigrationPolicy refuses to run while a non-terminal migration_runs row still exists for the site — defense-in-depth against an out-of-order boot wiring bug", async () => {
  const migrationRuns = fakeMigrationRunsRepo({ id: "run-1", status: "APPLYING" });
  const siteStatus = fakeSiteStatus("BLOCKED_PENDING_RECOVERY");
  let autoMigrateRan = false;

  await assert.rejects(
    evaluateBootMigrationPolicy({
      siteId: "site-1",
      costClass: "cheap",
      siteStatus,
      migrationRuns,
      runAutoMigrate: async () => {
        autoMigrateRan = true;
      },
    }),
    UnresolvedInterruptedMigrationError
  );

  assert.equal(autoMigrateRan, false, "INV-08: auto-migrate must never run while an unresolved crashed migration exists");
});

test("AC-37 / REQ-28: evaluateBootMigrationPolicy triggers auto-migrate when costClass='cheap' and no non-terminal row exists", async () => {
  const migrationRuns = fakeMigrationRunsRepo(null);
  const siteStatus = fakeSiteStatus("SERVING");
  let autoMigrateRan = false;

  await evaluateBootMigrationPolicy({
    siteId: "site-1",
    costClass: "cheap",
    siteStatus,
    migrationRuns,
    runAutoMigrate: async () => {
      autoMigrateRan = true;
    },
  });

  assert.equal(autoMigrateRan, true);
});

test("AC-38 / AC-39 / REQ-29 / REQ-30 / INV-04: evaluateBootMigrationPolicy enters PENDING_MIGRATION (never auto-migrates) when costClass is 'expensive' or 'unavailable'", async () => {
  for (const costClass of ["expensive", "unavailable"] as const) {
    const migrationRuns = fakeMigrationRunsRepo(null);
    const siteStatus = fakeSiteStatus("SERVING");
    let autoMigrateRan = false;

    await evaluateBootMigrationPolicy({
      siteId: "site-1",
      costClass,
      siteStatus,
      migrationRuns,
      runAutoMigrate: async () => {
        autoMigrateRan = true;
      },
    });

    assert.equal(autoMigrateRan, false, `costClass='${costClass}' must never trigger auto-migrate`);
    assert.equal(await siteStatus.get("site-1"), "PENDING_MIGRATION");
  }
});

test("after a blocked reconciliation, the policy independently rejects the still-unresolved migration", async () => {
  const migrationRuns = fakeMigrationRunsRepo({ id: "run-1", status: "SNAPSHOTTING" });
  const siteStatus = fakeSiteStatus("SERVING");
  const invocationOrder: string[] = [];
  const ledger = {
    async appendInterruptedRow() {
      invocationOrder.push("reconcile");
    },
  };

  const reconcileResult = await reconcileInterruptedMigrationOnBoot({ siteId: "site-1", migrationRuns, ledger, siteStatus });
  assert.equal(reconcileResult.blocked, true);

  // The boot composition root's own contract: C-107 is only invoked AFTER C-106 resolves/blocks.
  // Since reconciliation blocked (found a non-terminal row), a correctly-wired boot sequence must
  // not invoke evaluateBootMigrationPolicy at all this cycle. This test proves the function itself
  // still refuses even if a caller violated that contract (defense-in-depth, matching the unit test
  // above) — the composition root's own call-site is a Programmer architecture-audit item, not
  // something this test can observe directly.
  invocationOrder.push("policy-attempted");
  await assert.rejects(
    evaluateBootMigrationPolicy({
      siteId: "site-1",
      costClass: "cheap",
      siteStatus,
      migrationRuns,
      runAutoMigrate: async () => {
        invocationOrder.push("auto-migrate-ran");
      },
    }),
    UnresolvedInterruptedMigrationError
  );

  assert.deepEqual(invocationOrder, ["reconcile", "policy-attempted"], "auto-migrate must never run after a blocked reconciliation");
});
