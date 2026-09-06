import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";

/**
 * @file Subprocess-level proof for `repair-site.ts`'s own argv/exit-code contract — mirrors
 * `backfill-db-path.test.ts`'s `execFileSync` approach so the REAL entry point (not just the
 * `repairSite`/`planRepairSite` functions it wraps, already certified by
 * `repair-site.integration.test.ts`) is exercised exactly as an operator would invoke it.
 *
 * Every fixture is a throwaway directory under `os.tmpdir()` — never
 * `apps/website/sites/tovu-com/`.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function mkSiteDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-repair-site-script-"));
  const db = openContentDb(path.join(dir, "content.db"));
  db.$client.close();
  return dir;
}

function run(args: string[]): { status: number | null; output: string } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", path.join("development", "scripts", "repair-site.ts"), ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? null, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("repair-site.ts: exits non-zero and explains itself when --dir is missing", () => {
  const { status, output } = run([]);
  assert.notEqual(status, 0);
  assert.match(output, /--dir <site-dir> is required/);
});

test("repair-site.ts: dry run (no --apply) prints the plan and writes NOTHING", () => {
  const dir = mkSiteDir();

  const { status, output } = run(["--dir", dir]);

  assert.equal(status, 0);
  assert.match(output, /DRY RUN/);
  assert.match(output, /Nothing was written/);
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false, "a dry run must never write config.json");
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "a dry run must never write .site-meta.json");
});

test("repair-site.ts: --apply writes real, readable marker files", () => {
  const dir = mkSiteDir();

  const { status, output } = run(["--dir", dir, "--name", "Script Test Site", "--apply"]);

  assert.equal(status, 0, `expected exit 0, got output:\n${output}`);
  assert.match(output, /Repaired site at/);

  const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  assert.equal(config.name, "Script Test Site");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
  assert.equal(typeof meta.schemaVersion, "number");
  assert.equal(typeof meta.schemaTag, "string");
});

test("repair-site.ts: --apply refuses (exit 1) and writes nothing when a marker already exists", () => {
  const dir = mkSiteDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "already-there", domain: null, port: null }));

  const { status, output } = run(["--dir", dir, "--apply"]);

  assert.notEqual(status, 0);
  assert.match(output, /REFUSED \(MARKER_ALREADY_EXISTS\)/);
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "a refused repair must never write .site-meta.json");
});
