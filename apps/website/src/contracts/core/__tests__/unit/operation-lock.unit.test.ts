import assert from "node:assert/strict";
import test from "node:test";

import { acquireOperationLock, isOperationInFlight, releaseOperationLock } from "../../operation-lock.js";

/**
 * @file CIC U-001 (SPEC-019 `critical-internal-constraints.md`) — `core/operation-lock.ts`'s
 * site-wide gated-operation mutual exclusion primitive (C-309; REQ-13, INV-03; GOV-ADR-002).
 *
 * This is the SINGLE, SHARED primitive both `features/database` (SPEC-017) and
 * `features/recovery` (SPEC-019) MUST consult before starting a gated operation. It is
 * designated here (SPEC-019's own package) per the CIC's Cross-Feature Persistence rule —
 * do not duplicate this file's tests in SPEC-017's own test suite.
 *
 * Binding constraints covered here:
 * - U-001-B1: `acquireOperationLock` is the single shared entry point.
 * - U-001-B2: atomic check-and-set, never a separate read-then-write (TOCTOU prevention).
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };

test("U-001-B1: acquireOperationLock succeeds when no operation is in flight for the site", async () => {
  const result = await acquireOperationLock({
    deps: { clock },
    input: { siteId: "site-1", operationKind: "restore" },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.siteId, "site-1");
    assert.equal(result.value.operationKind, "restore");
    // Pre-existing test-isolation bug fixed 2026-07-16 (found while gathering round-2 re-audit
    // evidence for TM-adr041-043-044-045-audit-001, Finding 3): this file's registry is a
    // module-singleton (see operation-lock.ts's own header) shared across every test in this
    // process, so a held-but-never-released "site-1" lock leaked into the next two tests below,
    // making their own "fresh acquire" assertions fail. Release it here so "site-1" starts clean
    // for the next test, same as every other test in this file already does for its own siteId.
    await releaseOperationLock({ deps: { clock }, input: { siteId: "site-1", handle: result.value } });
  }
});

test("U-001-B1: a second acquireOperationLock for the same site is rejected while the first is held, regardless of operationKind", async () => {
  const first = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "restore" } });
  assert.equal(first.ok, true);

  const second = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "migration" } });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.error.code, "OPERATION_IN_FLIGHT");
  }

  if (first.ok) {
    await releaseOperationLock({ deps: { clock }, input: { siteId: "site-1", handle: first.value } });
  }
});

test("U-001-B1: acquireOperationLock for a DIFFERENT site succeeds even while site-1's lock is held (no cross-site interference)", async () => {
  const siteOne = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "restore" } });
  assert.equal(siteOne.ok, true);

  assert.ok(siteOne.ok);
  let siteTwo: Awaited<ReturnType<typeof acquireOperationLock>> | undefined;
  try {
    siteTwo = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-2", operationKind: "migration" } });
    assert.equal(siteTwo.ok, true);
  } finally {
    if (siteTwo?.ok) await releaseOperationLock({ deps: { clock }, input: { siteId: "site-2", handle: siteTwo.value } });
    await releaseOperationLock({ deps: { clock }, input: { siteId: "site-1", handle: siteOne.value } });
  }
});

test("releaseOperationLock frees the site so a subsequent acquireOperationLock for the same site succeeds", async () => {
  const first = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-3", operationKind: "restore" } });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  await releaseOperationLock({ deps: { clock }, input: { siteId: "site-3", handle: first.value } });

  const second = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-3", operationKind: "migration" } });
  assert.equal(second.ok, true);
  if (second.ok) await releaseOperationLock({ deps: { clock }, input: { siteId: "site-3", handle: second.value } });
});

test("releasing a lock for a site with no held lock is a no-op, not an error (idempotent release)", async () => {
  await assert.doesNotReject(() =>
    releaseOperationLock({ deps: { clock }, input: { siteId: "site-never-locked", handle: { siteId: "site-never-locked", operationKind: "restore", acquiredAt: NOW } } })
  );
});

test("isOperationInFlight (Finding 3 fix, 2026-07-16 re-audit): false for a site with no held lock, true while one is held, false again after release", async () => {
  assert.equal(isOperationInFlight({ siteId: "site-4" }, {}), false);

  const acquired = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-4", operationKind: "restore" } });
  assert.equal(acquired.ok, true);
  if (!acquired.ok) return;

  assert.equal(isOperationInFlight({ siteId: "site-4" }, {}), true);
  assert.equal(isOperationInFlight({ siteId: "site-other" }, {}), false, "a peek must never leak state across siteId");

  await releaseOperationLock({ deps: { clock }, input: { siteId: "site-4", handle: acquired.value } });
  assert.equal(isOperationInFlight({ siteId: "site-4" }, {}), false);
});

// F6.2/F7.5: old holders must not release a newer operation, even at the same pinned timestamp.
test('releasing a stale handle cannot free a newer holder for the same site', async () => {
  const siteId = 'stale-handle-site';
  const first = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: 'restore' } });
  assert.ok(first.ok);
  await releaseOperationLock({ deps: { clock }, input: { siteId, handle: first.value } });
  const current = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: 'restore' } });
  assert.ok(current.ok);
  try {
    await releaseOperationLock({ deps: { clock }, input: { siteId, handle: first.value } });
    assert.equal(isOperationInFlight({ siteId: siteId }, {}), true);
    const blocked = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: 'migration' } });
    assert.deepEqual(blocked, { ok: false, error: { code: 'OPERATION_IN_FLIGHT', message: `an operation is already in flight for site '${siteId}'` } });
  } finally {
    await releaseOperationLock({ deps: { clock }, input: { siteId, handle: current.value } });
  }
});
