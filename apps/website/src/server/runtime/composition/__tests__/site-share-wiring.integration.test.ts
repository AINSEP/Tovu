import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { createSiteRouteDeps, createSiteRouteDepsForWorkspace, defaultContentDbPath } from "../deps.js";

// RED: mkdir/containment errors escaped composition and prevented the whole site booting.
test("bad private share storage logs and disables only sharing", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const siteDir = path.join(directory, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  // `ops/shares` is a file (mkdir fails), or the database folder sits inside a served content folder.
  const blockedDbDir = path.join(directory, "blocked");
  await mkdir(path.join(blockedDbDir, "ops"), { recursive: true });
  await writeFile(path.join(blockedDbDir, "ops", "shares"), "not a directory");
  for (const dbDir of [blockedDbDir, path.join(themesDir, "public-db")]) {
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(dbDir, "content.db"), {
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

// RED (design 2026-10-27 I-A): the database folder is the site's identity: chat.db, the journal and
// ops/shares sit beside content.db, so two databases in one folder (`/db/a.db`, `/db/b.db`, the legacy
// env override) would share all three. Boot refuses that placement before opening anything.
test("boot refuses a content database not named content.db and names the fix", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-name-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.TOVU_CONTENT_DB;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_CONTENT_DB; else process.env.TOVU_CONTENT_DB = previous; });
  process.env.TOVU_CONTENT_DB = path.join(directory, "a.db");
  const namesFix = /own folder, named content\.db/;
  assert.throws(() => defaultContentDbPath(), namesFix);
  await assert.rejects(createSiteRouteDeps(), namesFix);
  await assert.rejects(createSiteRouteDeps(path.join(directory, "b.db")), namesFix);
  assert.deepEqual(await readdir(directory), [], "nothing is created or opened");
});

// RED (Codex batch6): better-sqlite3 opens with URI interpretation off, so `file:a.db?mode=memory` and
// `file:b.db?mode=memory` are two real disk files, yet both were exempted as in-memory and so shared
// <site>/ops/shares. Only the driver's own in-memory names (`:memory:`, "") skip the content.db rule.
test("boot refuses SQLite URI paths, which the driver opens as plain files", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-uri-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousCwd = process.cwd(), previous = process.env.TOVU_CONTENT_DB;
  t.after(() => {
    process.chdir(previousCwd);
    if (previous === undefined) delete process.env.TOVU_CONTENT_DB; else process.env.TOVU_CONTENT_DB = previous;
  });
  // Relative URIs resolve against the cwd: keep anything a regression creates inside the temp folder.
  process.chdir(directory);
  const namesFix = /own folder, named content\.db/;
  for (const uri of ["file:a.db?mode=memory", "file:b.db?mode=memory"]) {
    process.env.TOVU_CONTENT_DB = uri;
    assert.throws(() => defaultContentDbPath(), namesFix, uri);
    await assert.rejects(createSiteRouteDeps(uri), namesFix, uri);
  }
  assert.deepEqual(await readdir(directory), [], "nothing is created or opened");
});

// RED (Codex batch6): with a workspace override, the factory opened, migrated and seeded an explicit
// `/db/a.db` before `createSiteRouteDeps` refused it. The refusal now comes first and leaves no files.
test("the workspace-override factory refuses a database not named content.db before opening it", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-ws-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    createSiteRouteDepsForWorkspace({ workspaceIdOverride: "workspace-local" }, { dbPath: path.join(directory, "a.db") }),
    /own folder, named content\.db/,
  );
  assert.deepEqual(await readdir(directory), [], "nothing is created or opened");
});

// A symlinked folder cannot split a site: the same content.db reached through a link is the same
// physical folder, so it gets the same catalog.
test("content.db reached through a symlinked folder keeps the same share catalog", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-link-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const siteDir = path.join(directory, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await symlink(siteDir, path.join(directory, "link"));
  const directories: string[] = [];
  for (const dir of [siteDir, path.join(directory, "link")]) {
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
      onStoreOpened: store => { close = () => store.close(); },
    });
    try {
      await deps.identityReady;
      directories.push(deps.siteShareBackend!.registry.directory);
    } finally { await close?.(); }
  }
  assert.deepEqual(directories, Array(2).fill(path.join(realpathSync(siteDir), "ops", "shares")));
});

// Design 2026-10-27: the catalog lives in the private
// `ops/shares` beside the site's database, next to the journal and logs, which every backup, duplicate
// and publish walk already leaves out. It moves with the database, so it needs no site key of its own.
test("default share catalog is the private ops/shares beside the site's database", async t => {
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
