import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { findKeyDependentData, planRootKeyEnsure, runRootKeyEnsureCommand } from "../../commands/root-key.js";

/**
 * @file `tovu root-key ensure [--quiet]` (npm-start-just-works-plan-2026-09-24, Slice 1).
 *
 * Covers the pure decision table (`planRootKeyEnsure`) directly, and the thin command
 * (`runRootKeyEnsureCommand`) end to end against injected temp key paths, DB fixtures and env —
 * never the real `~/.tovu` key file and never the real `TOVU_INTEGRATIONS_ROOT_KEY`/
 * `TOVU_RUNTIME_MODE` process env (see {@link withProcessEnv}: `inspectRootKeyMaterial` reads
 * `process.env` directly with no injection seam of its own, so the env-var-active case has no
 * narrower option — same pattern `serve-site-dir-pin.unit.test.ts` already uses).
 */

/** Runs `body` with `process.env` temporarily replaced, restoring the real one after — including
 *  on throw. Mirrors `serve-site-dir-pin.unit.test.ts`'s helper of the same name/shape. */
function withProcessEnv<T>(env: NodeJS.ProcessEnv, body: () => T): T {
  const saved = process.env;
  process.env = env;
  try {
    return body();
  } finally {
    process.env = saved;
  }
}

/** `process.env` with the two vars this suite cares about forced absent, whatever the real shell
 *  happens to carry — the ambient-env-leak risk `withProcessEnv` exists to close. */
function bareEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TOVU_INTEGRATIONS_ROOT_KEY;
  delete env.TOVU_RUNTIME_MODE;
  return env;
}

/** Captures every `process.stdout.write`/`process.stderr.write` call made during `body`, restoring
 *  the real streams after — including on throw. */
async function captureOutput(body: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout.write as any) = (chunk: string) => {
    stdout += chunk;
    return true;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr.write as any) = (chunk: string) => {
    stderr += chunk;
    return true;
  };
  try {
    await body();
  } finally {
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
  }
  return { stdout, stderr };
}

function fingerprintOf(hex: string): string {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 12);
}

function validRootKeyHex(): string {
  return randomBytes(32).toString("hex");
}

let workDir: string;

test.beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "tovu-root-key-ensure-"));
});

test.afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function keyFilePathIn(dir: string): string {
  return path.join(dir, "integrations-root-key.hex");
}

function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE publish_credential_sets (id INTEGER PRIMARY KEY, sealed_ciphertext TEXT)");
    db.exec("INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes')");
  } finally {
    db.close();
  }
}

function buildWebhookSubscriptionsDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE webhook_subscriptions (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO webhook_subscriptions (id) VALUES (1)");
  } finally {
    db.close();
  }
}

function buildEmptyDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// planRootKeyEnsure — pure decision table
// ---------------------------------------------------------------------------

test("planRootKeyEnsure: an invalid status is always 'invalid', regardless of mode or DB data", () => {
  const plan = planRootKeyEnsure({
    status: { active: false, source: "file", invalid: true, reason: "not-hex", keyFilePath: "/x" },
    mode: "local",
    siteDbsWithKeyData: true,
  });
  assert.equal(plan.action, "invalid");
});

test("planRootKeyEnsure: an active env-sourced status is 'noop'", () => {
  const plan = planRootKeyEnsure({
    status: { active: true, source: "env", fingerprint: "abc123abc123", keyFilePath: "/x" },
    mode: "local",
    siteDbsWithKeyData: true,
  });
  assert.equal(plan.action, "noop");
});

test("planRootKeyEnsure: an active file-sourced status is 'noop'", () => {
  const plan = planRootKeyEnsure({
    status: { active: true, source: "file", fingerprint: "abc123abc123", keyFilePath: "/x" },
    mode: "local",
    siteDbsWithKeyData: false,
  });
  assert.equal(plan.action, "noop");
});

test("planRootKeyEnsure: production mode with nothing configured is 'noop' — never generates", () => {
  const plan = planRootKeyEnsure({
    status: { active: false, source: "none", keyFilePath: "/x" },
    mode: "production",
    siteDbsWithKeyData: false,
  });
  assert.equal(plan.action, "noop");
});

test("planRootKeyEnsure: production mode never generates even when a DB holds key-dependent data (its own gate, not this refusal)", () => {
  const plan = planRootKeyEnsure({
    status: { active: false, source: "none", keyFilePath: "/x" },
    mode: "production",
    siteDbsWithKeyData: true,
  });
  assert.equal(plan.action, "noop");
});

test("planRootKeyEnsure: local mode, nothing configured, key-dependent data present → 'refuse'", () => {
  const plan = planRootKeyEnsure({
    status: { active: false, source: "none", keyFilePath: "/x" },
    mode: "local",
    siteDbsWithKeyData: true,
  });
  assert.equal(plan.action, "refuse");
});

test("planRootKeyEnsure: local mode, nothing configured, no key-dependent data → 'generate'", () => {
  const plan = planRootKeyEnsure({
    status: { active: false, source: "none", keyFilePath: "/x" },
    mode: "local",
    siteDbsWithKeyData: false,
  });
  assert.equal(plan.action, "generate");
});

// ---------------------------------------------------------------------------
// findKeyDependentData
// ---------------------------------------------------------------------------

test("findKeyDependentData: a non-null sealed_ciphertext row counts as key-dependent data", () => {
  const dbPath = path.join(workDir, "content.db");
  buildSealedCiphertextDb(dbPath);
  assert.equal(findKeyDependentData([dbPath]), true);
});

test("findKeyDependentData: a webhook_subscriptions row counts as key-dependent data", () => {
  const dbPath = path.join(workDir, "content.db");
  buildWebhookSubscriptionsDb(dbPath);
  assert.equal(findKeyDependentData([dbPath]), true);
});

test("findKeyDependentData: a DB with neither counts as clean", () => {
  const dbPath = path.join(workDir, "content.db");
  buildEmptyDb(dbPath);
  assert.equal(findKeyDependentData([dbPath]), false);
});

test("findKeyDependentData: an unreadable DB path fails closed (counts as data present)", () => {
  const dbPath = path.join(workDir, "does-not-exist.db");
  assert.equal(findKeyDependentData([dbPath]), true);
});

// ---------------------------------------------------------------------------
// runRootKeyEnsureCommand — the 7 slice-1 cases
// ---------------------------------------------------------------------------

test("runRootKeyEnsureCommand: env var set → no-op, prints nothing with --quiet", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  const hex = validRootKeyHex();
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: hex };

  const { stdout, stderr } = await withProcessEnv(env, () =>
    captureOutput(() => runRootKeyEnsureCommand({ quiet: true, keyFilePath, siteDbPaths: [] }))
  );

  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.equal(existsSync(keyFilePath), false, "an env-sourced key must never also write a file");
});

test("runRootKeyEnsureCommand: valid file → no-op, prints the source=file line without --quiet", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  const hex = validRootKeyHex();
  mkdirSync(path.dirname(keyFilePath), { recursive: true });
  writeFileSync(keyFilePath, hex, { mode: 0o600 });

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ keyFilePath, siteDbPaths: [] }))
  );

  assert.equal(stderr, "");
  assert.equal(stdout, `tovu root-key: source=file fingerprint=${fingerprintOf(hex)} path=${keyFilePath}\n`);
  assert.equal(readFileSync(keyFilePath, "utf8"), hex, "an existing valid file must never be rewritten");
});

test("runRootKeyEnsureCommand: neither present, no DBs → generates the file at mode 0o600, prints nothing with --quiet", async () => {
  const keyFilePath = keyFilePathIn(workDir);

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ quiet: true, keyFilePath, siteDbPaths: [] }))
  );

  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.equal(existsSync(keyFilePath), true);
  const mode = statSync(keyFilePath).mode & 0o777;
  assert.equal(mode, 0o600);
  const written = readFileSync(keyFilePath, "utf8");
  assert.match(written, /^[0-9a-f]{64,}$/);
});

test("runRootKeyEnsureCommand: neither present, no DBs, without --quiet → prints exactly the generated source line", async () => {
  const keyFilePath = keyFilePathIn(workDir);

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ keyFilePath, siteDbPaths: [] }))
  );

  assert.equal(stderr, "");
  const written = readFileSync(keyFilePath, "utf8");
  assert.equal(stdout, `tovu root-key: source=generated fingerprint=${fingerprintOf(written)} path=${keyFilePath}\n`);
});

test("runRootKeyEnsureCommand: neither present, a DB holds a sealed_ciphertext row → refuses, no file created", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  const dbPath = path.join(workDir, "content.db");
  buildSealedCiphertextDb(dbPath);

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ keyFilePath, siteDbPaths: [dbPath] }))
  );

  assert.equal(stdout, "");
  assert.equal(
    stderr,
    "tovu: this site has saved credentials but its security key is missing. Set TOVU_INTEGRATIONS_ROOT_KEY (in .env or your shell) to the key they were saved with.\n"
  );
  assert.equal(existsSync(keyFilePath), false);
});

test("runRootKeyEnsureCommand: neither present, a DB holds a webhook_subscriptions row → refuses", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  const dbPath = path.join(workDir, "content.db");
  buildWebhookSubscriptionsDb(dbPath);

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ keyFilePath, siteDbPaths: [dbPath] }))
  );

  assert.equal(stdout, "");
  assert.equal(
    stderr,
    "tovu: this site has saved credentials but its security key is missing. Set TOVU_INTEGRATIONS_ROOT_KEY (in .env or your shell) to the key they were saved with.\n"
  );
  assert.equal(existsSync(keyFilePath), false);
});

test("runRootKeyEnsureCommand: an invalid existing file → the exact unreadable line, and the file bytes are unchanged", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  mkdirSync(path.dirname(keyFilePath), { recursive: true });
  const badContent = "not-a-valid-hex-key";
  writeFileSync(keyFilePath, badContent, { mode: 0o600 });

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ keyFilePath, siteDbPaths: [] }))
  );

  assert.equal(stdout, "");
  assert.equal(stderr, `tovu: security key at ${keyFilePath} is unreadable (not-hex). Nothing was changed.\n`);
  assert.equal(readFileSync(keyFilePath, "utf8"), badContent);
});

test("runRootKeyEnsureCommand: TOVU_RUNTIME_MODE=production, nothing configured → no-op, never generates", async () => {
  const keyFilePath = keyFilePathIn(workDir);

  const { stdout, stderr } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() =>
      runRootKeyEnsureCommand({
        keyFilePath,
        siteDbPaths: [],
        env: { ...bareEnv(), TOVU_RUNTIME_MODE: "production" },
      })
    )
  );

  assert.equal(stdout, "");
  assert.equal(stderr, "");
  assert.equal(existsSync(keyFilePath), false);
});

test("runRootKeyEnsureCommand: a lost generate race (file already exists) is treated as a no-op, not an error", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  const hex = validRootKeyHex();
  mkdirSync(path.dirname(keyFilePath), { recursive: true });
  writeFileSync(keyFilePath, hex, { mode: 0o600 });

  // `inspectRootKeyMaterial` will already see this as an active file, so this exercises the same
  // path a real race would land in — the generate branch's own `RootKeyFileAlreadyExistsError`
  // catch is exercised directly at the unit level for the branch itself in the command's own
  // module (see Style Notes in the handoff for why this case is intentionally light here).
  const { stdout } = await withProcessEnv(bareEnv(), () =>
    captureOutput(() => runRootKeyEnsureCommand({ quiet: true, keyFilePath, siteDbPaths: [] }))
  );
  assert.equal(stdout, "");
  assert.equal(readFileSync(keyFilePath, "utf8"), hex);
});

// `index.ts` honors `TOVU_CONTENT_DB` (deps.ts `defaultContentDbPath`), which can put the live DB
// anywhere — not under `sites/*/`. The default scan must include it, or sealed rows there are
// invisible and a fresh key gets minted over them.
test("runRootKeyEnsureCommand: sealed data in a TOVU_CONTENT_DB outside sites/ → refuses, no file created", async () => {
  const keyFilePath = keyFilePathIn(workDir);
  mkdirSync(path.join(workDir, "sites", "main"), { recursive: true });
  mkdirSync(path.join(workDir, "elsewhere"));
  const dbPath = path.join(workDir, "elsewhere", "content.db");
  buildSealedCiphertextDb(dbPath);
  const env = { ...bareEnv(), TOVU_SITE_DIR: path.join(workDir, "sites", "main"), TOVU_CONTENT_DB: dbPath };

  const { stderr } = await withProcessEnv(env, () => captureOutput(() => runRootKeyEnsureCommand({ keyFilePath })));

  assert.equal(
    stderr,
    "tovu: this site has saved credentials but its security key is missing. Set TOVU_INTEGRATIONS_ROOT_KEY (in .env or your shell) to the key they were saved with.\n"
  );
  assert.equal(existsSync(keyFilePath), false);
});
