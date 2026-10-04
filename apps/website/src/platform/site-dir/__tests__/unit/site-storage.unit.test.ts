import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SiteDirInvalidError } from "../../errors.js";
import { parseSiteStorage, resolveSiteStorage } from "../../site-storage.js";

/**
 * @file `resolveSiteStorage` / `parseSiteStorage` — the `.site-meta.json` `storage` field (R1 plan R1d).
 *
 * Outcome Matrix:
 *   Given ":memory:"                                   -> sqlite, no file read
 *   Given a folder with no .site-meta.json              -> sqlite
 *   Given the dev site's partial meta (site-key only)   -> sqlite
 *   Given a full meta without storage                  -> sqlite
 *   Given storage sqlite / pglite                       -> that kind
 *   Given storage postgres + secretRef "site" / {env}   -> that kind with the ref
 *   Given an unknown kind / non-object storage          -> SiteDirInvalidError naming the kind
 *   Given postgres without / with a bad secretRef       -> SiteDirInvalidError
 *   Given a connection string in the meta file          -> SiteDirInvalidError (O3)
 *   Given a meta file that is not JSON                  -> SiteDirInvalidError naming the file
 */

function withSiteDir(meta: string | undefined, fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-storage-"));
  try {
    if (meta !== undefined) fs.writeFileSync(path.join(dir, ".site-meta.json"), meta);
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function assertInvalid(fn: () => unknown, message: RegExp): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof SiteDirInvalidError, `expected SiteDirInvalidError, got ${String(err)}`);
    assert.match(err.message, message);
    return true;
  });
}

test(":memory: is always sqlite", () => {
  assert.deepEqual(resolveSiteStorage(":memory:"), { kind: "sqlite" });
});

test("a site folder with no .site-meta.json is sqlite", () => {
  withSiteDir(undefined, (dir) => assert.deepEqual(resolveSiteStorage(dir), { kind: "sqlite" }));
});

test("a non-ENOENT metadata read failure propagates instead of defaulting to sqlite", () => {
  withSiteDir(undefined, (dir) => {
    fs.mkdirSync(path.join(dir, ".site-meta.json"));
    assert.throws(() => resolveSiteStorage(dir), { code: "EISDIR" });
  });
});

test("the dev site's partial meta file (only the site-key fields) is sqlite", () => {
  // Exactly the shape of sites/tovu-dev/.site-meta.json on 2026-09-28.
  const devSiteMeta = JSON.stringify({ siteKeyId: "fe23a0eb-817d-4188-b8b7-afd9c52767e8", siteKeyFingerprint: "03b2912a352b" }, null, 2);
  withSiteDir(devSiteMeta, (dir) => assert.deepEqual(resolveSiteStorage(dir), { kind: "sqlite" }));
});

test("a full meta file without storage is sqlite", () => {
  const meta = JSON.stringify({ siteId: "s", templateId: "starter", templateVersion: "1.0.0", schemaVersion: 1, schemaTag: "t", createdAt: "x" });
  withSiteDir(meta, (dir) => assert.deepEqual(resolveSiteStorage(dir), { kind: "sqlite" }));
});

test("each valid kind is returned as written", () => {
  for (const storage of [
    { kind: "sqlite" },
    { kind: "pglite" },
    { kind: "postgres", secretRef: "site" },
    { kind: "postgres", secretRef: { env: "TOVU_PG_URL" } },
  ]) {
    withSiteDir(JSON.stringify({ siteKeyId: "k", storage }), (dir) => assert.deepEqual(resolveSiteStorage(dir), storage));
  }
});

test("an unknown kind or a non-object storage is refused", () => {
  withSiteDir(JSON.stringify({ storage: { kind: "mysql" } }), (dir) => assertInvalid(() => resolveSiteStorage(dir), /kind "mysql" is not one of/));
  assertInvalid(() => parseSiteStorage("sqlite"), /must be an object with a kind/);
  assertInvalid(() => parseSiteStorage(null), /must be an object with a kind/);
  assertInvalid(() => parseSiteStorage({}), /kind undefined is not one of/);
});

test("postgres needs a secretRef of \"site\" or { env } with a variable name", () => {
  assertInvalid(() => parseSiteStorage({ kind: "postgres" }), /secretRef must be/);
  assertInvalid(() => parseSiteStorage({ kind: "postgres", secretRef: "file" }), /secretRef must be/);
  assertInvalid(() => parseSiteStorage({ kind: "postgres", secretRef: { env: "" } }), /secretRef must be/);
  assertInvalid(() => parseSiteStorage({ kind: "postgres", secretRef: { env: "1BAD NAME" } }), /secretRef must be/);
});

test("a connection string in the meta file is refused, whatever the kind (O3)", () => {
  assertInvalid(() => parseSiteStorage({ kind: "postgres", secretRef: "site", connectionString: "postgres://u:p@h/db" }), /must not hold "connectionString"/);
  assertInvalid(() => parseSiteStorage({ kind: "postgres", url: "postgres://h/db" }), /must not hold "url"/);
  assertInvalid(() => parseSiteStorage({ kind: "sqlite", password: "x" }), /must not hold "password"/);
});

test("a meta file that is not JSON is refused, naming the file", () => {
  withSiteDir("{ torn", (dir) => assertInvalid(() => resolveSiteStorage(dir), /\.site-meta\.json is not valid JSON/));
});
