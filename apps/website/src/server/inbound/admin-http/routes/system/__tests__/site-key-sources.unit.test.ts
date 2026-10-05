import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os, { homedir, tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

import { resolveSiteKeySources, type AdminSiteKeyDeps } from "../site-key.js";

const SOURCE_HOME = "/tmp/tovu-token-source-home";
const SOURCE_CWD = "/tmp/tovu-token-source-cwd";

beforeEach((t) => {
  // A file-level beforeEach runs once per test, so `t` is always a TestContext at runtime; the
  // hook's declared type also admits SuiteContext (no `mock`/`after`), which this narrows away.
  assert.ok("mock" in t, "file-level beforeEach must receive a TestContext");
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
 * @file Site-key plan §A3b — `resolveSiteKeySources` is the admin Site key route's own
 * site-aware source resolution, unit-tested directly against a temp `siteBinding.dir` rather than
 * through HTTP/Express (cheap, no fixture machinery). `admin-site-key-routes.test.ts`'s own
 * HTTP-level tests use `createRouteDeps()`'s real `siteBinding` and cover request/response
 * behavior; this file covers the site-aware DECISION LOGIC itself.
 */

/** A minimal `AdminSiteKeyDeps` — only `siteBinding` is read by `resolveSiteKeySources`, so
 *  `workspaceId`/`authorize` are never touched and stay unset. */
function depsFor(dir: string): AdminSiteKeyDeps {
  return {
    siteBinding: { dir, name: "test-site", dirOverridden: false, switcherCompatible: true },
  } as unknown as AdminSiteKeyDeps;
}

test("resolveSiteKeySources: local mode with a resolvable siteKeyId prefers the per-site file", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-sources-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));

    const { sources, keyFilePath } = resolveSiteKeySources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" });

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

test("resolveSiteKeySources: no .site-meta.json falls back to today's behavior — no per-site candidate, legacy default keyFilePath", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-sources-"));
  try {
    const { sources, keyFilePath } = resolveSiteKeySources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" });

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

test("resolveSiteKeySources: production mode never has a per-site candidate, even with a resolvable siteKeyId", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-sources-"));
  // `defaultSiteKeyFilePath()` (the `keyFilePath` fallback for a `sources` list with no
  // per-site candidate) resolves its own mode from the REAL `process.env.TOVU_RUNTIME_MODE`, not
  // from an `env` snapshot passed to `resolveSiteKeySources` — same pattern
  // `keyring.env.test.ts`'s own `defaultSiteKeyFilePath` production test uses. The real route
  // always calls `resolveSiteKeySources(deps)` with `env` defaulted to `process.env` itself, so
  // the two never disagree there; this test sets the real var for the same reason.
  const originalMode = process.env.TOVU_RUNTIME_MODE;
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));
    process.env.TOVU_RUNTIME_MODE = "production";

    const { sources, keyFilePath } = resolveSiteKeySources(depsFor(dir), { TOVU_RUNTIME_MODE: "production" });

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


test("resolveSiteKeySources: the env candidate keeps its place whether TOVU_SITE_KEY is set or blank", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-sources-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-abc" }));
  for (const value of ["new-key", " \t "]) {
    assert.deepEqual(resolveSiteKeySources(depsFor(dir), { TOVU_RUNTIME_MODE: "local", TOVU_SITE_KEY: value }).sources, [
      { kind: "per-site-file", path: `${SOURCE_HOME}/.tovu/site-keys/site-abc.hex` },
      { kind: "env" },
      { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
    ]);
  }
});

for (const meta of ["{ malformed", "{}", '{"siteId":42}', '{"siteId":"../escape"}']) {
  test(`resolveSiteKeySources: invalid metadata ${meta} uses only legacy sources`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-sources-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, ".site-meta.json"), meta);
    assert.deepEqual(resolveSiteKeySources(depsFor(dir), { TOVU_RUNTIME_MODE: "local" }), {
      sources: [
        { kind: "env" },
        { kind: "legacy-shared-file", path: `${SOURCE_HOME}/.tovu/${LEGACY_SITE_KEY_FILENAME}` },
      ],
      keyFilePath: undefined,
    });
  });
}
