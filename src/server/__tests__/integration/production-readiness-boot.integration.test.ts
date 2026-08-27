import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { CAPABILITY_INVENTORY } from "../../capability-inventory.js";
import { runProductionReadinessGate } from "../../production-readiness-gate.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file SPEC-022 — real-composition integration coverage (AC-01, AC-05, AC-12, AC-23/24,
 * INV-01). Unlike the unit suite (fakes throughout), this exercises the REAL
 * `capability-inventory.ts` against the REAL route-registration source in `deps.ts`/`app.ts`,
 * and the REAL gate function against today's actual (pre-Phase-1) durability state.
 *
 * Deliberate design: this test does not need a fabricated "undurable capability" fixture —
 * as of this spec, several real production-classified capabilities (webhooks, analytics,
 * members, etc., per ADR-046's own Context section) genuinely lack a durable adapter in the
 * real `createSqliteRouteDeps()` composition today. So booting the REAL system in
 * `production` mode with the REAL inventory should refuse for real, current reasons — proving
 * the gate closes the actual gap ADR-046 exists to fix, not a synthetic stand-in for it.
 */

const SERVER_DIR = path.join(import.meta.dirname, "..", "..");
const DEPS_SOURCE = fs.readFileSync(path.join(SERVER_DIR, "deps.ts"), "utf8");
const APP_SOURCE = fs.readFileSync(path.join(SERVER_DIR, "app.ts"), "utf8");

test("AC-23/24/REQ-12: every capability named in the inventory corresponds to something real in deps.ts or app.ts", () => {
  for (const cap of CAPABILITY_INVENTORY) {
    const mentioned = DEPS_SOURCE.includes(cap.name) || APP_SOURCE.includes(cap.name) || (cap.sourceHints ?? []).some((h) => DEPS_SOURCE.includes(h) || APP_SOURCE.includes(h));
    assert.ok(mentioned, `inventory entry "${cap.name}" (or one of its sourceHints) was not found anywhere in deps.ts/app.ts — likely stale (REQ-12)`);
  }
});

test("AC-05/INV-01: booting the REAL composition in production mode refuses given today's real non-durable capabilities", async () => {
  const mode = resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "production" } });
  assert.equal(mode, "production");

  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      // Deliberately the REAL current state as of this spec: no dev-secret/localhost-egress/
      // always-on-analytics-stub containment logic exists yet, so these must reflect what a
      // real production deploy would actually have configured (the Programmer stage wires the
      // real checks; this test asserts the AGGREGATE outcome, not each individual sub-check).
      hasDevSecretPlaceholder: false,
      hasLocalhostEgressAllowance: false,
      hasAlwaysOnAnalyticsStub: false,
      hasDefaultOwnerPassword: false,
    },
  });

  const productionClassifiedButUndurable = CAPABILITY_INVENTORY.filter((c) => c.classification === "production" && c.hasDurableAdapter === false);
  assert.ok(
    productionClassifiedButUndurable.length > 0,
    "sanity check: as of Phase 0 (before Phase 1's durable adapters land), at least one production-classified capability must genuinely lack a durable adapter today — if this fails, either the inventory is wrong or Phase 1 already shipped and this test needs updating"
  );

  assert.equal(result.ok, false, "the real composition must refuse to boot in production mode today, given real undurable production-classified capabilities");
  if (!result.ok) {
    const namedCapabilities = result.failures.filter((f) => f.code === "PRODUCTION_CAPABILITY_NOT_DURABLE").map((f) => f.details.capabilityName);
    for (const cap of productionClassifiedButUndurable) {
      assert.ok(namedCapabilities.includes(cap.name), `expected the real gate to name "${cap.name}" among its failures`);
    }
  }
});

test("§2.1 step 1: the real composition boots successfully in local mode despite the same real non-durable capabilities", async () => {
  const mode = resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "local" } });
  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: { hasDevSecretPlaceholder: false, hasLocalhostEgressAllowance: false, hasAlwaysOnAnalyticsStub: false, hasDefaultOwnerPassword: false },
  });
  assert.equal(result.ok, true, "local mode must never be blocked by production-only containment");
});
