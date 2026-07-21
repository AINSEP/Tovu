import assert from "node:assert/strict";
import test from "node:test";

import { acquireOperationLock, releaseOperationLock } from "../../operation-lock";

/**
 * @file CIC U-001 (SPEC-019) — cross-domain concurrent-acquire property test.
 *
 * This is THE highest-priority integration test across the entire 019/020 TDD dispatch
 * (per both packages' CIC Downstream Handoff Notes): it is the one property that cannot be
 * verified by testing either domain (`features/database`'s migrate-forward, `features/recovery`'s
 * restore) in isolation — REQ-13/INV-03's cross-screen guarantee only exists when both domains
 * are proven to share exactly one lock outcome for the same site.
 *
 * Binding constraint: U-001-B1 (single shared entry point) + U-001-ORD1 (lock acquisition is
 * provably the first side-effecting step of both `executeMigrateForward` and `executeRestore`).
 * This file proves the primitive's own concurrency guarantee directly; `executeRestore`'s own
 * "consult-before-mutate" ordering is proven separately in
 * `features/recovery/__tests__/integration/recovery-orchestrator.execute-restore.integration.test.ts`.
 */

test("U-001-B1/ORD1 (property): N simultaneous acquireOperationLock attempts for the same site, from simulated Database and Recovery callers, resolve to exactly one winner", async () => {
  const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
  const siteId = "site-contested";

  // Simulate 6 "simultaneous" callers: 3 as if from Database's migrate-forward path,
  // 3 as if from Recovery's restore path — the primitive must not distinguish caller identity,
  // only siteId, per U-001-B1's "never two domain-local checks that happen to look similar".
  const attempts = [
    { operationKind: "migration" as const },
    { operationKind: "restore" as const },
    { operationKind: "migration" as const },
    { operationKind: "restore" as const },
    { operationKind: "migration" as const },
    { operationKind: "restore" as const },
  ];

  const results = await Promise.all(
    attempts.map((a) => acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: a.operationKind } }))
  );

  const winners = results.filter((r) => r.ok);
  const losers = results.filter((r) => !r.ok);

  assert.equal(winners.length, 1, "exactly one caller must win the lock, regardless of which domain it represents");
  assert.equal(losers.length, attempts.length - 1);
  for (const loser of losers) {
    if (!loser.ok) assert.equal(loser.error.code, "OPERATION_IN_FLIGHT");
  }
});

test("U-001-B1 (property): for 50 independent sites, each site's own 4 concurrent attempts resolve independently to exactly one winner per site", async () => {
  const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
  const siteIds = Array.from({ length: 50 }, (_, i) => `site-${i}`);

  const perSiteResults = await Promise.all(
    siteIds.map((siteId) =>
      Promise.all([
        acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "restore" } }),
        acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } }),
        acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "restore" } }),
        acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } }),
      ])
    )
  );

  for (const results of perSiteResults) {
    const winners = results.filter((r) => r.ok);
    assert.equal(winners.length, 1, "each independent site must resolve to exactly one winner, unaffected by other sites' contention");
  }
});

test("U-001-ORD1: after a winning acquire and a subsequent release, a fresh acquire for the same site can win again (no permanent lockout)", async () => {
  const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
  const siteId = "site-cycle";

  const first = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const contendedWhileHeld = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "restore" } });
  assert.equal(contendedWhileHeld.ok, false);

  await releaseOperationLock({ deps: { clock }, input: { siteId, handle: first.value } });

  const second = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "restore" } });
  assert.equal(second.ok, true);
});
