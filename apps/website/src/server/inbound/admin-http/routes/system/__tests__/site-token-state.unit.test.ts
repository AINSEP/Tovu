import assert from "node:assert/strict";
import test from "node:test";

import { siteTokenState } from "../site-token.js";

/**
 * @file Site-key plan §A.6 — `siteTokenState` is the admin Site Token route's pure decision table:
 * given an already-computed `RootKeyStatus` plus the two site-key-plan-specific inputs
 * (`.site-meta.json`'s stamped fingerprint, and whether this site's `content.db` holds
 * key-dependent data), it derives the `SiteTokenState` the `GET` response's `state` field carries.
 * Tested directly here (no HTTP, no filesystem) for exhaustive branch coverage;
 * `admin-site-token-routes.test.ts` covers the route's own I/O wiring end to end.
 */

test("siteTokenState: invalid always wins, regardless of active/fingerprint/hasKeyDependentData", () => {
  assert.equal(
    siteTokenState({ active: false, invalid: true, hasKeyDependentData: true }),
    "invalid"
  );
  assert.equal(
    siteTokenState({ active: true, invalid: true, fingerprint: "abc123abc123", hasKeyDependentData: false }),
    "invalid"
  );
});

test("siteTokenState: active with no .site-meta.json fingerprint stamped yet → 'active'", () => {
  assert.equal(
    siteTokenState({ active: true, fingerprint: "abc123abc123", metaFingerprint: undefined, hasKeyDependentData: false }),
    "active"
  );
});

test("siteTokenState: active with a stamped fingerprint that matches the resolved key → 'active'", () => {
  assert.equal(
    siteTokenState({
      active: true,
      fingerprint: "abc123abc123",
      metaFingerprint: "abc123abc123",
      hasKeyDependentData: false,
    }),
    "active"
  );
});

test("siteTokenState: active with a stamped fingerprint that differs from the resolved key → 'mismatch'", () => {
  assert.equal(
    siteTokenState({
      active: true,
      fingerprint: "abc123abc123",
      metaFingerprint: "def456def456",
      hasKeyDependentData: false,
    }),
    "mismatch"
  );
});

test("siteTokenState: not active, this site's content.db has no key-dependent data → 'missing'", () => {
  assert.equal(siteTokenState({ active: false, hasKeyDependentData: false }), "missing");
});

test("siteTokenState: not active, this site's content.db holds key-dependent data → 'missing-with-data'", () => {
  assert.equal(siteTokenState({ active: false, hasKeyDependentData: true }), "missing-with-data");
});
