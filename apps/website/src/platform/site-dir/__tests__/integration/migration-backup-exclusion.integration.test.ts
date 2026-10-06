import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { minimatch } from "minimatch";

import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { isDeniedFsFileName } from "#src/features/fs-files/fs-files";
import { checkTreePath } from "#src/features/publish-content/file-tree-policy";
import { collectSiteBackupFiles } from "#src/features/site-backup/sources";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { duplicateSite } from "../../duplicate-site.js";
import { initSite } from "../../init-site.js";
import { isPortableSiteEntry } from "../../layout.js";

/**
 * @file R1h: the migration runner's pre-change copy of a SQLite site (`<site>/ops/pre-migrations-<ISO>.db`,
 * about the size of content.db, with every row in it) never leaves its site folder: duplicate-site
 * (allowlist copy, `ops/` is not portable), the site backup, a static export, the agent file tools
 * and publish trees (`*.db` denied), git and Docker. Publish-content bundles and database transfers
 * read database rows only, never site files.
 */

const MARKER = "pre-migrations-copy-canary";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const COPY_NAME = `${MIGRATION_BACKUP_PREFIX}2026-09-29T01-41-01-628Z.db`;

async function siteWithMigrationCopy(t: TestContext, name: string): Promise<{ parent: string; dir: string }> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "migration-backup-exclusion-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const dir = path.join(parent, name);
  await initSite({ dir, name });
  fs.mkdirSync(path.join(dir, "ops"), { recursive: true });
  fs.writeFileSync(path.join(dir, "ops", COPY_NAME), MARKER);
  fs.writeFileSync(path.join(dir, "ops", `${COPY_NAME}-wal`), MARKER);
  return { parent, dir };
}

/** Every file under `dir` named like the copy or whose bytes carry the marker. */
function copyTraces(dir: string): string[] {
  const found: string[] = [];
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    if (!fs.statSync(full).isFile()) continue;
    if (path.basename(rel).startsWith(MIGRATION_BACKUP_PREFIX) || fs.readFileSync(full).includes(MARKER)) found.push(rel);
  }
  return found;
}

test("ops/ (where the copy lives) is not a portable site entry", () => {
  assert.equal(isPortableSiteEntry("ops"), false);
});

test("duplicateSite never carries the source's pre-migrations copy", async (t) => {
  const { parent, dir } = await siteWithMigrationCopy(t, "source-site");
  const target = path.join(parent, "copy-site");
  await duplicateSite({ sourceDir: dir, targetDir: target, name: "Copy Site" });
  assert.equal(fs.existsSync(path.join(target, "content.db")), true, "sanity: the duplicate has its own database");
  assert.deepEqual(copyTraces(target), []);
});

test("the site backup collects no pre-migrations copy from any scope", async (t) => {
  const { dir } = await siteWithMigrationCopy(t, "backup-site");
  const collected = await collectSiteBackupFiles({
    sources: {
      siteDir: dir,
      mediaUploadsDir: path.join(dir, "uploads"),
      themesDir: path.join(dir, "themes"),
      agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(dir, "agent-plugins") } }),
      skillsDir: path.join(dir, "skills"),
      tovuVersion: "test",
    },
    include: { database: true, media: true, themes: true, plugins: true, settings: true },
  });
  assert.ok(collected.files.some((f) => f.path === "settings/.site-meta.json"), "sanity: the settings scope ran");
  assert.deepEqual(
    collected.files.filter((f) => path.basename(f.path).startsWith(MIGRATION_BACKUP_PREFIX) || f.absPath.includes(`${path.sep}ops${path.sep}`)).map((f) => f.path),
    []
  );
});

test("a static export of the site writes no trace of the pre-migrations copy", async (t) => {
  const { parent, dir } = await siteWithMigrationCopy(t, "export-site");
  const outDir = path.join(parent, "out");
  const cli = path.resolve(import.meta.dirname, "../../../../cli/main.ts");
  const result = spawnSync(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), cli, "export", dir, "--out", outDir], {
    encoding: "utf8",
    timeout: 120000,
  });
  assert.equal(result.status, 0, `export stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(path.join(outDir, "index.html")), "sanity: the export wrote the home page");
  assert.deepEqual(copyTraces(outDir), []);
});

test("agent file tools and publish trees deny the copy and its sidecars by name", () => {
  for (const name of [COPY_NAME, `${COPY_NAME}-wal`, `${COPY_NAME}-shm`]) {
    assert.equal(isDeniedFsFileName(name), true, `${name} is denied to agent file tools`);
    assert.notEqual(checkTreePath(`ops/${name}`), null, `${name} is refused in a publish tree`);
  }
});

test("git and Docker ignore the copy in any site folder", () => {
  for (const rel of [
    `sites/any-site/ops/${COPY_NAME}`,
    `sites/any-site/ops/${COPY_NAME}-wal`,
    `apps/website/sites/any-site/ops/${COPY_NAME}`,
    `apps/website/sites/any-site/ops/${COPY_NAME}-shm`,
  ]) {
    const result = spawnSync("git", ["check-ignore", "-q", "--no-index", rel], { cwd: REPO_ROOT });
    assert.equal(result.status, 0, `${rel} must be git-ignored`);
  }
  for (const file of [".dockerignore", "Dockerfile.dockerignore"]) {
    const patterns = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const rel of [`ops/${COPY_NAME}`, `sites/any-site/ops/${COPY_NAME}`, `nested/site/ops/${COPY_NAME}-wal`, `nested/site/ops/${COPY_NAME}-shm`]) {
      assert.equal(dockerContextExcludes(patterns, rel), true, `${file} effectively excludes ${rel}`);
      assert.equal(dockerContextExcludes(`${patterns}\n!**/ops/pre-migrations-*.db*\n`, rel), false, "a later negation must re-include the copy");
    }
    assert.equal(dockerContextExcludes(patterns, "sites/any-site/ops/ordinary.json"), false);
  }
});

/** Evaluate the ordered Docker glob rules used here, including ancestor directories and negation. */
function dockerContextExcludes(source: string, relativePath: string): boolean {
  const segments = relativePath.split("/");
  const ancestors = segments.map((_segment, index) => segments.slice(0, index + 1).join("/"));
  let excluded = false;
  for (const line of source.split(/\r?\n/)) {
    const rule = line.trim();
    if (rule === "" || rule.startsWith("#") || rule === ".") continue;
    const negated = rule.startsWith("!");
    const pattern = (negated ? rule.slice(1) : rule).replace(/^\/+|\/+$/g, "");
    if (ancestors.some((candidate) => minimatch(candidate, pattern, { dot: true, nonegate: true }))) excluded = !negated;
  }
  return excluded;
}
