import assert from "node:assert/strict";
import test from "node:test";

import { resolveDegradedBanner } from "../../ui/degraded-banners";

/**
 * @file behavior.spec.md §1.1 (SPEC-019) — degraded-state banner precedence resolver (C-308).
 *
 * Precedence order (highest to lowest): migration.interrupted > PENDING_MIGRATION >
 * operation-in-flight > costClass:'unavailable' > watermark-baseline-unavailable.
 *
 * Covers: AC-27 (PENDING_MIGRATION banner action deep-links to Storage only), AC-29
 * (migration.interrupted surfaced with "planned downtime" substring), INV-07 (PENDING_MIGRATION
 * banner action never routes to a Recovery restore-flow action), EC-06 (both interrupted and
 * pending-migration true at once — interrupted wins the primary slot, pending-migration remains
 * visible beneath it, per behavior.spec.md's own worked example — this resolver test asserts the
 * PRIMARY selection only, since "remains visible beneath" is a rendering-layer composition
 * concern the resolver's contract does not own).
 */

function capabilities(overrides: Partial<{
  costClass: "cheap" | "expensive" | "unavailable";
  operationInFlight: boolean;
  pendingMigration: boolean;
  migrationInterrupted: boolean;
  watermarkBaselineAvailable: boolean;
}> = {}) {
  return {
    costClass: "cheap" as const,
    operationInFlight: false,
    pendingMigration: false,
    migrationInterrupted: false,
    watermarkBaselineAvailable: true,
    ...overrides,
  };
}

test("EC-06: when migration.interrupted AND PENDING_MIGRATION are both true, migration-interrupted takes the primary banner slot", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ migrationInterrupted: true, pendingMigration: true }) });

  assert.equal(banner?.kind, "migration-interrupted");
});

test("AC-29: the migration-interrupted banner's accessible text includes the literal substring 'planned downtime'", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ migrationInterrupted: true }) });

  assert.ok(banner);
  assert.ok(banner.accessibleText.includes("planned downtime"), `expected 'planned downtime' substring, got: ${banner.accessibleText}`);
});

test("precedence: PENDING_MIGRATION outranks operation-in-flight when migration.interrupted is false", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ pendingMigration: true, operationInFlight: true }) });

  assert.equal(banner?.kind, "pending-migration");
});

test("AC-27/INV-07: the pending-migration banner's action always deep-links to Storage's migration ceremony, never a Recovery restore-flow action", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ pendingMigration: true }) });

  assert.ok(banner);
  assert.equal(banner.actionKind, "deep-link-to-storage-migration");
  assert.notEqual(banner.actionKind, "restore-flow");
});

test("precedence: operation-in-flight outranks costClass:'unavailable'", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ operationInFlight: true, costClass: "unavailable" }) });

  assert.equal(banner?.kind, "operation-in-flight");
});

test("precedence: costClass:'unavailable' outranks watermark-baseline-unavailable", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities({ costClass: "unavailable", watermarkBaselineAvailable: false }) });

  assert.equal(banner?.kind, "cost-unavailable");
});

test("no degraded condition true -> resolver returns null (no banner rendered)", () => {
  const banner = resolveDegradedBanner({ capabilities: capabilities() });

  assert.equal(banner, null);
});
