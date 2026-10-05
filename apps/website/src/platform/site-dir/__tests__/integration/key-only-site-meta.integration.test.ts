import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureSiteKeyForBoot } from "#src/features/webhooks/site-key-ensure";
import { openContentDb } from "../../../db/sqlite/content-db.js";
import { workspaces } from "../../../db/schema.sqlite.js";
import { bootSiteDir, closeSiteDirBoot } from "../../boot-site-dir.js";
import { SiteDirInvalidError } from "../../errors.js";
import { completeKeyOnlySiteMeta, parseKeyOnlySiteMeta } from "../../key-only-site-meta.js";
import { readAppliedSchemaIdentityOfFile } from "../../read-applied-schema-identity.js";
import { readSiteDir } from "../../read-site-dir.js";
import { classifySiteMarkers, planRepairSite, repairSite, SiteRepairRefusedError } from "../../repair-site.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";
import { findSiteKeyDependentData } from "../../site-key-dependent-data.js";

/**
 * @file 2026-10-05 — a site whose `.site-meta.json` holds only the site-key fields (what `npm run
 * dev` writes) must boot through the folder path (`bootSiteDir`: `tovu serve`, `tovu export`, the
 * desktop) and be adoptable, with `siteKeyId`/`siteKeyFingerprint` kept byte-identical — the key
 * file is found by `siteKeyId`. A genuinely malformed meta must still be refused.
 */

const SITE_KEY_ID = "ff81dabf-4800-4b46-8ec7-5939fc82f52e";
const FINGERPRINT = "03b2912a352b";
/** The exact bytes the owner's dev site carried (desktop-diag `site-meta.original.json`). */
const KEY_ONLY_TEXT = `{\n  "siteKeyId": "${SITE_KEY_ID}",\n  "siteKeyFingerprint": "${FINGERPRINT}"\n}`;

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-key-only-meta-"));
}

/** A dev-shaped site: `config.json`, a migrated `content.db` with one workspace, and `metaText`. */
function buildDevSite(opts: { metaText?: string; config?: boolean; db?: boolean } = {}): string {
  const dir = mkTempDir();
  if (opts.config !== false) {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Dev Site", domain: null, port: null }));
  }
  if (opts.db !== false) {
    const db = openContentDb(path.join(dir, "content.db"));
    db.insert(workspaces).values({ id: "ws-dev", name: "Dev", slug: "dev", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    db.$client.close();
  }
  fs.writeFileSync(path.join(dir, ".site-meta.json"), opts.metaText ?? KEY_ONLY_TEXT);
  return dir;
}

function readMeta(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
}

test("bootSiteDir: a key-only .site-meta.json is completed in place and the site boots", async () => {
  const dir = buildDevSite();
  try {
    const boot = await bootSiteDir({ dir });
    try {
      assert.equal(boot.workspaceId, "ws-dev");
    } finally {
      await closeSiteDirBoot(boot);
    }

    const meta = readMeta(dir);
    assert.equal(meta.siteKeyId, SITE_KEY_ID);
    assert.equal(meta.siteKeyFingerprint, FINGERPRINT);
    assert.equal(meta.siteId, SITE_KEY_ID);
    assert.equal(meta.templateId, "unknown");
    assert.equal(meta.templateVersion, "0.0.0");
    const identity = await readAppliedSchemaIdentityOfFile(path.join(dir, "content.db"));
    assert.notEqual(typeof identity, "string");
    assert.deepEqual({ v: meta.schemaVersion, t: meta.schemaTag }, { v: (identity as { idx: number }).idx, t: (identity as { tag: string }).tag });
    assert.equal(meta.createdAt, fs.statSync(dir).birthtime.toISOString());
    assert.doesNotThrow(() => readSiteDir({ dir }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("completeKeyOnlySiteMeta: the completed file keeps siteKeyId/siteKeyFingerprint byte-identical", async () => {
  const dir = buildDevSite();
  try {
    await completeKeyOnlySiteMeta({ dir });
    const text = fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8");
    assert.ok(text.includes(`"siteKeyId": "${SITE_KEY_ID}"`), text);
    assert.ok(text.includes(`"siteKeyFingerprint": "${FINGERPRINT}"`), text);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("completeKeyOnlySiteMeta: two concurrent completions converge on identical bytes", async () => {
  const dir = buildDevSite();
  try {
    const [first, second] = await Promise.all([completeKeyOnlySiteMeta({ dir }), completeKeyOnlySiteMeta({ dir })]);
    const onDisk = readMeta(dir);
    for (const written of [first, second].filter((meta) => meta !== undefined)) {
      assert.deepEqual(written, onDisk);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("completeKeyOnlySiteMeta: a full meta is left untouched", async () => {
  const runtime = runtimeSchemaVersion();
  const full = JSON.stringify({ siteId: "s", templateId: "starter", templateVersion: "1.0.0", schemaVersion: runtime.index, schemaTag: runtime.tag, createdAt: "2026-01-01T00:00:00.000Z", siteKeyId: SITE_KEY_ID });
  const dir = buildDevSite({ metaText: full });
  try {
    assert.equal(await completeKeyOnlySiteMeta({ dir }), undefined);
    assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), full);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bootSiteDir: a genuinely malformed meta (siteId: 5) is still refused and left untouched", async () => {
  const malformed = JSON.stringify({ siteKeyId: SITE_KEY_ID, siteId: 5 });
  const dir = buildDevSite({ metaText: malformed });
  try {
    await assert.rejects(() => bootSiteDir({ dir }), (err: unknown) => {
      assert.ok(err instanceof SiteDirInvalidError);
      assert.equal(err.message, ".site-meta.json.siteId must be a non-empty string");
      return true;
    });
    assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), malformed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseKeyOnlySiteMeta: only the key-only shape is recognised", () => {
  assert.deepEqual(parseKeyOnlySiteMeta({ siteKeyId: "k" }), { siteKeyId: "k" });
  assert.deepEqual(parseKeyOnlySiteMeta({ siteKeyId: "k", siteKeyFingerprint: "f", storage: { kind: "pglite" } }), { siteKeyId: "k", siteKeyFingerprint: "f", storage: { kind: "pglite" } });
  assert.equal(parseKeyOnlySiteMeta({ siteKeyId: "k", siteId: 5 }), undefined);
  assert.equal(parseKeyOnlySiteMeta({ siteKeyId: "" }), undefined);
  assert.equal(parseKeyOnlySiteMeta({ siteKeyId: 5 }), undefined);
  assert.equal(parseKeyOnlySiteMeta({ siteKeyId: "k", siteKeyFingerprint: 1 }), undefined);
  assert.equal(parseKeyOnlySiteMeta({}), undefined);
  assert.equal(parseKeyOnlySiteMeta([]), undefined);
  assert.equal(parseKeyOnlySiteMeta(null), undefined);
});

test("bootSiteDir: a key-only meta with no content.db is refused with the reason, file untouched", async () => {
  const dir = buildDevSite({ db: false });
  try {
    await assert.rejects(() => bootSiteDir({ dir }), (err: unknown) => {
      assert.ok(err instanceof SiteDirInvalidError);
      assert.equal(
        err.message,
        `.site-meta.json at ${dir} holds only site-key fields and cannot be completed: no content.db at ${path.join(dir, "content.db")} to derive its schema stamp from`
      );
      return true;
    });
    assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), KEY_ONLY_TEXT);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bootSiteDir: a key-only meta naming PGlite storage is completed with this runtime's stamp and storage kept", async () => {
  const dir = buildDevSite({ metaText: JSON.stringify({ siteKeyId: SITE_KEY_ID, storage: { kind: "pglite" } }), db: false });
  try {
    const completed = await completeKeyOnlySiteMeta({ dir });
    const runtime = runtimeSchemaVersion();
    assert.equal(completed?.schemaVersion, runtime.index);
    assert.equal(completed?.schemaTag, runtime.tag);
    assert.deepEqual(readMeta(dir).storage, { kind: "pglite" });
    assert.equal(readMeta(dir).siteKeyFingerprint, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("repairSite: a dir whose only marker is a key-only meta is adopted, carrying the key fields forward", async () => {
  const dir = buildDevSite({ config: false });
  try {
    assert.equal(classifySiteMarkers(dir).state, "none");
    const result = await repairSite({ dir, name: "Adopted" });
    assert.equal(result.siteId, SITE_KEY_ID);
    const meta = readMeta(dir);
    assert.equal(meta.siteKeyId, SITE_KEY_ID);
    assert.equal(meta.siteKeyFingerprint, FINGERPRINT);
    assert.equal(readSiteDir({ dir }).config.name, "Adopted");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("classifySiteMarkers: config.json + key-only meta is partial with keyOnlyMeta set; repair still refuses to overwrite config.json", async () => {
  const dir = buildDevSite();
  try {
    const markers = classifySiteMarkers(dir);
    assert.deepEqual(markers, { state: "partial", present: ["config.json"], missing: [".site-meta.json"], keyOnlyMeta: true });
    await assert.rejects(() => planRepairSite({ dir }), (err: unknown) => err instanceof SiteRepairRefusedError && err.reason === "MARKER_ALREADY_EXISTS");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A dev-shaped site with NO `.site-meta.json` — what the dev boot finds before it ever minted one. */
function buildMetalessDevSite(opts: { db?: boolean } = {}): string {
  const dir = buildDevSite({ db: opts.db });
  fs.rmSync(path.join(dir, ".site-meta.json"));
  return dir;
}

test("ensureSiteKeyForBoot: a dev site with a migrated content.db and no meta is minted a COMPLETE meta that readSiteDir and bootSiteDir accept", async () => {
  const dir = buildMetalessDevSite();
  const home = mkTempDir();
  try {
    const result = await ensureSiteKeyForBoot({ siteDir: dir, mode: "local", env: {}, home, findSiteKeyDependentData });
    assert.equal(result?.action, "mint");

    const { meta } = readSiteDir({ dir });
    assert.equal(meta.siteId, meta.siteKeyId);
    assert.ok(fs.existsSync(path.join(home, ".tovu", "site-keys", `${meta.siteKeyId}.hex`)), "the key file is named by the minted siteKeyId");
    const boot = await bootSiteDir({ dir });
    await closeSiteDirBoot(boot);
    assert.equal(readMeta(dir).siteKeyId, meta.siteKeyId, "booting kept the minted siteKeyId");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("ensureSiteKeyForBoot: with no content.db yet it mints the key-only shape (so this boot still gets a key), which completes once the db exists", async () => {
  const dir = buildMetalessDevSite({ db: false });
  const home = mkTempDir();
  try {
    await ensureSiteKeyForBoot({ siteDir: dir, mode: "local", env: {}, home, findSiteKeyDependentData });
    const keyOnly = readMeta(dir);
    assert.deepEqual(Object.keys(keyOnly), ["siteKeyId", "siteKeyFingerprint"], "key-only: the minted id plus the fingerprint ensureSiteKey stamps");

    const db = openContentDb(path.join(dir, "content.db"));
    db.insert(workspaces).values({ id: "ws-dev", name: "Dev", slug: "dev", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    db.$client.close();
    await completeKeyOnlySiteMeta({ dir });
    assert.equal(readSiteDir({ dir }).meta.siteKeyId, keyOnly.siteKeyId);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
