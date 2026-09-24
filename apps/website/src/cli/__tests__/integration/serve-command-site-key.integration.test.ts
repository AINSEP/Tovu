import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";
import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

const require = createRequire(import.meta.url);

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A3a — the boot
 * path's own integration coverage: `tovu serve` must actually call `ensureSiteKeyForBoot` (wired in
 * `cli/commands/serve.ts`), not just have the function exist and pass its unit tests in isolation.
 *
 * Two cases, matching the plan's own A3a acceptance text verbatim:
 * 1. A fresh site, no key anywhere → the per-site file is minted during boot.
 * 2. A site with sealed key-dependent data and no key anywhere → boot still succeeds (this must
 *    never block boot — `ensureSiteKey`'s own `"refuse"` action semantics), but no file is created.
 *
 * Scoped to a filesystem assertion (the per-site file's presence/absence under a temp `HOME`), not
 * an authenticated HTTP round trip against the admin Site Token route — that route needs a
 * login/cookie flow this suite has no existing pattern for, and A3b's own route tests will cover
 * that surface directly. See the A3a handoff (`ADS-memory/.local-artifacts/handoffs/
 * 2026-09-24-site-key-A3.md`) for the reasoning this file was modeled from.
 *
 * `HOME` is explicitly overridden to a fresh temp directory per test, and
 * `TOVU_INTEGRATIONS_ROOT_KEY`/`TOVU_SITE_KEY` are explicitly blanked in the child's env — never
 * relying on merely inheriting `process.env` (via `childProcessCoverageEnv`, which copies the FULL
 * parent env): the owner's shell may already export a real root key. Blank string is this
 * codebase's own established "treat as absent" convention (`development/scripts/start.mjs`'s
 * `clearBlankRootKeyEnv`).
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-serve-site-key-worker-coverage-"));

function mkTempParent(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

/** See `serve-command.integration.test.ts`'s identical helper for the full "why" — a shared, load-
 *  scaled deadline so a busy CI/dev machine does not turn a healthy boot into a false failure. */
function loadFactor(): number {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return Math.min(Math.max(ratio, 1), 6);
}

function runCliSync(args: string[], env: NodeJS.ProcessEnv = {}, timeoutMs = Math.round(30_000 * loadFactor())): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], { encoding: "utf8", env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env }, timeout: timeoutMs });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function spawnServe(args: string[], env: NodeJS.ProcessEnv = {}): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, "serve", ...args], { env: { ...childProcessCoverageEnv(WORKER_COVERAGE_DIR), ...env } }) as ChildProcessWithoutNullStreams;
}

const FETCH_POLL_TIMEOUT_MS = 2000;

async function waitForHttpReady(port: number, child: ChildProcessWithoutNullStreams, timeoutMs = 20000): Promise<void> {
  const factor = loadFactor();
  const deadline = Date.now() + timeoutMs * factor;
  let exited = false;
  let exitCode: number | null = null;
  let stderrBuf = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`server process exited early (code ${exitCode}) before becoming ready; stderr:\n${stderrBuf}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(FETCH_POLL_TIMEOUT_MS) });
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(
    `timed out waiting for http://127.0.0.1:${port}/ to respond after ${Math.round((timeoutMs * factor) / 1000)}s; stderr so far:\n${stderrBuf}`
  );
}

async function stopGracefully(child: ChildProcessWithoutNullStreams, timeoutMs = 10000): Promise<number | null> {
  const scaled = timeoutMs * loadFactor();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`server did not exit within ${Math.round(scaled / 1000)}s after SIGTERM`)),
      scaled
    );
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}

function initFixture(parent: string, name = "Site Key Fixture"): string {
  const dir = path.join(parent, "site");
  const initResult = runCliSync(["init", dir, "--name", name]);
  assert.equal(initResult.status, 0, `fixture setup: tovu init must succeed (stderr: ${initResult.stderr})`);
  return dir;
}

/** This fixture's own `siteId` — `resolveSiteKeyId`'s fallback field (`site-key-sources.ts`), read
 *  straight off disk rather than hardcoded, since `tovu init` mints a fresh `randomUUID()` per run. */
function readSiteId(dir: string): string {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as { siteId: string };
  return meta.siteId;
}

/**
 * Same table `site-key-ensure.unit.test.ts`'s own `buildSealedCiphertextDb` helper targets
 * (`publish_credential_sets`, one of the tables `findKeyDependentData`'s `%sealed_ciphertext%` scan
 * matches) — but INSERTS into it rather than creating it: this suite runs against a REAL `tovu
 * init`-seeded `content.db`, where that table already exists with its real schema (NOT NULL
 * columns, a `workspace_id` foreign key into `workspaces`), unlike the unit test's from-scratch,
 * schema-less fixture database.
 */
function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    const workspace = db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: string } | undefined;
    if (!workspace) {
      throw new Error("buildSealedCiphertextDb: fixture content.db has no workspace row to attach a sealed credential set to");
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO publish_credential_sets
         (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("test-sealed-credential", workspace.id, "test-provider", "Test Credential", "v1", "cipher-bytes", "test-nonce", "aes-gcm", now, now);
  } finally {
    db.close();
  }
}

/** Env every test in this file spawns with: a fresh, isolated `HOME` (so `~/.tovu/site-keys/`
 *  resolves under a throwaway temp dir, never the real one) and both root-key env var names
 *  explicitly made ABSENT — see this file's header for why inheriting the real parent env is
 *  unsafe here.
 *
 * Deliberately `undefined`, NOT `""`: `spawn`'s `env` option drops any key whose value is
 * `undefined` (verified directly — the child's `process.env` has no such key at all), which is
 * what "genuinely nothing configured" means to `siteKeySources`'s `resolveEnvVarName` and
 * `ensureSiteKey`'s own material resolution. An EMPTY STRING is a materially different input to
 * THIS specific pipeline: `resolveEnvVarName` treats any `env[name] !== undefined` as "already
 * set" (preferring `TOVU_SITE_KEY` the instant it exists at all, blank or not), and
 * `findFirstPresentMaterial`/`readSourceRaw` (`site-key-ensure.ts`) then treat that blank value as
 * PRESENT-but-invalid material (`parseRootKeyHex("")` rejects it) — `planSiteKeyEnsure` reports
 * `"invalid"`, not `"mint"`, exactly per its own documented rule #5 ("adopting broken material
 * would just move the breakage"). That is correct, deliberate A1/A2 behavior for this new
 * `sources`-driven path — a real difference from the OLD, unrelated `EnvOrFileKeyring.
 * resolveRootKey()` default branch's `if (fromEnv)` truthy check, which is what
 * `development/scripts/start.mjs`'s `clearBlankRootKeyEnv`/"empty string = absent" convention
 * actually targets. This test wants the genuinely-nothing-anywhere case, so it must send genuine
 * absence, not a blank value this mechanism validates and rejects. */
function isolatedEnv(tempHome: string): NodeJS.ProcessEnv {
  return { HOME: tempHome, TOVU_INTEGRATIONS_ROOT_KEY: undefined, TOVU_SITE_KEY: undefined };
}

test("site-key plan §A3a: a fresh tovu serve boot, with no key anywhere, mints this site's own per-site key file under HOME/.tovu/site-keys/<siteId>.hex", async () => {
  const parent = mkTempParent("tovu-serve-site-key-mint-");
  const tempHome = mkTempParent("tovu-serve-site-key-mint-home-");
  const dir = initFixture(parent);
  const siteId = readSiteId(dir);
  const perSiteFilePath = path.join(tempHome, ".tovu", "site-keys", `${siteId}.hex`);

  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)], isolatedEnv(tempHome));
  try {
    await waitForHttpReady(port, child);

    assert.ok(fs.existsSync(perSiteFilePath), `expected ${perSiteFilePath} to exist after boot — ensureSiteKeyForBoot must mint it when nothing else resolves`);
    const written = fs.readFileSync(perSiteFilePath, "utf8").trim();
    assert.match(written, /^[0-9a-f]{64}$/, "the minted per-site file must hold a 32-byte hex root key, the same shape ensureSiteKey's own unit tests assert");
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("site-key plan §A3a: a site with sealed key-dependent data and no key anywhere still boots successfully (refuse must never block boot) but mints no per-site file", async () => {
  const parent = mkTempParent("tovu-serve-site-key-refuse-");
  const tempHome = mkTempParent("tovu-serve-site-key-refuse-home-");
  const dir = initFixture(parent);
  const siteId = readSiteId(dir);
  const perSiteFilePath = path.join(tempHome, ".tovu", "site-keys", `${siteId}.hex`);
  buildSealedCiphertextDb(path.join(dir, "content.db"));

  const port = await getFreePort();
  const child = spawnServe([dir, "--port", String(port)], isolatedEnv(tempHome));
  try {
    await waitForHttpReady(port, child);

    assert.ok(!fs.existsSync(perSiteFilePath), `expected ${perSiteFilePath} to NOT exist — ensureSiteKeyForBoot must refuse to mint over pre-existing sealed data, never orphan it`);
  } finally {
    if (child.exitCode === null && !child.killed) {
      await stopGracefully(child);
    }
    removeFixtureTree(parent);
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
