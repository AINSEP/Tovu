import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

import { registerAdminSiteTokenRoutes, siteTokenState } from "../site-token.js";

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


test("GET status treats a failed open-store scan as missing-with-data rather than an empty store", async (t) => {
  const dir = mkdtempSync(join(os.tmpdir(), "tovu-token-scan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const variables = ["TOVU_SITE_KEY", "TOVU_INTEGRATIONS_ROOT_KEY", "TOVU_RUNTIME_MODE"] as const;
  const previous = variables.map((key) => process.env[key]);
  delete process.env.TOVU_SITE_KEY;
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  process.env.TOVU_RUNTIME_MODE = "local";
  t.mock.method(os, "homedir", () => dir);
  t.mock.method(process, "cwd", () => dir);
  syncBuiltinESMExports();
  t.after(() => {
    variables.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  let scans = 0;
  let failScan = false;
  let handler: any;
  const deps = {
    workspaceId: "ws-scan", siteBinding: { dir },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentKernel: { dialect: "sqlite", query: async () => { scans++; if (failScan) throw new Error("catalog unavailable"); return []; } },
  };
  registerAdminSiteTokenRoutes({ get: (_path: string, h: any) => { if (!handler) handler = h; }, post: () => {} } as any, deps as any, {} as any);
  async function status() {
    let code = 0;
    let body: any;
    const res = { locals: { principal: { id: "owner" }, authCredentialKind: "session" }, status: (value: number) => { code = value; return res; }, json: (value: unknown) => { body = value; return res; } };
    await handler({ params: { workspaceId: "ws-scan" } }, res);
    assert.equal(code, 200);
    return body;
  }
  assert.equal((await status()).state, "missing");
  const before = scans;
  failScan = true;
  const failed = await status();
  assert.equal(scans, before + 1, "the actual catalog query must execute and fail");
  assert.equal(failed.active, false);
  assert.equal(failed.state, "missing-with-data");
});
