import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import Database from "better-sqlite3";

import { SiteDirInvalidError } from "../../../platform/site-dir/index.js";
import { SiteRepairRefusedError } from "../../../platform/site-dir/repair-site.js";
import { resolveSiteDatabasePaths } from "../../../platform/site-dir/site-databases.js";
import { runAdoptCommand } from "../../commands/adopt.js";
import { runInitCommand } from "../../commands/init.js";

/**
 * @file `tovu adopt` — in-process unit tier. The integration tier spawns the CLI, so its coverage
 * lands in a child process; these tests drive `runAdoptCommand` directly against real throwaway
 * site directories (built by the real `runInitCommand`), asserting stdout and what is on disk.
 */

/** Capture string writes to stdout; Buffer frames (the test runner's own) pass through. */
function captureStdout(t: TestContext): string[] {
  const out: string[] = [];
  const writeThrough = process.stdout.write.bind(process.stdout) as (chunk: unknown) => boolean;
  t.mock.method(process.stdout, "write", (chunk: unknown) => (typeof chunk === "string" ? (out.push(chunk), true) : writeThrough(chunk)));
  return out;
}

function tempParent(t: TestContext): string {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-adopt-unit-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return parent;
}

/** A real `init`ed site with both markers removed — a working but marker-less directory. */
async function markerlessSite(t: TestContext, name = "Adopt Unit"): Promise<string> {
  const dir = path.join(tempParent(t), "site");
  const out = captureStdout(t);
  await runInitCommand({ dir, name });
  out.length = 0;
  fs.rmSync(path.join(dir, "config.json"));
  fs.rmSync(path.join(dir, ".site-meta.json"));
  return dir;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

test("adopt writes both markers for a marker-less site and reports the derived stamp", async (t) => {
  const dir = await markerlessSite(t);
  const out = captureStdout(t);
  await runAdoptCommand({ dir, name: "Adopted Name" });
  const config = readJson(path.join(dir, "config.json"));
  const meta = readJson(path.join(dir, ".site-meta.json"));
  assert.equal(config.name, "Adopted Name");
  const text = out.join("");
  assert.match(text, new RegExp(`^adopted site 'Adopted Name' at ${dir}\\n`));
  assert.ok(text.includes(`  .site-meta.json  schemaVersion=${String(meta.schemaVersion)} schemaTag=${String(meta.schemaTag)}\n`));
  assert.ok(text.includes(`  siteId=${String(meta.siteId)}\n`));
  assert.ok(text.includes(`the database at ${resolveSiteDatabasePaths({ dir }).contentDbPath} was not modified\n`));
  assert.ok(text.endsWith(`next: tovu serve ${dir}\n`));
});

test("adopt --dry-run previews the markers and writes nothing", async (t) => {
  const dir = await markerlessSite(t, "Preview Site");
  const out = captureStdout(t);
  await runAdoptCommand({ dir, dryRun: true });
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
  const text = out.join("");
  assert.ok(text.startsWith(`dry run — nothing was written\nwould adopt site '`));
  assert.match(text, /  \.site-meta\.json  schemaVersion=\d+ schemaTag=\S+\n/);
  assert.ok(text.endsWith(`run again without --dry-run to write these two files\n`));
  assert.equal(text.includes("siteId="), false, "the dry run never prints a siteId it would not write");
});

test("adopt on a fully adopted directory is an idempotent no-op", async (t) => {
  const dir = await markerlessSite(t);
  const out = captureStdout(t);
  await runAdoptCommand({ dir });
  const before = fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8");
  out.length = 0;
  await runAdoptCommand({ dir });
  assert.deepEqual(out, [`already adopted: ${dir} already has config.json and .site-meta.json — nothing to do\n`]);
  assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), before);
});

test("adopt refuses a partially adopted directory and writes nothing", async (t) => {
  const dir = await markerlessSite(t);
  const out = captureStdout(t);
  await runAdoptCommand({ dir });
  fs.rmSync(path.join(dir, ".site-meta.json"));
  out.length = 0;
  await assert.rejects(runAdoptCommand({ dir }), (err: unknown) => {
    assert.ok(err instanceof SiteDirInvalidError);
    assert.match(err.message, /partially adopted: config\.json is present but \.site-meta\.json is missing/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
  assert.deepEqual(out, []);
});

/** `config.json` kept, `.site-meta.json` replaced by the key-only shape `npm run dev` leaves. */
async function keyOnlySite(t: TestContext): Promise<string> {
  const dir = await markerlessSite(t, "Key Only");
  const out = captureStdout(t);
  await runAdoptCommand({ dir, name: "Key Only" });
  out.length = 0;
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteKeyId: "key-only-id" }));
  return dir;
}

test("adopt completes a key-only .site-meta.json in place and keeps config.json", async (t) => {
  const dir = await keyOnlySite(t);
  const configBefore = fs.readFileSync(path.join(dir, "config.json"), "utf8");
  const out = captureStdout(t);
  await runAdoptCommand({ dir, name: "Ignored Name" });
  const meta = readJson(path.join(dir, ".site-meta.json"));
  assert.equal(meta.siteId, "key-only-id");
  assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), configBefore, "--name never rewrites config.json");
  assert.deepEqual(out, [
    `adopted site 'Key Only' at ${dir} (completed its key-only .site-meta.json; config.json kept)\n`,
    `  config.json      name='Key Only'\n  .site-meta.json  schemaVersion=${String(meta.schemaVersion)} schemaTag=${String(meta.schemaTag)}\n`,
    `next: tovu serve ${dir}\n`,
  ]);
});

test("adopt --dry-run on a key-only meta previews the completion and leaves the file as it was", async (t) => {
  const dir = await keyOnlySite(t);
  const out = captureStdout(t);
  await runAdoptCommand({ dir, dryRun: true });
  assert.deepEqual(readJson(path.join(dir, ".site-meta.json")), { siteKeyId: "key-only-id" });
  assert.equal(out[0], `dry run — nothing was written\n`);
  assert.equal(out[1], `would complete the key-only .site-meta.json of site 'Key Only' at ${dir} (config.json kept)\n`);
  assert.match(out[2] ?? "", /^  config\.json      name='Key Only'\n  \.site-meta\.json  schemaVersion=\d+ schemaTag=\S+\n$/);
  assert.equal(out.length, 3);
});

test("a no-content.db refusal is relabelled adopt: and names the sibling .db files it declined to guess at", async (t) => {
  const dir = tempParent(t);
  fs.writeFileSync(path.join(dir, "zeta.db"), "");
  fs.writeFileSync(path.join(dir, "alpha.db"), "");
  fs.writeFileSync(path.join(dir, "notes.txt"), "");
  captureStdout(t);
  await assert.rejects(runAdoptCommand({ dir }), (err: unknown) => {
    assert.ok(err instanceof SiteRepairRefusedError);
    assert.equal(err.reason, "CONTENT_DB_MISSING");
    assert.match(err.message, /^adopt: /);
    assert.ok(err.message.endsWith(" — this directory does contain alpha.db, zeta.db, which adopt will not guess at: rename the right one to content.db and re-run."));
    return true;
  });
  assert.deepEqual(fs.readdirSync(dir).sort(), ["alpha.db", "notes.txt", "zeta.db"]);
});

test("a no-content.db refusal without sibling databases carries no candidate list (dry run too)", async (t) => {
  const dir = tempParent(t);
  captureStdout(t);
  await assert.rejects(runAdoptCommand({ dir, dryRun: true }), (err: unknown) => {
    assert.ok(err instanceof SiteRepairRefusedError);
    assert.equal(err.reason, "CONTENT_DB_MISSING");
    assert.match(err.message, /^adopt: /);
    assert.equal(err.message.includes("this directory does contain"), false);
    return true;
  });
});

test("a non-refusal error (an invalid --name) propagates unchanged", async (t) => {
  const dir = await markerlessSite(t);
  captureStdout(t);
  await assert.rejects(runAdoptCommand({ dir, name: "   " }), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ValidationError");
    assert.equal(err instanceof SiteRepairRefusedError, false);
    return true;
  });
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
});

test("any other refusal (a never-migrated content.db) is relabelled but never carries the candidate list", async (t) => {
  const dir = tempParent(t);
  const dbPath = resolveSiteDatabasePaths({ dir }).contentDbPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  new Database(dbPath).close();
  fs.writeFileSync(path.join(dir, "other.db"), "");
  captureStdout(t);
  await assert.rejects(runAdoptCommand({ dir }), (err: unknown) => {
    assert.ok(err instanceof SiteRepairRefusedError);
    assert.equal(err.reason, "CONTENT_DB_UNMIGRATED");
    assert.match(err.message, /^adopt: refusing — .* has never had a migration applied/);
    assert.equal(err.message.includes("other.db"), false, "only the no-content.db refusal lists sibling databases");
    return true;
  });
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
});
