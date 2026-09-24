import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveSiteTokenSources, type AdminSiteTokenDeps } from "../site-token.js";

/**
 * @file Site-key plan §A3b — `resolveSiteTokenSources` is the admin Site Token route's own
 * site-aware source resolution, unit-tested directly against a temp `siteBinding.dir` rather than
 * through HTTP/Express (cheap, no fixture machinery). `admin-site-token-routes.test.ts`'s own
 * HTTP-level tests use `createRouteDeps()`'s real `siteBinding` and cover request/response
 * behavior; this file covers the site-aware DECISION LOGIC itself.
 */

/** A minimal `AdminSiteTokenDeps` — only `siteBinding` is read by `resolveSiteTokenSources`, so
 *  `workspaceId`/`authorize` are never touched and stay unset. */
function depsFor(dir: string): AdminSiteTokenDeps {
  return {
    siteBinding: { dir, name: "test-site", dirOverridden: false, switcherCompatible: true },
  } as unknown as AdminSiteTokenDeps;
}

test("resolveSiteTokenSources: local mode with a resolvable siteKeyId prefers the per-site file", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-token-sources-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));

    const { sources, keyFilePath } = resolveSiteTokenSources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" });

    assert.deepEqual(
      sources.map((s) => s.kind),
      ["per-site-file", "env", "legacy-shared-file"]
    );
    assert.equal(keyFilePath, join(homedir(), ".tovu", "site-keys", "site-abc.hex"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteTokenSources: no .site-meta.json falls back to today's behavior — no per-site candidate, legacy default keyFilePath", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-token-sources-"));
  try {
    const { sources, keyFilePath } = resolveSiteTokenSources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" });

    assert.deepEqual(
      sources.map((s) => s.kind),
      ["env", "legacy-shared-file"]
    );
    assert.equal(keyFilePath, join(homedir(), ".tovu", "integrations-root-key.hex"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteTokenSources: production mode never has a per-site candidate, even with a resolvable siteKeyId", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-token-sources-"));
  // `defaultRootKeyFilePath()` (the `keyFilePath` fallback for a `sources` list with no
  // per-site candidate) resolves its own mode from the REAL `process.env.TOVU_RUNTIME_MODE`, not
  // from an `env` snapshot passed to `resolveSiteTokenSources` — same pattern
  // `keyring.env.test.ts`'s own `defaultRootKeyFilePath` production test uses. The real route
  // always calls `resolveSiteTokenSources(deps)` with `env` defaulted to `process.env` itself, so
  // the two never disagree there; this test sets the real var for the same reason.
  const originalMode = process.env.TOVU_RUNTIME_MODE;
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));
    process.env.TOVU_RUNTIME_MODE = "production";

    const { sources, keyFilePath } = resolveSiteTokenSources(depsFor(dir), { TOVU_RUNTIME_MODE: "production" });

    assert.deepEqual(
      sources.map((s) => s.kind),
      ["env", "legacy-volume-file"]
    );
    assert.equal(keyFilePath, join(process.cwd(), "sites", ".tovu", "integrations-root-key.hex"));
  } finally {
    if (originalMode === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = originalMode;
    rmSync(dir, { recursive: true, force: true });
  }
});
