import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

// Design 2026-10-27 (owner may flip): with no TOVU_SHARE_STORAGE_DIR the catalog lives in the private
// `ops/shares` beside the site's database, next to the journal and logs, which every backup, duplicate
// and publish walk already leaves out. It moves with the database, so it needs no site key of its own.
test("default share catalog is the private ops/shares beside the site's database", async t => {
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  delete process.env.TOVU_SHARE_STORAGE_DIR;
  for (const switcherCompatible of [true, false]) await t.test(switcherCompatible ? "switchable site" : "install-dir site", async t => {
    const sitesRoot = await mkdtemp(path.join(tmpdir(), "share-boot-default-"));
    t.after(() => rm(sitesRoot, { recursive: true, force: true }));
    const siteDir = path.join(sitesRoot, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
    const dbDir = path.join(siteDir, "data.nosync");
    await mkdir(themesDir, { recursive: true });
    await mkdir(uploadsDir, { recursive: true });
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
      assert.equal(deps.siteShareBackend.registry.directory, path.join(realpathSync(dbDir), "ops", "shares"));
      assert.equal(existsSync(path.join(sitesRoot, ".tovu", "site-shares")), false, "nothing under the sites root");
      assert.equal(existsSync(path.join(createSitesWorkspace({}).config({}).appData, "site-shares")), false, "nothing under app data");
    } finally { await close?.(); }
  });
});

// RED (Codex check 2026-10-27, HIGH; design 2026-10-27): every starter site seeds the same workspace id
// (`workspace-local`), and a Finder copy carries the source's `.site-meta.json` id. A catalog keyed by
// either merged two sites' catalogs (each could list, download and revoke the other's shares). Two
// databases are two sites, so the catalog beside each database never collides.
test("two sites with different databases but the same workspace id and copied meta id never see or revoke each other's shares", async t => {
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  delete process.env.TOVU_SHARE_STORAGE_DIR;
  const sitesRoot = await mkdtemp(path.join(tmpdir(), "share-boot-two-"));
  t.after(() => rm(sitesRoot, { recursive: true, force: true }));
  const shareIds = { a: "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5a", b: "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5b" };
  const booted: Record<string, Awaited<ReturnType<typeof createSiteRouteDeps>>> = {};
  for (const name of ["a", "b"] as const) {
    const siteDir = path.join(sitesRoot, `site-${name}`);
    await mkdir(path.join(siteDir, "themes"), { recursive: true });
    await mkdir(path.join(siteDir, "uploads"), { recursive: true });
    await writeFile(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "copied-meta-id" }));
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(siteDir, "data.nosync", "content.db"), {
      themesDir: path.join(siteDir, "themes"), uploadsDir: path.join(siteDir, "uploads"),
      siteBinding: { dir: siteDir, name: `site-${name}`, dirOverridden: true, switcherCompatible: true },
      onStoreOpened: store => { close = () => store.close(); },
    });
    t.after(() => close?.());
    await deps.identityReady;
    assert.equal(deps.workspaceId, "workspace-local");
    await deps.siteShareBackend!.registry.put({ record: { shareId: shareIds[name], token: name.toUpperCase().repeat(16), site: "workspace-local",
      file: `site-${name}.tovu.zip`, bytes: 1, sha256: "0".repeat(64), url: null, status: "active", createdAt: "2026-10-20T00:00:00.000Z", revokedAt: null } });
    booted[name] = deps;
  }
  for (const [mine, theirs] of [["a", "b"], ["b", "a"]] as const) {
    const backend = booted[mine].siteShareBackend!;
    assert.deepEqual((await backend.list({})).map(row => row.shareId), [shareIds[mine]], `site ${mine} lists only its own share`);
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
