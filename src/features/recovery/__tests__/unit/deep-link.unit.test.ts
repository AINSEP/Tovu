import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeepLinkContext } from "../../deep-link";

/**
 * @file REQ-20/REQ-21 (SPEC-019) — `resolveDeepLinkContext` never trusts a deep-link envelope's
 * carried values; every id is re-looked-up server-side (C-306; INV-04).
 *
 * Covers: AC-30 (restorePointId re-looked-up before render), AC-31/EC-03 (stale/forged id ->
 * not-found/re-derive fallback, never proceeds with the envelope's stale value).
 */

function envelope(overrides: Partial<{ restorePointId: string | null; ledgerEventId: string | null; siteId: string }> = {}) {
  return {
    v: 1,
    correlationId: "corr-1",
    siteId: "site-1",
    ledgerEventId: null,
    restorePointId: "rp-envelope-value",
    drift: "none",
    intent: "view",
    issuedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

test("AC-30/INV-04: resolveDeepLinkContext returns a value from the server-side re-lookup, never the envelope's raw carried restorePointId", async () => {
  const lookup = {
    findRestorePointById: async (id: string) =>
      id === "rp-envelope-value" ? { restorePointId: "rp-envelope-value", capturedAt: "2026-07-14T00:00:00.000Z" } : null,
  };

  const result = await resolveDeepLinkContext({
    deps: { lookup },
    input: { principalId: "user-1", principalKind: "user", envelope: envelope() },
  });

  assert.equal(result.found, true);
  assert.equal(result.restorePoint?.restorePointId, "rp-envelope-value");
});

test("AC-31/EC-03: a restorePointId that no longer resolves to a live record returns {found:false} rather than proceeding with the envelope's stale value", async () => {
  const lookup = {
    findRestorePointById: async () => null, // simulates a deleted/pruned restore point
  };

  const result = await resolveDeepLinkContext({
    deps: { lookup },
    input: { principalId: "user-1", principalKind: "user", envelope: envelope({ restorePointId: "rp-deleted" }) },
  });

  assert.equal(result.found, false);
  assert.equal(result.restorePoint, null);
});

test("INV-04 (adversarial): a forged restorePointId that happens to match a valid ULID shape but does not exist server-side is never trusted", async () => {
  const lookup = {
    findRestorePointById: async (id: string) => {
      // Only a specific legitimate id resolves — proves the lookup, not the envelope shape, is authoritative.
      return id === "rp-legit" ? { restorePointId: "rp-legit", capturedAt: "2026-07-14T00:00:00.000Z" } : null;
    },
  };

  const result = await resolveDeepLinkContext({
    deps: { lookup },
    input: { principalId: "user-1", principalKind: "user", envelope: envelope({ restorePointId: "01FORGEDULIDLOOKSVALIDXXXXX" }) },
  });

  assert.equal(result.found, false, "a syntactically-plausible but server-unknown id must never be trusted (INV-04)");
});

test("resolveDeepLinkContext never mutates the input envelope object", async () => {
  const lookup = { findRestorePointById: async () => null };
  const inputEnvelope = envelope();
  const snapshot = JSON.parse(JSON.stringify(inputEnvelope));

  await resolveDeepLinkContext({
    deps: { lookup },
    input: { principalId: "user-1", principalKind: "user", envelope: inputEnvelope },
  });

  assert.deepEqual(inputEnvelope, snapshot);
});
