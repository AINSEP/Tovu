import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

/** Exercise the shipped ignore rules with Git itself, even in snapshots without .git. */
export function createGitIgnoreFixture({ repoRoot, context }: { repoRoot: string; context: TestContext }, _options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-ignore-rules-"));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(repoRoot, ".gitignore"), path.join(dir, ".gitignore"));
  const result = spawnSync("git", ["init", "-q", dir]);
  assert.equal(result.status, 0, "the isolated ignore-policy repository must initialize");
  return dir;
}
