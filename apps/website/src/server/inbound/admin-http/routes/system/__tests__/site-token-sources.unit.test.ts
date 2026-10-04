import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os, { homedir, tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

import { resolveSiteTokenSources, type AdminSiteTokenDeps } from "../site-token.js";

const SOURCE_HOME = "/tmp/tovu-token-source-home";
const SOURCE_CWD = "/tmp/tovu-token-source-cwd";

beforeEach((t) => {
  const mode = process.env.TOVU_RUNTIME_MODE;
  process.env.TOVU_RUNTIME_MODE = "local";
  t.mock.method(os, "homedir", () => SOURCE_HOME);
  t.mock.method(process, "cwd", () => SOURCE_CWD);
  syncBuiltinESMExports();
  t.after(() => {
    if (mode === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = mode;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
});

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
    assert.deepEqual(sources, [
      { kind: "per-site-file", path: `${SOURCE_HOME}/.tovu/site-keys/site-abc.hex` },
      { kind: "env" },
      { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
    ]);
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
    assert.equal(keyFilePath, undefined);
    assert.deepEqual(sources, [
      { kind: "env" },
      { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
    ]);
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
      ["env", "volume-file", "legacy-volume-file"]
    );
    assert.equal(keyFilePath, join(process.cwd(), "sites", ".tovu", "site-key.hex"));
    assert.deepEqual(sources, [
      { kind: "env" },
      { kind: "volume-file", path: `${SOURCE_CWD}/sites/.tovu/site-key.hex` },
      { kind: "legacy-volume-file", path: `${SOURCE_CWD}/sites/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
    ]);
  } finally {
    if (originalMode === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = originalMode;
    rmSync(dir, { recursive: true, force: true });
  }
});


test("resolveSiteTokenSources: the new env name wins only when nonblank", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-token-sources-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));
  for (const [value, envVarName] of [["new-key", "TOVU_SITE_KEY"], [" \t ", "TOVU_SITE_KEY"]]) {
    assert.deepEqual(resolveSiteTokenSources(depsFor(dir), { TOVU_RUNTIME_MODE: "local", TOVU_SITE_KEY: value, [LEGACY_SITE_KEY_ENV_VAR_NAME]: "old-key" }).sources, [
      { kind: "per-site-file", path: `${SOURCE_HOME}/.tovu/site-keys/site-abc.hex` },
      { kind: "env" },
      { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
    ]);
  }
});

for (const meta of ["{ malformed", "{}", '{"siteId":42}', '{"siteId":"../escape"}']) {
  test(`resolveSiteTokenSources: invalid metadata ${meta} uses only legacy sources`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "tovu-site-token-sources-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, ".site-meta.json"), meta);
    assert.deepEqual(resolveSiteTokenSources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" }), {
      sources: [
        { kind: "env" },
        { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
      ],
      keyFilePath: undefined,
    });
  });
}
