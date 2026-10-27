import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { createSiteRouteDeps } from "../deps.js";

// RED: mkdir/containment errors escaped composition and prevented the whole site booting.
test("bad private share storage logs and disables only sharing", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const siteDir = path.join(directory, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  // Outside the database folder (`directory` here), so this case still reaches mkdir, not the containment check.
  await mkdir(path.join(directory, "outside"));
  const notDirectory = path.join(directory, "outside", "file");
  await writeFile(notDirectory, "not a directory");
  for (const [index, invalid] of [notDirectory, path.join(themesDir, "public-shares")].entries()) {
    process.env.TOVU_SHARE_STORAGE_DIR = invalid;
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(directory, `content-${index}.db`), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
      onStoreOpened: store => { close = () => store.close(); },
    });
    try {
      await deps.identityReady;
      assert.ok(deps.siteBackupSources);
      assert.equal(deps.siteShareBackend, undefined);
      assert.ok(errors.at(-1)?.some(value => String(value).includes("[site-share]")));
    } finally { await close?.(); }
  }
});

// RED (Codex check 2026-10-26): with no TOVU_SHARE_STORAGE_DIR, shares defaulted to `ops/shares` beside
// the source database, so Export wrote into the site it reads. They now live beside the site under the
// sites root (the container volume, the desktop sites home), so they survive a redeploy; an install-dir
// boot has no sites root and keeps app data. An existing legacy catalog is adopted there once.
test("default share storage is the sites root's private folder, never the source site, and adopts the legacy catalog", async t => {
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  delete process.env.TOVU_SHARE_STORAGE_DIR;
  for (const switcherCompatible of [true, false]) await t.test(switcherCompatible ? "switchable site" : "install-dir site", async t => {
    const sitesRoot = await mkdtemp(path.join(tmpdir(), "share-boot-default-"));
    t.after(() => rm(sitesRoot, { recursive: true, force: true }));
    const siteDir = path.join(sitesRoot, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
    const dbDir = path.join(siteDir, "data.nosync"), legacy = path.join(dbDir, "ops", "shares");
    await mkdir(themesDir, { recursive: true });
    await mkdir(uploadsDir, { recursive: true });
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.json"), "legacy share");
    await writeFile(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "site-meta-id" }));
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(dbDir, "content.db"), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible },
      onStoreOpened: store => { close = () => store.close(); },
    });
    try {
      await deps.identityReady;
      assert.ok(deps.siteShareBackend, "sharing stays available");
      assert.equal(existsSync(legacy), false, "nothing is left or created under the source database's ops/shares");
      const root = switcherCompatible ? path.join(sitesRoot, ".tovu") : createSitesWorkspace({}).config({}).appData;
      const adopted = path.join(root, "site-shares", "site-meta-id", deps.workspaceId);
      assert.equal(await readFile(path.join(adopted, "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.json"), "utf8"), "legacy share");
      assert.equal(existsSync(path.join(siteDir, ".tovu")), false, "never inside the site's own folder");
    } finally { await close?.(); }
  });
});

// RED (Codex check 2026-10-27, HIGH): every starter site seeds the same workspace id (`workspace-local`),
// so a shares folder keyed only by it merged two sites' catalogs (each could list, download and revoke
// the other's shares) and the second site's legacy catalog was never adopted. Keyed by site identity too.
test("two sites with the same workspace id never see or revoke each other's shares, and both adopt their legacy catalog", async t => {
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  delete process.env.TOVU_SHARE_STORAGE_DIR;
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "share-boot-two-"));
  t.after(() => rm(sitesRoot, { recursive: true, force: true }));
  const shareIds = { a: "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5a", b: "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5b" };
  const booted: Record<string, Awaited<ReturnType<typeof createSiteRouteDeps>>> = {};
  for (const name of ["a", "b"] as const) {
    const siteDir = path.join(sitesRoot, `site-${name}`), legacy = path.join(siteDir, "data.nosync", "ops", "shares");
    await mkdir(path.join(siteDir, "themes"), { recursive: true });
    await mkdir(path.join(siteDir, "uploads"), { recursive: true });
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: `site-${name}-id` }));
    await writeFile(path.join(legacy, `${shareIds[name]}.json`), JSON.stringify({ shareId: shareIds[name], token: "A".repeat(16), site: "workspace-local",
      file: `site-${name}.tovu.zip`, bytes: 1, sha256: "0".repeat(64), url: null, status: "active", createdAt: "2026-10-20T00:00:00.000Z", revokedAt: null }));
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(siteDir, "data.nosync", "content.db"), {
      themesDir: path.join(siteDir, "themes"), uploadsDir: path.join(siteDir, "uploads"),
      siteBinding: { dir: siteDir, name: `site-${name}`, dirOverridden: true, switcherCompatible: true },
      onStoreOpened: store => { close = () => store.close(); },
    });
    t.after(() => close?.());
    await deps.identityReady;
    assert.equal(deps.workspaceId, "workspace-local");
    booted[name] = deps;
  }
  for (const [mine, theirs] of [["a", "b"], ["b", "a"]] as const) {
    const backend = booted[mine].siteShareBackend!;
    assert.deepEqual((await backend.list({})).map(row => row.shareId), [shareIds[mine]], `site ${mine} lists only its own adopted share`);
    await assert.rejects(backend.revoke({ shareId: shareIds[theirs] }), { code: "NOT_FOUND" });
  }
});

test("TOVU_SHARE_STORAGE_DIR inside the source site or its database folder disables only sharing", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-inside-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const siteDir = path.join(directory, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  const dbDir = path.join(directory, "app-db");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  for (const [index, inside] of [path.join(siteDir, "private-shares"), path.join(dbDir, "shares")].entries()) {
    process.env.TOVU_SHARE_STORAGE_DIR = inside;
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(dbDir, `content-${index}.db`), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
      onStoreOpened: store => { close = () => store.close(); },
    });
    try {
      await deps.identityReady;
      assert.equal(deps.siteShareBackend, undefined);
      assert.ok(errors.at(-1)?.some(value => String(value).includes("[site-share]")));
    } finally { await close?.(); }
  }
});
