import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { isDeniedFsFileName } from "#src/features/fs-files/fs-files";
import { checkTreePath } from "#src/features/publish-content/file-tree-policy";
import { collectSiteBackupFiles } from "#src/features/site-backup/sources";
import { duplicateSite } from "../../duplicate-site.js";
import { ValidationError } from "../../errors.js";
import { initSite } from "../../init-site.js";
import { isPortableSiteEntry, STORAGE_SECRET_FILENAME } from "../../layout.js";
import { SITE_META_FILENAME } from "../../site-storage.js";

/**
 * @file R1f security: a Postgres site's sealed connection string (`.storage-secret.json`, O3) never
 * leaves its site folder through any path that copies or archives that folder:
 * duplicate-site (allowlist copy; a postgres source is refused, so no copy can share the secret),
 * the GitHub site backup, the agent file tools, a publish tree, and git/Docker. Static export and
 * publish-content bundles carry rendered routes / allowlisted tables only; the static export is
 * proven against a real postgres site in `create-site-route-deps.postgres.test.ts`.
 */

const SECRET_MARKER = "sealed-connection-string-canary";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");

async function siteWithSecret(t: TestContext, name: string): Promise<{ parent: string; dir: string }> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "storage-secret-exclusion-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const dir = path.join(parent, name);
  await initSite({ dir, name });
  fs.writeFileSync(path.join(dir, STORAGE_SECRET_FILENAME), JSON.stringify({ version: 1, sealed: { ciphertext: SECRET_MARKER } }), { mode: 0o600 });
  // A stray copy inside a portable folder, too: nothing may pick it up there either.
  fs.mkdirSync(path.join(dir, "themes", "stray"), { recursive: true });
  fs.writeFileSync(path.join(dir, "themes", "stray", STORAGE_SECRET_FILENAME), SECRET_MARKER);
  return { parent, dir };
}

/** Every file under `dir` whose name is the secret's or whose bytes carry the marker. */
function secretTraces(dir: string): string[] {
  const found: string[] = [];
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    if (!fs.statSync(full).isFile()) continue;
    if (path.basename(rel) === STORAGE_SECRET_FILENAME || fs.readFileSync(full).includes(SECRET_MARKER)) found.push(rel);
  }
  return found;
}

test("the secret file is not a portable site entry", () => {
  assert.equal(STORAGE_SECRET_FILENAME, ".storage-secret.json");
  assert.equal(isPortableSiteEntry(STORAGE_SECRET_FILENAME), false);
});

test("duplicateSite of a SQLite site never carries a .storage-secret.json from the source's root", async (t) => {
  const { parent, dir } = await siteWithSecret(t, "source-site");
  const target = path.join(parent, "copy-site");
  await duplicateSite({ sourceDir: dir, targetDir: target, name: "Copy Site" });
  assert.equal(fs.existsSync(path.join(target, STORAGE_SECRET_FILENAME)), false, "the root secret stays with the source");
  assert.equal(fs.existsSync(path.join(target, "themes", "stray")), true, "sanity: the portable folder was copied");
  assert.deepEqual(secretTraces(target), [], "not even the stray copy inside themes/ follows the duplicate");
});

test("duplicateSite of a postgres site is refused before anything is written (no copy shares the source's database secret)", async (t) => {
  const { parent, dir } = await siteWithSecret(t, "pg-source-site");
  const metaPath = path.join(dir, SITE_META_FILENAME);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, storage: { kind: "postgres", secretRef: "site" } }));
  const target = path.join(parent, "pg-copy-site");

  await assert.rejects(duplicateSite({ sourceDir: dir, targetDir: target, name: "Pg Copy" }), ValidationError);
  assert.equal(fs.existsSync(target), false, "nothing was created");
});

test("the site backup collects no .storage-secret.json from any scope", async (t) => {
  const { dir } = await siteWithSecret(t, "backup-site");
  const collected = await collectSiteBackupFiles({
    sources: {
      siteDir: dir,
      mediaUploadsDir: path.join(dir, "uploads"),
      themesDir: path.join(dir, "themes"),
      agentPluginsDir: path.join(dir, "agent-plugins"),
      skillsDir: path.join(dir, "skills"),
      tovuVersion: "test",
    },
    include: { database: true, media: true, themes: true, plugins: true, settings: true },
  });
  assert.ok(collected.files.some((f) => f.path === "settings/.site-meta.json"), "sanity: the settings scope ran");
  assert.deepEqual(
    collected.files.filter((f) => path.basename(f.path) === STORAGE_SECRET_FILENAME).map((f) => f.path),
    [],
    "no backup file is the sealed secret"
  );
});

test("agent file tools and publish trees deny the secret by name, at any depth", () => {
  assert.equal(isDeniedFsFileName(STORAGE_SECRET_FILENAME), true);
  assert.equal(isDeniedFsFileName(".Storage-Secret.json"), true, "case-folded like every other entry");
  assert.equal(isDeniedFsFileName(`.${STORAGE_SECRET_FILENAME}.123.abc.tmp`), true, "a crashed write's temp file too");
  assert.match(checkTreePath(STORAGE_SECRET_FILENAME) ?? "", /sealed database connection string/);
  assert.match(checkTreePath(`nested/dir/${STORAGE_SECRET_FILENAME}`) ?? "", /sealed database connection string/);
});

test("git ignores the secret in any site folder (sites/ is tracked and deployed from git)", () => {
  for (const rel of [
    `sites/any-site/${STORAGE_SECRET_FILENAME}`,
    `apps/website/sites/any-site/${STORAGE_SECRET_FILENAME}`,
    `sites/any-site/.${STORAGE_SECRET_FILENAME}.123.abc.tmp`,
  ]) {
    const result = spawnSync("git", ["check-ignore", "-q", "--no-index", rel], { cwd: REPO_ROOT });
    assert.equal(result.status, 0, `${rel} must be git-ignored`);
  }
  for (const file of [".dockerignore", "Dockerfile.dockerignore"]) {
    assert.match(fs.readFileSync(path.join(REPO_ROOT, file), "utf8"), /^\*\*\/\*\.storage-secret\.json\*$/m, `${file} excludes the secret`);
  }
});
