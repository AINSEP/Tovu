/**
 * @file `SiteShareRegistry`'s file-store error contract: a missing file is an ordinary miss (`null`
 * / `[]`), but any OTHER filesystem failure is rethrown — never mistaken for "no share", which would
 * let a revoked or unreadable share look absent. Real files in a temp directory; a directory placed
 * where a file is expected yields a genuine EISDIR/ENOTDIR from the OS.
 */
import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { SHARE_TOKEN, SHARE_TOKEN_ALPHABET, SiteShareRegistry, adoptLegacyShareDirectory, newShareIdentity, type SiteShareRecord } from "../share-registry.js";

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

const token = (): string => "a".repeat(16);

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
  // unlink(2) on a directory: Linux answers EISDIR, macOS EPERM. Either is the non-ENOENT failure.
  await assert.rejects(registry.deleteArtifact({ shareId: SHARE_ID }), (error: NodeJS.ErrnoException) => ["EISDIR", "EPERM"].includes(error.code ?? ""));
});

// ---- token shape (owner 2026-10-25: 16 ASCII letters, no 64-hex compatibility) ----

test("a minted share token is 16 ASCII letters and two mints differ", () => {
  const tokens = Array.from({ length: 200 }, () => newShareIdentity({}).token);
  for (const minted of tokens) assert.match(minted, /^[A-Za-z]{16}$/);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(tokens.some(minted => /[A-Z]/.test(minted)) && tokens.some(minted => /[a-z]/.test(minted)), "both cases are drawn");
});

test("the token alphabet is exactly the 52 ASCII letters", () => {
  assert.match(SHARE_TOKEN_ALPHABET, /^[A-Za-z]{52}$/);
  assert.equal(new Set(SHARE_TOKEN_ALPHABET).size, 52);
});

test("the token shape accepts 16 letters and rejects 64-hex, 15/17 letters, a digit and a non-ASCII letter", () => {
  const letters = "Ab".repeat(8);
  assert.equal(SHARE_TOKEN.test(letters), true);
  for (const bad of ["0f".repeat(32), "a".repeat(64), letters.slice(1), letters + "c", letters.slice(1) + "7", letters.slice(1) + "\u00e9", letters.slice(1) + "\u212a", `${letters}\n`]) {
    assert.equal(SHARE_TOKEN.test(bad), false, JSON.stringify(bad));
  }
});

test("an old 64-hex token is never found, even with its token index and record still on disk", async t => {
  const directory = await tempDir(t);
  const old = "0f".repeat(32);
  await writeFile(path.join(directory, `${old}.token`), SHARE_ID);
  await writeFile(path.join(directory, `${SHARE_ID}.json`), JSON.stringify(record(old)));
  assert.equal(await new SiteShareRegistry({ directory }).findToken({ token: old, file: "site.tovu.zip" }), null);
  await assert.rejects(new SiteShareRegistry({ directory }).reserveToken({ token: old, shareId: SHARE_ID }), { code: "INVALID_INPUT" });
});

test("a token differing only in letter case never resolves, even where the disk folds case", async t => {
  // macOS volumes are case-insensitive: `abc….token` opens `AbC….token`. Simulate that fold on any OS by
  // writing the variant's index file; only the exact minted token may resolve.
  const directory = await tempDir(t);
  const minted = "AbCdEfGhIjKlMnOp", variant = minted.toLowerCase();
  const registry = new SiteShareRegistry({ directory });
  await registry.put({ record: record(minted) });
  await writeFile(path.join(directory, `${variant}.token`), SHARE_ID);
  assert.equal((await registry.findToken({ token: minted, file: "site.tovu.zip" }))?.shareId, SHARE_ID);
  assert.equal(await registry.findToken({ token: variant, file: "site.tovu.zip" }), null);
});

// Legacy adoption: shares made before 2026-10-27 lived under the source database's `ops/shares`.
test("a legacy share catalog moves to the private folder once, files intact", async t => {
  const directory = await tempDir(t);
  const from = path.join(directory, "site", "data.nosync", "ops", "shares"), to = path.join(directory, "app-data", "site-shares", "ws");
  await mkdir(from, { recursive: true });
  await writeFile(path.join(from, `${SHARE_ID}.json`), "{\"shareId\":1}");
  await writeFile(path.join(from, "site.tovu.zip"), "zip bytes");
  adoptLegacyShareDirectory({ from, to });
  assert.equal(existsSync(from), false);
  assert.equal(await readFile(path.join(to, `${SHARE_ID}.json`), "utf8"), "{\"shareId\":1}");
  assert.equal(await readFile(path.join(to, "site.tovu.zip"), "utf8"), "zip bytes");
});
// RED (green-1027): one unreadable legacy record made the rebind throw, so boot disabled sharing for the whole site.
test("an unreadable legacy record moves untouched and never blocks adopting the rest", async t => {
  const directory = await tempDir(t);
  const from = path.join(directory, "legacy"), to = path.join(directory, "current");
  await mkdir(from);
  await writeFile(path.join(from, `${SHARE_ID}.json`), "not json");
  await writeFile(path.join(from, "site.tovu.zip"), "zip bytes");
  adoptLegacyShareDirectory({ from, to });
  assert.equal(existsSync(from), false);
  assert.equal(await readFile(path.join(to, `${SHARE_ID}.json`), "utf8"), "not json");
  assert.equal(await readFile(path.join(to, "site.tovu.zip"), "utf8"), "zip bytes");
});
test("an existing private catalog is never overwritten by a legacy one", async t => {
  const directory = await tempDir(t);
  const from = path.join(directory, "legacy"), to = path.join(directory, "current");
  await mkdir(from);
  await mkdir(to);
  await writeFile(path.join(from, "old.json"), "old");
  await writeFile(path.join(to, "new.json"), "new");
  adoptLegacyShareDirectory({ from, to });
  assert.equal(await readFile(path.join(from, "old.json"), "utf8"), "old");
  assert.equal(existsSync(path.join(to, "old.json")), false);
  assert.equal(await readFile(path.join(to, "new.json"), "utf8"), "new");
});
// RED (Codex check 2026-10-27): across volumes the catalog was copied straight into `to`, so a copy
// cut short left a partial `to` and every later boot skipped adoption, losing the rest of the catalog.
test("a cross-volume adoption cut short mid-copy leaves no private folder, and the next boot adopts everything", async t => {
  const directory = await tempDir(t);
  const from = path.join(directory, "legacy"), to = path.join(directory, "current");
  await mkdir(from);
  await writeFile(path.join(from, `${SHARE_ID}.json`), "{}");
  await writeFile(path.join(from, "site.tovu.zip"), "zip bytes");
  const { renameSync, cpSync } = fs;
  const restore = (): void => { Object.assign(fs, { renameSync, cpSync }); syncBuiltinESMExports(); };
  t.after(restore);
  Object.assign(fs, {
    renameSync: (source: fs.PathLike, target: fs.PathLike) => {
      if (source === from) throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
      renameSync(source, target);
    },
    cpSync: (_source: string, target: string) => { fs.mkdirSync(target); fs.writeFileSync(path.join(target, "half-written.tmp"), "{"); throw new Error("copy interrupted"); },
  });
  syncBuiltinESMExports();
  assert.throws(() => adoptLegacyShareDirectory({ from, to }), /copy interrupted/);
  assert.equal(existsSync(to), false, "a partial copy is never left where adoption looks for a finished catalog");
  // Still across volumes next boot, now with a copy that completes.
  Object.assign(fs, { cpSync });
  syncBuiltinESMExports();
  adoptLegacyShareDirectory({ from, to });
  assert.equal(await readFile(path.join(to, "site.tovu.zip"), "utf8"), "zip bytes");
  assert.equal(existsSync(path.join(to, "half-written.tmp")), false, "the cut-short copy's leftovers are discarded");
  assert.equal(existsSync(from), false);
});
test("no legacy catalog leaves the private folder untouched", async t => {
  const directory = await tempDir(t);
  const to = path.join(directory, "current");
  adoptLegacyShareDirectory({ from: path.join(directory, "absent"), to });
  assert.equal(existsSync(to), false);
});
