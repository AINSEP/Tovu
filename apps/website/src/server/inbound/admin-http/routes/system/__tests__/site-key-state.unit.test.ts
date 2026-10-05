import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

import { registerAdminSiteKeyRoutes, siteKeyState } from "../site-key.js";

/**
 * @file Site-key plan §A.6 — `siteKeyState` is the admin Site key route's pure decision table:
 * given an already-computed `SiteKeyStatus` plus the two site-key-plan-specific inputs
 * (`.site-meta.json`'s stamped fingerprint, and whether this site's `content.db` holds
 * key-dependent data), it derives the `SiteKeyState` the `GET` response's `state` field carries.
 * Tested directly here (no HTTP, no filesystem) for exhaustive branch coverage;
 * `admin-site-key-routes.test.ts` covers the route's own I/O wiring end to end.
 */

test("siteKeyState: invalid always wins, regardless of active/fingerprint/hasKeyDependentData", () => {
  assert.equal(
    siteKeyState({ active: false, invalid: true, hasKeyDependentData: true }),
    "invalid"
  );
  assert.equal(
    siteKeyState({ active: true, invalid: true, fingerprint: "abc123abc123", hasKeyDependentData: false }),
    "invalid"
  );
});

test("siteKeyState: active with no .site-meta.json fingerprint stamped yet → 'active'", () => {
  assert.equal(
    siteKeyState({ active: true, fingerprint: "abc123abc123", metaFingerprint: undefined, hasKeyDependentData: false }),
    "active"
  );
});

test("siteKeyState: active with a stamped fingerprint that matches the resolved key → 'active'", () => {
  assert.equal(
    siteKeyState({
      active: true,
      fingerprint: "abc123abc123",
      metaFingerprint: "abc123abc123",
      hasKeyDependentData: false,
    }),
    "active"
  );
});

test("siteKeyState: active with a stamped fingerprint that differs from the resolved key → 'mismatch'", () => {
  assert.equal(
    siteKeyState({
      active: true,
      fingerprint: "abc123abc123",
      metaFingerprint: "def456def456",
      hasKeyDependentData: false,
    }),
    "mismatch"
  );
});

test("siteKeyState: not active, this site's content.db has no key-dependent data → 'missing'", () => {
  assert.equal(siteKeyState({ active: false, hasKeyDependentData: false }), "missing");
});

test("siteKeyState: not active, this site's content.db holds key-dependent data → 'missing-with-data'", () => {
  assert.equal(siteKeyState({ active: false, hasKeyDependentData: true }), "missing-with-data");
});


test("GET status treats a failed open-store scan as missing-with-data rather than an empty store", async (t) => {
  const dir = mkdtempSync(join(os.tmpdir(), "tovu-token-scan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const variables = ["TOVU_SITE_KEY", "TOVU_RUNTIME_MODE"] as const;
  const previous = variables.map((key) => process.env[key]);
  delete process.env.TOVU_SITE_KEY;
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
  registerAdminSiteKeyRoutes({ get: (_path: string, h: any) => { if (!handler) handler = h; }, post: () => {} } as any, deps as any, {} as any);
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
