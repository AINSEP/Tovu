/**
 * @file `SiteShareRegistry`'s file-store error contract: a missing file is an ordinary miss (`null`
 * / `[]`), but any OTHER filesystem failure is rethrown — never mistaken for "no share", which would
 * let a revoked or unreadable share look absent. Real files in a temp directory; a directory placed
 * where a file is expected yields a genuine EISDIR/ENOTDIR from the OS.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { SiteShareRegistry, type SiteShareRecord } from "../share-registry.js";

const SHARE_ID = "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e";

async function tempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function record(token: string): SiteShareRecord {
  return { shareId: SHARE_ID, token, site: "ws", file: "site.tovu.zip", bytes: 1, sha256: "0".repeat(64), url: null,
    status: "active", createdAt: "2026-10-21T00:00:00.000Z", revokedAt: null };
}

const token = (): string => "a".repeat(64);

test("get rethrows a non-ENOENT failure reading the share's metadata", async t => {
  const directory = await tempDir(t);
  await mkdir(path.join(directory, `${SHARE_ID}.json`));
  await assert.rejects(new SiteShareRegistry({ directory }).get({ shareId: SHARE_ID }), { code: "EISDIR" });
});

test("get rethrows a non-ENOENT failure reading the revoked marker instead of reporting the share active", async t => {
  const directory = await tempDir(t);
  const registry = new SiteShareRegistry({ directory });
  await registry.put({ record: record(token()) });
  await mkdir(path.join(directory, `${SHARE_ID}.revoked`));
  await assert.rejects(registry.get({ shareId: SHARE_ID }), { code: "EISDIR" });
});

test("list rethrows when the registry path exists but is not a directory", async t => {
  const directory = await tempDir(t);
  const file = path.join(directory, "not-a-dir");
  await writeFile(file, "x");
  await assert.rejects(new SiteShareRegistry({ directory: file }).list({}), { code: "ENOTDIR" });
});

test("findToken rethrows a non-ENOENT failure reading the token index", async t => {
  const directory = await tempDir(t);
  await mkdir(path.join(directory, `${token()}.token`));
  await assert.rejects(new SiteShareRegistry({ directory }).findToken({ token: token(), file: "site.tovu.zip" }), { code: "EISDIR" });
});

test("reserveToken surfaces a registry directory that cannot be created", async t => {
  const directory = await tempDir(t);
  const file = path.join(directory, "occupied");
  await writeFile(file, "x");
  await assert.rejects(new SiteShareRegistry({ directory: path.join(file, "nested") }).reserveToken({ token: token(), shareId: SHARE_ID }),
    { code: "ENOTDIR" });
});

test("disable rethrows a non-EEXIST failure writing the revoked marker", async t => {
  const directory = await tempDir(t);
  const registry = new SiteShareRegistry({ directory });
  await registry.put({ record: record(token()) });
  await mkdir(path.join(directory, `${SHARE_ID}.revoked`, "child"), { recursive: true });
  await assert.rejects(registry.disable({ shareId: SHARE_ID, site: "ws" }), { code: "EISDIR" });
});

test("deleteArtifact rethrows a non-ENOENT failure and ignores a missing artifact", async t => {
  const directory = await tempDir(t);
  const registry = new SiteShareRegistry({ directory });
  await registry.deleteArtifact({ shareId: SHARE_ID });
  await mkdir(path.join(directory, `${SHARE_ID}.tovu.zip`));
  await assert.rejects(registry.deleteArtifact({ shareId: SHARE_ID }), { code: "EISDIR" });
});
