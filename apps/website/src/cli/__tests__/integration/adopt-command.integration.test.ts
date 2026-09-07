import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import Database from "better-sqlite3";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

const require = createRequire(import.meta.url);

/**
 * @file `tovu adopt <dir>` — integration (process-spawn) tier.
 *
 * WHY THIS COMMAND EXISTS. A directory holding a real, working site but no `config.json` /
 * `.site-meta.json` had no supported route into `tovu serve`: `boot-site-dir.ts` calls
 * `readSiteDir` unconditionally and throws `SiteDirInvalidError` before `content.db` is ever
 * opened. `tovu init` is empty-folder-only, so it cannot take that directory either. The first
 * test below asserts BOTH halves of that gap directly (serve refuses, then adopt fixes it) rather
 * than only the happy path — a test that just asserted "adopt exits 0" would still pass against an
 * adopt that wrote markers `serve` does not actually accept.
 *
 * WHAT EACH ASSERTION IS WRITTEN TO CATCH (the "what would this still pass under?" pass):
 * - The schema-stamp test deliberately builds a fixture whose db is BEHIND this runtime (rows
 *   removed from `__drizzle_migrations`), so an implementation that stamps `runtimeSchemaVersion()`
 *   instead of the db's own applied identity FAILS. Against a freshly-`init`ed fixture the two are
 *   identical and such a test would be green against the exact bug it exists to prevent.
 * - Every refusal case also asserts nothing was written, not merely that some error was thrown.
 * - The idempotency test compares marker file BYTES across the re-run, not just the exit code: a
 *   re-run that rewrote `.site-meta.json` with a fresh `siteId`/`createdAt` would still exit 0.
 * - The byte-identity test hashes `content.db` around the adopt. It deliberately does NOT assert
 *   the absence of `content.db-wal`/`-shm`: SQLite MUST materialize those sidecars to open a
 *   WAL-mode database, even read-only, so adopt does create them when they are absent (verified
 *   directly, see the test's own comment). `content.db` itself is what must never change.
 *
 * Every fixture is a throwaway directory under `os.tmpdir()` — never `sites/tovu-com`, the real
 * marker-less site this command exists for (same fixture discipline as
 * `repair-site.integration.test.ts` and `init-command.integration.test.ts`).
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

/** See `serve-command.integration.test.ts`'s identical constant for why the loader is resolved to
 *  an absolute path rather than spawned as the bare specifier "tsx". */
const TSX_LOADER = require.resolve("tsx");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-adopt-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

const JOURNAL_PATH = path.resolve(import.meta.dirname, "../../../platform/db/drizzle/meta/_journal.json");

function runCli(args: string[], timeoutMs = 120000): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
    timeout: timeoutMs,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-adopt-"));
}

/**
 * A populated, WORKING site directory with NO marker files — exactly the shape `sites/tovu-com`
 * has. Built by running the real `tovu init` and then deleting the two markers, so the fixture is
 * a genuine install dir (uploads/, themes/, plugins/, overrides/, a migrated content.db) rather
 * than a hand-assembled approximation of one.
 */
function markerlessFixture(name = "Adopt Fixture"): { parent: string; dir: string } {
  const parent = mkTempParent();
  const dir = path.join(parent, "site");
  const init = runCli(["init", dir, "--name", name]);
  assert.equal(init.status, 0, `fixture setup: tovu init must succeed (stderr: ${init.stderr})`);
  fs.rmSync(path.join(dir, "config.json"));
  fs.rmSync(path.join(dir, ".site-meta.json"));
  return { parent, dir };
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** Every path under `dir`, relative and sorted — the shape a "reversible" claim has to compare. */
function listTree(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.replace(/\\/g, "/"))
    .sort();
}

/**
 * {@link listTree} minus `content.db-wal`/`content.db-shm`.
 *
 * SQLite MUST materialize both sidecars to open a WAL-mode database, and does so even on a
 * READ-ONLY connection — so any command that so much as reads `content.db` creates them when they
 * are absent, `--dry-run` included. Observed directly: the dry-run test below failed on nothing but
 * these two entries before this filter existed. They are therefore excluded from every "the tree is
 * unchanged" comparison, and the claims that actually matter are asserted SEPARATELY rather than
 * dropped: that the sidecars are the ONLY difference (so a stray file adopt wrote still fails the
 * comparison), and that the WAL carries zero committed frames (so a WRITE through that connection
 * still fails).
 */
function treeIgnoringSqliteSidecars(dir: string): string[] {
  return listTree(dir).filter((entry) => !entry.startsWith("content.db-"));
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function journalEntries(): JournalEntry[] {
  return (JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as { entries: JournalEntry[] }).entries;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine a free port")));
      }
    });
    srv.on("error", reject);
  });
}

/** See `serve-command.integration.test.ts`'s own `loadFactor` for why a flat deadline misreports
 *  on a contended machine. Same formula, same reason. */
function loadFactor(): number {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  return Math.min(Math.max(os.loadavg()[0] / Math.max(cores, 1), 1), 6);
}

async function waitForHttpReady(port: number, child: ChildProcessWithoutNullStreams, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs * loadFactor();
  let exited = false;
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`serve exited early (code ${exitCode}) before becoming ready`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(`timed out waiting for http://127.0.0.1:${port}/ (1-min load ${os.loadavg()[0].toFixed(2)})`);
}

test("the whole point: a marker-less but working site directory is REFUSED by serve, and tovu adopt is what makes it servable", async () => {
  const { parent, dir } = markerlessFixture("Adoptable Site");
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    // Half 1 — the defect this command exists for is real, at this exact fixture, right now.
    const before = runCli(["serve", dir, "--port", "1"], 60000);
    assert.equal(before.status, 3, `serve must refuse a marker-less dir (stderr: ${before.stderr})`);
    assert.match(before.stderr, /^tovu: SITE_DIR_INVALID:/m);

    // Half 2 — adopt, then the SAME directory actually boots and answers HTTP.
    const adopted = runCli(["adopt", dir]);
    assert.equal(adopted.status, 0, `adopt must succeed (stderr: ${adopted.stderr})`);
    assert.ok(fs.existsSync(path.join(dir, "config.json")), "adopt must write config.json");
    assert.ok(fs.existsSync(path.join(dir, ".site-meta.json")), "adopt must write .site-meta.json");

    const port = await getFreePort();
    child = spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", dir, "--port", String(port)], {
      env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
    }) as ChildProcessWithoutNullStreams;
    await waitForHttpReady(port, child);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200, "the adopted directory must actually serve its public site, not merely pass validation");
  } finally {
    if (child) {
      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        child.kill("SIGTERM");
      });
    }
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt DERIVES the schema stamp from the db's own applied migrations — a db behind this runtime is stamped with ITS index, never the runtime's latest", () => {
  const { parent, dir } = markerlessFixture();
  try {
    const entries = journalEntries();
    const target = entries[entries.length - 2];
    const newest = entries[entries.length - 1];
    assert.notEqual(target.idx, newest.idx, "fixture precondition: the journal needs at least two entries");

    // Rewind the db's RECORDED lineage to the second-newest bundled migration. An implementation
    // that stamps `runtimeSchemaVersion()` (the newest) instead of reading the db fails here.
    const sqlite = new Database(path.join(dir, "content.db"));
    sqlite.prepare("DELETE FROM __drizzle_migrations WHERE created_at >= ?").run(newest.when);
    sqlite.close();

    const result = runCli(["adopt", dir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
    assert.equal(meta.schemaVersion, target.idx, "schemaVersion must be the db's OWN latest applied migration index");
    assert.equal(meta.schemaTag, target.tag, "schemaTag must be the db's OWN latest applied migration tag");
    assert.notEqual(meta.schemaVersion, newest.idx, "stamping the runtime's newest index would disarm serve's schema guard");
    assert.match(result.stdout, new RegExp(`schemaVersion=${target.idx}\\b`), "stdout must report the derived schemaVersion an operator is trusting");
    assert.match(result.stdout, new RegExp(`schemaTag=${target.tag}\\b`), "stdout must report the derived schemaTag");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("--dry-run prints the exact stamp it would write and writes NOTHING", () => {
  const { parent, dir } = markerlessFixture("Dry Run Site");
  try {
    const treeBefore = treeIgnoringSqliteSidecars(dir);
    const result = runCli(["adopt", dir, "--dry-run"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /dry run/i, "an operator must be told nothing was written");
    assert.match(result.stdout, /config\.json/, "the dry run must name the files it would write");
    assert.match(result.stdout, /\.site-meta\.json/);
    assert.match(result.stdout, /schemaVersion=\d+/, "the dry run must show the DERIVED stamp, not a placeholder");
    assert.match(result.stdout, /schemaTag=\d{4}_/, "the dry run must show the derived schemaTag");
    assert.equal(fs.existsSync(path.join(dir, "config.json")), false, "--dry-run must not write config.json");
    assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "--dry-run must not write .site-meta.json");
    assert.deepEqual(treeIgnoringSqliteSidecars(dir), treeBefore, "--dry-run must leave the directory tree exactly as it found it");
    // The two claims the sidecar filter above would otherwise have quietly dropped, asserted
    // directly: nothing NEW appeared except those sidecars, and the read-only connection that
    // created them committed nothing through it.
    assert.deepEqual(
      listTree(dir).filter((entry) => !treeBefore.includes(entry)),
      ["content.db-shm", "content.db-wal"],
      "the ONLY entries --dry-run may add are SQLite's own read-only-open sidecars"
    );
    assert.equal(fs.statSync(path.join(dir, "content.db-wal")).size, 0, "--dry-run must leave zero committed frames in the WAL");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt is idempotent: a re-run is a no-op that exits 0 and leaves both markers BYTE-identical (never a rewrite with a fresh siteId)", () => {
  const { parent, dir } = markerlessFixture();
  try {
    assert.equal(runCli(["adopt", dir]).status, 0);
    const configBytes = fs.readFileSync(path.join(dir, "config.json"), "utf8");
    const metaBytes = fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8");

    const rerun = runCli(["adopt", dir]);
    assert.equal(rerun.status, 0, `a re-run must be a successful no-op, not an error (stderr: ${rerun.stderr})`);
    assert.match(rerun.stdout, /already adopted/i, "the re-run must say why it did nothing");
    assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), configBytes, "a re-run must not rewrite config.json");
    assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), metaBytes, "a re-run must not rewrite .site-meta.json (siteId/createdAt must survive)");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt is reversible: deleting the two markers returns the directory to exactly its prior state", () => {
  const { parent, dir } = markerlessFixture();
  try {
    const treeBefore = treeIgnoringSqliteSidecars(dir);
    const dbBefore = sha256(path.join(dir, "content.db"));

    assert.equal(runCli(["adopt", dir]).status, 0);
    fs.rmSync(path.join(dir, "config.json"));
    fs.rmSync(path.join(dir, ".site-meta.json"));

    assert.deepEqual(treeIgnoringSqliteSidecars(dir), treeBefore, "removing the markers must restore the exact prior tree");
    assert.equal(sha256(path.join(dir, "content.db")), dbBefore, "adopt must never modify content.db");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt leaves content.db byte-identical — markers are written BESIDE the database, never into it", () => {
  const { parent, dir } = markerlessFixture();
  try {
    const dbPath = path.join(dir, "content.db");
    const before = sha256(dbPath);

    assert.equal(runCli(["adopt", dir]).status, 0);

    assert.equal(sha256(dbPath), before, "content.db must be byte-identical across an adopt");
    // Deliberately NOT asserting the sidecars are absent: SQLite materializes `content.db-wal`
    // and `content.db-shm` to open a WAL-mode database even on a READ-ONLY connection, so adopt
    // does create them when they are missing. Verified directly. Neither carries site data (the
    // -wal is created empty), and the next read-write open deletes both on clean close.
    assert.equal(fs.existsSync(path.join(dir, "content.db-wal")) ? fs.statSync(path.join(dir, "content.db-wal")).size : 0, 0, "adopt must never leave committed frames in the WAL — it only ever opens the db read-only");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a PARTIALLY adopted directory is refused by name, and neither completed nor overwritten", () => {
  const { parent, dir } = markerlessFixture();
  try {
    assert.equal(runCli(["adopt", dir]).status, 0);
    const configBytes = fs.readFileSync(path.join(dir, "config.json"), "utf8");
    fs.rmSync(path.join(dir, ".site-meta.json"));

    const result = runCli(["adopt", dir]);
    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: SITE_DIR_INVALID:/m, "errors.spec.md §1: exactly one machine-parseable stderr line");
    assert.match(result.stderr, /partially adopted/, "the message must name the real problem, not a generic failure");
    assert.match(result.stderr, /config\.json is present/);
    assert.match(result.stderr, /\.site-meta\.json is missing/);
    assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "a refused adopt must not complete the partial marker set");
    assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), configBytes, "a refused adopt must not touch the surviving marker");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a directory with no content.db is refused, and any other .db files present are named as candidates rather than silently adopted", () => {
  const parent = mkTempParent();
  const dir = path.join(parent, "not-a-site");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "notes.txt"), "hello");
  fs.writeFileSync(path.join(dir, "legacy-content.db"), "");
  fs.writeFileSync(path.join(dir, "other.db"), "");
  try {
    const result = runCli(["adopt", dir]);
    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: SITE_DIR_INVALID: adopt: /m, "the refusal must be labelled with the verb the operator typed, not the internal function name");
    assert.match(result.stderr, /no content\.db/, "the message must name the file adopt actually requires");
    assert.match(result.stderr, /legacy-content\.db/, "a sibling .db must be named so the operator knows adopt saw it and refused to guess");
    assert.match(result.stderr, /other\.db/);
    assert.deepEqual(listTree(dir).sort(), ["legacy-content.db", "notes.txt", "other.db"], "a refused adopt writes nothing");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a content.db that has never been migrated is refused rather than stamped with an invented version", () => {
  const parent = mkTempParent();
  const dir = path.join(parent, "unmigrated");
  fs.mkdirSync(dir);
  const sqlite = new Database(path.join(dir, "content.db"));
  sqlite.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  sqlite.close();
  try {
    const result = runCli(["adopt", dir]);
    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: SITE_DIR_INVALID:/m);
    assert.match(result.stderr, /never had a migration applied/);
    assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
    assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("a DIVERGENT schema lineage is refused with SITE_NEWER_THAN_RUNTIME (exit 4), not silently stamped — the case a wrong stamp would turn into data loss", () => {
  const { parent, dir } = markerlessFixture();
  try {
    const sqlite = new Database(path.join(dir, "content.db"));
    sqlite.exec("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('fabricated-hash', 9999999999999)");
    sqlite.close();

    const result = runCli(["adopt", dir]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: SITE_NEWER_THAN_RUNTIME:/m);
    assert.match(result.stderr, /matches no entry in this runtime's bundled/);
    assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "a divergent lineage must never be stamped");
    assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt --name sets the display name config.json carries, and defaults to the directory basename without it", () => {
  const named = markerlessFixture();
  const defaulted = markerlessFixture();
  try {
    assert.equal(runCli(["adopt", named.dir, "--name", "Renamed Site"]).status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(named.dir, "config.json"), "utf8")).name, "Renamed Site");

    assert.equal(runCli(["adopt", defaulted.dir]).status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(defaulted.dir, "config.json"), "utf8")).name, path.basename(defaulted.dir));
  } finally {
    fs.rmSync(named.parent, { recursive: true, force: true });
    fs.rmSync(defaulted.parent, { recursive: true, force: true });
  }
});

test("adopt on a path that is not an existing directory is refused, never created", () => {
  const parent = mkTempParent();
  const missing = path.join(parent, "nope");
  try {
    const result = runCli(["adopt", missing]);
    assert.equal(result.status, 3, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^tovu: SITE_DIR_INVALID:/m);
    assert.equal(fs.existsSync(missing), false, "adopt must never create the directory it was pointed at (that is `tovu init`'s job)");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("adopt is a discoverable, registered command: it appears in --help and in the introspect manifest a programmatic caller reads", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0, `stderr: ${help.stderr}`);
  assert.match(help.stdout, /^\s*adopt /m, "adopt must be listed in the CLI's own usage output");

  const introspect = runCli(["introspect"]);
  assert.equal(introspect.status, 0, `stderr: ${introspect.stderr}`);
  const manifest = JSON.parse(introspect.stdout);
  const adopt = manifest.commands.find((c: { name: string }) => c.name === "adopt");
  assert.ok(adopt, "introspect must list adopt — this is the manifest Tovu-Runner and the MCP bridge read");
  assert.deepEqual(adopt.arguments, [{ name: "dir", required: true, description: "existing site directory to adopt" }]);
  const flags = adopt.options.map((o: { flags: string }) => o.flags);
  assert.ok(flags.some((f: string) => f.startsWith("--dry-run")), "the dry-run flag must be discoverable, not undocumented");
  assert.ok(flags.some((f: string) => f.startsWith("--name")));
});
