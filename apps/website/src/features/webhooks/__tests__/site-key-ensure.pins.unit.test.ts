import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fsNative, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { fingerprintSiteKeyHex } from "../keyring.env.js";
import { ensureSiteKey, ensureSiteKeyForBoot, ensureSiteKeyForSite, installSiteKey } from "../site-key-ensure.js";
import { LEGACY_SITE_KEY_FILENAME } from "../site-key-sources.js";

/**
 * @file Boundary pins for `site-key-ensure.ts` (security-sensitive: the one writer of a site key
 * file), written against the pre-refactor code so the refactor is provably behaviour-identical:
 * process defaults, the unsafe-id guard, `installSiteKey`'s env/meta branches, and every race
 * branch of the move-aside/atomic-create primitives. Races are produced by patching `node:fs`
 * (the same `t.mock.method` + `syncBuiltinESMExports` technique `site-key-ensure.unit.test.ts`
 * uses), only for the one path under test. Every key here is a random throwaway test value.
 */

let home: string;
let siteDir: string;

test.beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tovu-site-key-pins-home-"));
  siteDir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-pins-site-"));
});

test.afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(siteDir, { recursive: true, force: true });
});

const noKeyData = async (): Promise<boolean> => false;
const hasKeyData = async (): Promise<boolean> => true;

function validHex(): string {
  return randomBytes(32).toString("hex");
}

function bareEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TOVU_SITE_KEY;
  delete env.TOVU_RUNTIME_MODE;
  return env;
}

function keysDir(homeDir: string): string {
  return path.join(homeDir, ".tovu", "site-keys");
}

function perSitePath(homeDir: string, siteKeyId: string): string {
  return path.join(keysDir(homeDir), `${siteKeyId}.hex`);
}

function writePerSite(homeDir: string, siteKeyId: string, content: string): string {
  const file = perSitePath(homeDir, siteKeyId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, { mode: 0o600 });
  return file;
}

function writeLegacy(homeDir: string, hex: string): void {
  mkdirSync(path.join(homeDir, ".tovu"), { recursive: true });
  writeFileSync(path.join(homeDir, ".tovu", LEGACY_SITE_KEY_FILENAME), hex, { mode: 0o600 });
}

function writeMeta(dir: string, meta: Record<string, unknown>): void {
  writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));
}

function readMeta(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
}

function backupsIn(homeDir: string): string[] {
  return existsSync(keysDir(homeDir)) ? readdirSync(keysDir(homeDir)).filter((name) => name.includes(".wrong-")) : [];
}

function tmpFilesIn(homeDir: string): string[] {
  return existsSync(keysDir(homeDir)) ? readdirSync(keysDir(homeDir)).filter((name) => name.includes(".tmp-")) : [];
}

function codedError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

/** Sets (or deletes) process env vars for one test and restores them afterwards. */
function withProcessEnv(t: TestContext, vars: Record<string, string | undefined>): void {
  const previous = Object.fromEntries(Object.keys(vars).map((name) => [name, process.env[name]]));
  const apply = (values: Record<string, string | undefined>): void => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(vars);
  t.after(() => apply(previous));
}

type ReadFileSync = typeof fsNative.readFileSync;
type RenameSync = typeof fsNative.renameSync;
type LinkSync = typeof fsNative.linkSync;
type UnlinkSync = typeof fsNative.unlinkSync;

/** Patches one `node:fs` export for this test (ESM named bindings included) and restores it. */
function patchFs<Name extends "readFileSync" | "renameSync" | "linkSync" | "unlinkSync">(
  t: TestContext,
  name: Name,
  implementation: (...args: Parameters<(typeof fsNative)[Name]>) => ReturnType<(typeof fsNative)[Name]>
): void {
  const mocked = t.mock.method(fsNative, name, implementation);
  syncBuiltinESMExports();
  t.after(() => {
    mocked.mock.restore();
    syncBuiltinESMExports();
  });
}

/** Sets up "a per-site key the stamp does not name, with the stamped key in the legacy file". */
function wrongPerSiteWithStampedLegacy(): { rightHex: string; wrongHex: string; perSite: string } {
  const rightHex = validHex();
  const wrongHex = validHex();
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: fingerprintSiteKeyHex(rightHex) });
  const perSite = writePerSite(home, "site-1", wrongHex);
  writeLegacy(home, rightHex);
  return { rightHex, wrongHex, perSite };
}

// ---------------------------------------------------------------------------
// ensureSiteKey — defaults and the unsafe-id guard
// ---------------------------------------------------------------------------

test("pin: ensureSiteKey with no mode/env reads TOVU_RUNTIME_MODE from process.env (production → no-op)", async (t) => {
  withProcessEnv(t, { TOVU_RUNTIME_MODE: "production" });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", findSiteKeyDependentData: noKeyData });
  assert.deepEqual(result, { action: "production-noop" });
});

test("pin: ensureSiteKey with no env/mode/home uses process.env and homedir() (local mint)", async (t) => {
  withProcessEnv(t, { TOVU_RUNTIME_MODE: undefined, TOVU_SITE_KEY: undefined });
  const siteKeyId = `pin-${randomBytes(4).toString("hex")}`;
  const file = perSitePath(homedir(), siteKeyId);
  t.after(() => rmSync(file, { force: true }));
  const result = await ensureSiteKey({ siteDir, siteKeyId, findSiteKeyDependentData: noKeyData });
  assert.equal(result.action, "mint");
  assert.equal(result.perSiteFilePath, file);
  assert.equal(result.fingerprint, fingerprintSiteKeyHex(readFileSync(file, "utf8")));
});

test("pin: ensureSiteKey given an unsafe siteKeyId throws the per-site-candidate guard and writes nothing", async () => {
  await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "../escape", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData }), {
    name: "Error",
    message: "ensureSiteKey: siteKeySources did not return a per-site-file candidate for a given siteKeyId",
  });
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

// ---------------------------------------------------------------------------
// ensureSiteKey — exact results per outcome
// ---------------------------------------------------------------------------

test("pin: refuse returns exactly { action, perSiteFilePath }", async () => {
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData });
  assert.deepEqual(result, { action: "refuse", perSiteFilePath: perSitePath(home, "site-1") });
});

test("pin: an invalid per-site file wins over a valid env key and reports the per-site reason", async () => {
  writePerSite(home, "site-1", "abc");
  const env = { ...bareEnv(), TOVU_SITE_KEY: validHex() };
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home, findSiteKeyDependentData: noKeyData });
  assert.deepEqual(result, { action: "invalid", perSiteFilePath: perSitePath(home, "site-1"), reason: "odd-length" });
});

test("pin: per-site absent and a too-short legacy file → invalid with the legacy file's reason", async () => {
  writeLegacy(home, "abcd");
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.deepEqual(result, { action: "invalid", perSiteFilePath: perSitePath(home, "site-1"), reason: "too-short" });
});

test("pin: the data scan runs only when nothing is present, and at most once per call", async () => {
  let scans = 0;
  const counting = async (): Promise<boolean> => {
    scans += 1;
    return false;
  };
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: "stale-stamp" });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: counting });
  assert.equal(result.action, "mint");
  assert.equal(scans, 1, "mint re-uses the scan it was planned on when deciding to re-stamp");
  assert.equal(readMeta(siteDir).siteKeyFingerprint, result.fingerprint);
});

test("pin: a valid per-site file never triggers the data scan", async () => {
  const hex = validHex();
  writePerSite(home, "site-1", hex);
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: "other-stamp" });
  const failing = async (): Promise<boolean> => assert.fail("noop must not scan for key-dependent data");
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: failing });
  assert.deepEqual(result, { action: "mismatch", perSiteFilePath: perSitePath(home, "site-1"), fingerprint: fingerprintSiteKeyHex(hex) });
});

test("pin: adopting a key whose fingerprint matches the stamp never scans and keeps the stamp", async () => {
  const hex = validHex();
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: fingerprintSiteKeyHex(hex) });
  const failing = async (): Promise<boolean> => assert.fail("a matching stamp needs no data scan");
  const env = { ...bareEnv(), TOVU_SITE_KEY: hex };
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home, findSiteKeyDependentData: failing });
  assert.deepEqual(result, { action: "adopt", perSiteFilePath: perSitePath(home, "site-1"), fingerprint: fingerprintSiteKeyHex(hex) });
});

test("pin: the stamped key is adopted over an EARLIER valid source, trimmed of surrounding whitespace", async () => {
  const rightHex = validHex();
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: fingerprintSiteKeyHex(rightHex) });
  writeLegacy(home, `${rightHex}\n`);
  const env = { ...bareEnv(), TOVU_SITE_KEY: validHex() };
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home, findSiteKeyDependentData: hasKeyData });
  assert.equal(result.action, "adopt");
  assert.equal(readFileSync(perSitePath(home, "site-1"), "utf8"), rightHex);
});

test("pin: replacing an unstamped per-site file writes the stamped key and keeps the stamp unchanged", async () => {
  const { rightHex, wrongHex } = wrongPerSiteWithStampedLegacy();
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData });
  assert.deepEqual(result, { action: "adopt", perSiteFilePath: perSitePath(home, "site-1"), fingerprint: fingerprintSiteKeyHex(rightHex) });
  const [backup] = backupsIn(home);
  assert.ok(backup !== undefined);
  assert.match(backup, /^site-1\.hex\.wrong-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{4}$/);
  assert.equal(readFileSync(path.join(keysDir(home), backup), "utf8"), wrongHex);
});

// ---------------------------------------------------------------------------
// ensureSiteKey — race branches of the move-aside and atomic-create primitives
// ---------------------------------------------------------------------------

/** Lets the first `count` reads of `file` through, then runs `onRead` before every later one. */
function onLaterReads(t: TestContext, file: string, count: number, onRead: () => void): void {
  const realRead: ReadFileSync = fsNative.readFileSync;
  let seen = 0;
  patchFs(t, "readFileSync", (target, options) => {
    if (target === file && ++seen > count) onRead();
    return realRead(target, options);
  });
}

test("pin: the wrong per-site file vanishing before the move (another instance moved it) is not an error", async (t) => {
  const { rightHex, perSite } = wrongPerSiteWithStampedLegacy();
  let removed = false;
  onLaterReads(t, perSite, 1, () => {
    if (!removed) rmSync(perSite);
    removed = true;
  });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData });
  assert.equal(result.action, "adopt");
  assert.equal(readFileSync(perSite, "utf8"), rightHex);
  assert.deepEqual(backupsIn(home), []);
});

test("pin: a read failure other than ENOENT during the move propagates and moves nothing", async (t) => {
  const { wrongHex, perSite } = wrongPerSiteWithStampedLegacy();
  onLaterReads(t, perSite, 1, () => {
    throw codedError("EACCES");
  });
  await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData }), {
    message: "simulated EACCES",
    code: "EACCES",
  });
  t.mock.reset();
  syncBuiltinESMExports();
  assert.equal(readFileSync(perSite, "utf8"), wrongHex);
});

test("pin: a per-site file another instance already fixed is not moved aside; its key is read back", async (t) => {
  const { rightHex, perSite } = wrongPerSiteWithStampedLegacy();
  let fixed = false;
  onLaterReads(t, perSite, 1, () => {
    if (!fixed) writeFileSync(perSite, rightHex);
    fixed = true;
  });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData });
  assert.deepEqual(result, { action: "adopt", perSiteFilePath: perSite, fingerprint: fingerprintSiteKeyHex(rightHex) });
  assert.deepEqual(backupsIn(home), []);
});

test("pin: the wrong file vanishing during the rename (ENOENT) is not an error", async (t) => {
  const { rightHex, perSite } = wrongPerSiteWithStampedLegacy();
  const realRename: RenameSync = fsNative.renameSync;
  patchFs(t, "renameSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (from === perSite) rmSync(perSite);
    realRename(from, to);
  });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData });
  assert.equal(result.action, "adopt");
  assert.equal(readFileSync(perSite, "utf8"), rightHex);
  assert.deepEqual(backupsIn(home), []);
});

test("pin: a rename failure other than ENOENT propagates and leaves the wrong file in place", async (t) => {
  const { wrongHex, perSite } = wrongPerSiteWithStampedLegacy();
  const realRename: RenameSync = fsNative.renameSync;
  patchFs(t, "renameSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (from === perSite) throw codedError("EXDEV");
    realRename(from, to);
  });
  await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: hasKeyData }), {
    message: "simulated EXDEV",
  });
  assert.equal(readFileSync(perSite, "utf8"), wrongHex);
});

test("pin: a link failure other than EEXIST propagates and still removes the temp file", async (t) => {
  const realLink: LinkSync = fsNative.linkSync;
  const target = perSitePath(home, "site-1");
  patchFs(t, "linkSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (to === target) throw codedError("EPERM");
    realLink(from, to);
  });
  await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData }), {
    message: "simulated EPERM",
  });
  assert.equal(existsSync(target), false);
  assert.deepEqual(tmpFilesIn(home), []);
});

test("pin: a link failure with no code at all propagates (it is not mistaken for EEXIST)", async (t) => {
  const realLink: LinkSync = fsNative.linkSync;
  const target = perSitePath(home, "site-1");
  patchFs(t, "linkSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (to === target) throw new Error("link exploded");
    realLink(from, to);
  });
  await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData }), {
    message: "link exploded",
  });
});

test("pin: a thrown non-object or null from link propagates unchanged", async (t) => {
  const realLink: LinkSync = fsNative.linkSync;
  const target = perSitePath(home, "site-1");
  const thrown: unknown[] = ["EEXIST", null];
  patchFs(t, "linkSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (to === target) throw thrown.shift();
    realLink(from, to);
  });
  for (const expected of ["EEXIST", null]) {
    await assert.rejects(ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData }), (error: unknown) => {
      assert.equal(error, expected);
      return true;
    });
  }
});

test("pin: a temp-file cleanup failure after a successful link is swallowed", async (t) => {
  const realUnlink: UnlinkSync = fsNative.unlinkSync;
  patchFs(t, "unlinkSync", (target: fsNative.PathLike) => {
    realUnlink(target);
    if (String(target).includes(".tmp-")) throw codedError("ENOENT");
  });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.equal(result.action, "mint");
  assert.deepEqual(tmpFilesIn(home), []);
});

test("pin: losing the create race reads back the winner's key (adopt converges on the file on disk)", async (t) => {
  const winnerHex = validHex();
  const target = perSitePath(home, "site-1");
  const realLink: LinkSync = fsNative.linkSync;
  patchFs(t, "linkSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (to === target) writeFileSync(target, `${winnerHex}\n`, { flag: "wx" });
    realLink(from, to);
  });
  const env = { ...bareEnv(), TOVU_SITE_KEY: validHex() };
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home, findSiteKeyDependentData: noKeyData });
  assert.deepEqual(result, { action: "adopt", perSiteFilePath: target, fingerprint: fingerprintSiteKeyHex(winnerHex) });
  assert.deepEqual(tmpFilesIn(home), []);
});

test("pin: replacing an unstamped per-site file and then losing the create race to a different key reports 'mismatch'", async (t) => {
  const { perSite } = wrongPerSiteWithStampedLegacy();
  const winnerHex = validHex();
  const realLink: LinkSync = fsNative.linkSync;
  patchFs(t, "linkSync", (from: fsNative.PathLike, to: fsNative.PathLike) => {
    if (to === perSite) writeFileSync(perSite, winnerHex, { flag: "wx" });
    realLink(from, to);
  });
  const result = await ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.deepEqual(result, { action: "mismatch", perSiteFilePath: perSite, fingerprint: fingerprintSiteKeyHex(winnerHex) });
});

// ---------------------------------------------------------------------------
// ensureSiteKeyForSite / ensureSiteKeyForBoot
// ---------------------------------------------------------------------------

test("pin: ensureSiteKeyForSite with no mode/env reads process.env (production, no meta → undefined, nothing minted)", async (t) => {
  withProcessEnv(t, { TOVU_RUNTIME_MODE: "production" });
  assert.equal(await ensureSiteKeyForSite({ siteDir, findSiteKeyDependentData: noKeyData }), undefined);
  assert.equal(existsSync(path.join(siteDir, ".site-meta.json")), false);
});

test("pin: ensureSiteKeyForSite passes home through to ensureSiteKey", async () => {
  writeMeta(siteDir, { siteId: "site-1" });
  const result = await ensureSiteKeyForSite({ siteDir, mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.equal(result?.perSiteFilePath, perSitePath(home, "site-1"));
});

test("pin: ensureSiteKeyForSite on a missing siteDir propagates the meta-file write error", async () => {
  const missing = path.join(siteDir, "does-not-exist");
  await assert.rejects(ensureSiteKeyForSite({ siteDir: missing, mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData }), {
    code: "ENOENT",
    syscall: "open",
  });
});

test("pin: ensureSiteKeyForBoot logs the exact failure line once and returns undefined", async (t) => {
  const missing = path.join(siteDir, "does-not-exist");
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => {
    logged.push(line);
  });
  const result = await ensureSiteKeyForBoot({ siteDir: missing, mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.equal(result, undefined);
  assert.equal(logged.length, 1);
  assert.match(logged[0] ?? "", new RegExp(`^\\[site-key\\] could not ensure a site key at boot for ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: ENOENT: no such file or directory, open '`));
});

test("pin: ensureSiteKeyForBoot losing the meta-mint race reads back the winner's siteKeyId", async (t) => {
  const metaPath = path.join(siteDir, ".site-meta.json");
  const realWrite = fsNative.writeFileSync;
  const mocked = t.mock.method(fsNative, "writeFileSync", (file: fsNative.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fsNative.WriteFileOptions) => {
    if (file === metaPath && !existsSync(metaPath)) realWrite(metaPath, JSON.stringify({ siteKeyId: "winner-id" }));
    realWrite(file, data, options);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mocked.mock.restore();
    syncBuiltinESMExports();
  });
  const result = await ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home, findSiteKeyDependentData: noKeyData });
  assert.equal(result?.perSiteFilePath, perSitePath(home, "winner-id"));
  assert.deepEqual(readMeta(siteDir), { siteKeyId: "winner-id", siteKeyFingerprint: result?.fingerprint });
});

// ---------------------------------------------------------------------------
// installSiteKey
// ---------------------------------------------------------------------------

test("pin: installSiteKey (production) with the env var already holding hex → installed via env, stamp written", () => {
  const hex = validHex();
  writeMeta(siteDir, { siteId: "site-1", keep: 1 });
  const env = { ...bareEnv(), TOVU_SITE_KEY: hex };
  const result = installSiteKey({ siteDir, hex, mode: "production", env, home, cwd: siteDir });
  assert.deepEqual(result, { outcome: "installed", keyFilePath: "env:TOVU_SITE_KEY", fingerprint: fingerprintSiteKeyHex(hex) });
  assert.deepEqual(readMeta(siteDir), { siteId: "site-1", keep: 1, siteKeyFingerprint: fingerprintSiteKeyHex(hex) });
  assert.equal(existsSync(path.join(siteDir, "sites")), false);
});

test("pin: installSiteKey (production) with a malformed env var → env-key-set, nothing written", () => {
  writeMeta(siteDir, { siteId: "site-1" });
  const env = { ...bareEnv(), TOVU_SITE_KEY: "nothex" };
  assert.deepEqual(installSiteKey({ siteDir, hex: validHex(), mode: "production", env, home, cwd: siteDir }), { outcome: "env-key-set" });
  assert.deepEqual(readMeta(siteDir), { siteId: "site-1" });
});

test("pin: installSiteKey (production) with no meta file installs the volume file and creates no meta", () => {
  const hex = validHex();
  const result = installSiteKey({ siteDir, hex, mode: "production", env: bareEnv(), home, cwd: siteDir });
  assert.deepEqual(result, { outcome: "installed", keyFilePath: path.join(siteDir, "sites", ".tovu", "site-key.hex"), fingerprint: fingerprintSiteKeyHex(hex) });
  assert.equal(existsSync(path.join(siteDir, ".site-meta.json")), false);
});

test("pin: installSiteKey (local) with no meta file mints a key-only meta, installs under its new id and stamps it", () => {
  const hex = validHex();
  const result = installSiteKey({ siteDir, hex, mode: "local", env: bareEnv(), home });
  const meta = readMeta(siteDir);
  assert.deepEqual(Object.keys(meta), ["siteKeyId", "siteKeyFingerprint"]);
  assert.match(String(meta.siteKeyId), /^[0-9a-f-]{36}$/);
  assert.equal(meta.siteKeyFingerprint, fingerprintSiteKeyHex(hex));
  assert.deepEqual(result, { outcome: "installed", keyFilePath: perSitePath(home, String(meta.siteKeyId)), fingerprint: fingerprintSiteKeyHex(hex) });
  assert.equal(statSync(path.join(siteDir, ".site-meta.json")).mode & 0o777, 0o600);
});

test("pin: installSiteKey (local) with a corrupt meta file returns undefined and writes nothing", () => {
  writeFileSync(path.join(siteDir, ".site-meta.json"), "{not json");
  assert.equal(installSiteKey({ siteDir, hex: validHex(), mode: "local", env: bareEnv(), home }), undefined);
  assert.equal(readFileSync(path.join(siteDir, ".site-meta.json"), "utf8"), "{not json");
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

test("pin: installSiteKey with the stamp already naming hex does not rewrite .site-meta.json", () => {
  const hex = validHex();
  writeMeta(siteDir, { siteId: "site-1", siteKeyFingerprint: fingerprintSiteKeyHex(hex) });
  const before = statSync(path.join(siteDir, ".site-meta.json")).ino;
  installSiteKey({ siteDir, hex, mode: "local", env: bareEnv(), home });
  assert.equal(statSync(path.join(siteDir, ".site-meta.json")).ino, before);
});

test("pin: installSiteKey (local) over a malformed per-site file backs it up and installs", () => {
  const hex = validHex();
  writeMeta(siteDir, { siteId: "site-1" });
  writePerSite(home, "site-1", "garbage");
  installSiteKey({ siteDir, hex, mode: "local", env: bareEnv(), home });
  assert.equal(readFileSync(perSitePath(home, "site-1"), "utf8"), hex);
  const [backup] = backupsIn(home);
  assert.ok(backup !== undefined);
  assert.equal(readFileSync(path.join(keysDir(home), backup), "utf8"), "garbage");
});

test("pin: installSiteKey (local) ignores an env key — the per-site file outranks it", () => {
  const hex = validHex();
  writeMeta(siteDir, { siteId: "site-1" });
  const env = { ...bareEnv(), TOVU_SITE_KEY: validHex() };
  const result = installSiteKey({ siteDir, hex, mode: "local", env, home });
  assert.equal(result?.outcome, "installed");
});

test("pin: installSiteKey with no mode/env/home/cwd reads process.env (production env key differs → env-key-set)", (t) => {
  withProcessEnv(t, { TOVU_RUNTIME_MODE: "production", TOVU_SITE_KEY: validHex() });
  writeMeta(siteDir, { siteId: "site-1" });
  assert.deepEqual(installSiteKey({ siteDir, hex: validHex() }), { outcome: "env-key-set" });
});

test("pin: installSiteKey with no mode/env/home uses homedir() in local mode", (t) => {
  withProcessEnv(t, { TOVU_RUNTIME_MODE: undefined, TOVU_SITE_KEY: undefined });
  const siteKeyId = `pin-${randomBytes(4).toString("hex")}`;
  const file = perSitePath(homedir(), siteKeyId);
  t.after(() => rmSync(file, { force: true }));
  writeMeta(siteDir, { siteKeyId });
  const hex = validHex();
  assert.deepEqual(installSiteKey({ siteDir, hex }), { outcome: "installed", keyFilePath: file, fingerprint: fingerprintSiteKeyHex(hex) });
});
