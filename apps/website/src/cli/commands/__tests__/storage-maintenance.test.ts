/**
 * @file P11 ST-16 (clean half): `tovu storage clean <dir> [--dry-run] [--json]` and
 * `tovu storage capabilities [--json]`. Clean runs the serving root's retention policies on a STOPPED
 * site under a maintenance lease — never a normal boot, never a migration — and refuses a running site.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { Command } from "commander";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";
import type { RetentionPolicy } from "@jini-ai/platform/retention";

import { claimSiteRunning, readSiteRunning } from "#src/platform/site-dir/site-running";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import {
  runStorageCapabilitiesCommand, runStorageCleanCommand, storageCleanPorts,
  type StorageCleanRequired, type StorageCompactionBinding, type StoppedSiteHandles,
} from "../storage-maintenance.js";
import { registerStorageCommands } from "../storage-program.js";

async function site(t: TestContext): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "storage-clean-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function capture() {
  const chunks: string[] = [];
  return { stdout: { write: (chunk: string) => { chunks.push(chunk); return true; } }, text: () => chunks.join("") };
}

const record = (purpose?: "serve" | "maintenance"): DirectoryRunningRecord => ({
  pid: 4242, port: purpose === "maintenance" ? 0 : 3000, app: "Web", started: "2026-11-25T00:00:00.000Z", token: "t", scheme: "http",
  ...(purpose === undefined ? {} : { purpose }),
});

/** Every port records into one trace, so the order claim → open → run → drain → close → release is observable. */
function traced(dir: string, { attached = null as DirectoryRunningRecord | null, policies = [] as RetentionPolicy[] } = {}) {
  const trace: string[] = [];
  const out = capture();
  const handles: StoppedSiteHandles = { close: async () => { trace.push("close"); } };
  const required: StorageCleanRequired<StoppedSiteHandles> = {
    dir,
    stdout: out.stdout,
    claim: ({ dir: claimed }) => { trace.push(`claim:${claimed === dir}`); return { attached, release: () => trace.push("release") }; },
    openExisting: async (_required, { writable }) => { trace.push(`open:${writable ? "writable" : "read-only"}`); return handles; },
    policyFactory: ({ handles: given }) => { trace.push(`policies:${given === handles}`); return policies; },
    createRunner: () => ({
      runOnce: async ({ dryRun }) => {
        trace.push(`run:${dryRun}`);
        const outcomes = [];
        for (const policy of policies) {
          try { outcomes.push(dryRun
            ? { id: policy.id, kind: policy.kind, status: "measured" as const, measurement: await policy.measure() }
            : { id: policy.id, kind: policy.kind, status: "swept" as const, result: await policy.sweep({ now: 0 }) }); }
          catch (error) { outcomes.push({ id: policy.id, kind: policy.kind, status: "failed" as const, message: (error as Error).message }); }
        }
        return { status: "completed" as const, dryRun, startedAt: 0, finishedAt: 0, policies: outcomes };
      },
      stop: async () => { trace.push("drain"); },
    }),
    reportError: ({ error }) => { trace.push(`error:${error.message}`); return { errorId: "ERR-AAAA-BBBB-CCCC-DDDD" }; },
  };
  return { required, trace, text: out.text };
}

test("running site → \"This website is running; clean it from its Storage screen.\"", async t => {
  const dir = await site(t);
  const run = traced(dir, { attached: record("serve") });
  const result = await runStorageCleanCommand(run.required, { dryRun: false });
  assert.equal(result.exitCode, 3);
  assert.equal(run.text(), "This website is running; clean it from its Storage screen.\n");
  // An attachment owns nothing: no handle is opened and the other process's lease is not released.
  assert.deepEqual(run.trace, ["claim:true"]);
});

test("a site another clean holds is busy, not running, and is left alone", async t => {
  const dir = await site(t);
  const run = traced(dir, { attached: record("maintenance") });
  const result = await runStorageCleanCommand(run.required, { dryRun: false });
  assert.equal(result.exitCode, 3);
  assert.equal(run.text(), "This website's storage is already being cleaned; try again when that finishes.\n");
  assert.deepEqual(run.trace, ["claim:true"]);
});

test("clean takes the lease before any writable handle, then drains, closes and releases in that order", async t => {
  const dir = await site(t);
  const policy: RetentionPolicy = { id: "share-files", kind: "old-copy", measure: async () => ({ bytes: 10 }), sweep: async () => ({ freedBytes: 10, removed: 1 }) };
  const run = traced(dir, { policies: [policy] });
  const result = await runStorageCleanCommand(run.required, { dryRun: false });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(run.trace, ["claim:true", "open:writable", "policies:true", "run:false", "drain", "close", "release"]);
  assert.match(run.text(), /share-files: freed 10 B, removed 1/);
});

test("--dry-run never deletes", async t => {
  const dir = await site(t);
  const victim = path.join(dir, "expired.zip");
  await writeFile(victim, Buffer.alloc(64));
  let swept = 0;
  const policy: RetentionPolicy = {
    id: "share-files", kind: "old-copy",
    measure: async () => ({ bytes: 64, items: 1 }),
    sweep: async () => { swept += 1; await unlink(victim); return { freedBytes: 64, removed: 1 }; },
  };
  const run = traced(dir, { policies: [policy] });
  const result = await runStorageCleanCommand(run.required, { dryRun: true });
  assert.equal(result.exitCode, 0);
  assert.equal(swept, 0, "a dry run only measures");
  assert.equal(existsSync(victim), true, "a dry run deletes nothing");
  assert.ok(run.trace.includes("open:read-only"), "a dry run never opens a writable handle");
  assert.ok(!run.trace.includes("open:writable"));
  assert.match(run.text(), /Nothing was deleted \(dry run\)/);
});

test("a policy that keeps its items makes the run partial (exit 2)", async t => {
  const dir = await site(t);
  const policy: RetentionPolicy = { id: "share-files", kind: "old-copy", measure: async () => ({ bytes: null }), sweep: async () => { throw new Error("A share is busy; it was kept."); } };
  const run = traced(dir, { policies: [policy] });
  const result = await runStorageCleanCommand(run.required, { json: true, dryRun: false });
  assert.equal(result.exitCode, 2);
  const printed = JSON.parse(run.text());
  assert.equal(printed.status, "partial");
  assert.equal(printed.policies[0].message, "A share is busy; it was kept.");
});

test("an unexpected failure prints its ERR- id, exits 1, and still closes then releases", async t => {
  const dir = await site(t);
  const run = traced(dir);
  run.required.policyFactory = () => { throw new Error("disk unavailable"); };
  const result = await runStorageCleanCommand(run.required, { dryRun: false });
  assert.equal(result.exitCode, 1);
  assert.match(run.text(), /ERR-AAAA-BBBB-CCCC-DDDD/);
  assert.deepEqual(run.trace, ["claim:true", "open:writable", "close", "error:disk unavailable", "release"]);
});

test("clean does not migrate", async t => {
  const dir = await site(t);
  for (const name of ["content.db", "chat.db"]) {
    const db = new Database(path.join(dir, name));
    db.exec("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('old schema'); PRAGMA user_version = 1;");
    db.close();
  }
  await mkdir(path.join(dir, "ops", "shares"), { recursive: true });
  const hash = async (name: string) => createHash("sha256").update(await readFile(path.join(dir, name))).digest("hex");
  const before = [await hash("content.db"), await hash("chat.db")];
  let released = 0;
  const out = capture();
  const ports = storageCleanPorts({
    claim: () => ({ attached: null, release: () => { released += 1; } }),
    resolvePaths: () => ({ contentDbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db") }),
  });
  const result = await runStorageCleanCommand({ dir, stdout: out.stdout, ...ports });
  assert.equal(result.exitCode, 0, out.text());
  assert.deepEqual([await hash("content.db"), await hash("chat.db")], before, "no database is opened, so nothing migrates");
  for (const name of ["content.db-wal", "content.db-shm", "chat.db-wal", "chat.db-shm"]) assert.equal(existsSync(path.join(dir, name)), false, name);
  assert.equal(released, 1);
  assert.match(out.text(), /share-files/, "the serving root's own share policy ran");
});

test("claimSiteRunning takes a maintenance lease with no address only when asked; serve stays the default", async t => {
  const dir = await site(t);
  const home = await site(t);
  const workspace = createSitesWorkspace({}, { homeDir: home, env: {} });
  const maintenance = claimSiteRunning({ dir, app: "Web", purpose: "maintenance" }, { workspace, log: () => {} });
  assert.equal(maintenance.attached, null);
  assert.equal(readSiteRunning({ dir }, { workspace })?.purpose, "maintenance");
  assert.equal(readSiteRunning({ dir }, { workspace })?.port, 0);
  maintenance.release();
  const serve = claimSiteRunning({ dir, app: "Web" }, { workspace, log: () => {} });
  assert.notEqual(readSiteRunning({ dir }, { workspace })?.purpose, "maintenance");
  serve.release();
});

test("capabilities --json advertises only connected operations", () => {
  const without = capture();
  runStorageCapabilitiesCommand({ stdout: without.stdout, compactStoppedSite: undefined }, { json: true });
  assert.deepEqual(JSON.parse(without.text()), { operations: ["report", "move", "clean"] });
  const withCompact = capture();
  runStorageCapabilitiesCommand({ stdout: withCompact.stdout, compactStoppedSite: async () => ({ status: "done" }) }, { json: true });
  assert.deepEqual(JSON.parse(withCompact.text()).operations, ["report", "move", "clean", "compact"]);
});

// Codex FIX 6 — mutation `M storage-clean-default-live` (dryRun defaulting to false) must fail this test:
// owner data is only ever deleted on an explicit opt-in, never by an unadorned `storage clean`.
test("an unadorned storage clean is a preview: read-only handles, measured only, nothing swept", async t => {
  const swept: string[] = [];
  const policy: RetentionPolicy = { id: "share-files", kind: "old-copy", measure: async () => ({ bytes: 9, items: 1 }), sweep: async () => { swept.push("share-files"); return { removed: 1, freedBytes: 9 }; } };
  const run = traced(await site(t), { policies: [policy] });
  const result = await runStorageCleanCommand(run.required);
  assert.equal(result.dryRun, true);
  assert.deepEqual(swept, []);
  assert.ok(run.trace.includes("open:read-only") && run.trace.includes("run:true"), run.trace.join(","));
  assert.ok(!run.trace.includes("open:writable"));
  assert.match(run.text(), /Nothing was deleted \(dry run\)\./);
});

// Codex FIX 7: the server log keeps the incident id and a redacted diagnostic, never the raw error text.
test("storage-clean error log carries the incident id and no raw error message", t => {
  const logged = t.mock.method(console, "error", () => {});
  const ports = storageCleanPorts({ claim: () => { throw new Error("unused"); }, resolvePaths: () => { throw new Error("unused"); } } as unknown as Parameters<typeof storageCleanPorts>[0]);
  const raw = "EACCES open /home/owner/private/shares/sk-ant-api03-AAAABBBBCCCCDDDDEEEE.zip";
  const { errorId } = ports.reportError({ error: Object.assign(new Error(raw), { code: "EACCES" }), policyId: "share-files" }, {});
  assert.match(errorId, /^ERR-/);
  const text = JSON.stringify(logged.mock.calls.map(call => call.arguments));
  assert.ok(text.includes(errorId), text);
  assert.ok(text.includes("EACCES"), text);
  assert.ok(!text.includes("sk-ant-api03") && !text.includes("/home/owner"), text);
});

// ST-7b.T (T4c): `compact` exists only when the compaction binding is supplied. The binding is withheld from the
// real program until G1–G3 clear, so an unbound build must not register, advertise or run compaction.
// Mutation `M7b-register-compact-unbound` (registering `compact` without a binding) must fail the first test.
function storageProgram(binding?: StorageCompactionBinding) {
  const out = capture();
  const exits: number[] = [];
  const program = new Command("tovu").exitOverride().configureOutput({ writeErr: () => {} });
  registerStorageCommands({ program, stdout: out.stdout, env: {}, setExitCode: code => { exits.push(code); } }, binding ? { compaction: binding } : {});
  const storage = program.commands.find(command => command.name() === "storage");
  return { program, out, exits, subcommands: () => storage?.commands.map(command => command.name()) ?? [] };
}

function fakeBinding() {
  const calls: string[] = [];
  const confirmations: unknown[] = [];
  const binding: StorageCompactionBinding = {
    compact: async ({ siteDir }) => { calls.push(`compact:${siteDir}`); return { status: "done" }; },
    resolve: async ({ siteDir, confirmation }) => { calls.push(`resolve:${siteDir}`); confirmations.push(confirmation); return { status: "kept-current", message: "Kept." }; },
    resume: async ({ siteDir }) => { calls.push(`resume:${siteDir}`); return { status: "nothing-pending" }; },
  };
  return { binding, calls, confirmations };
}

test("compact is absent when the binding is unavailable", async () => {
  const unbound = storageProgram();
  assert.deepEqual(unbound.subcommands(), ["report", "move", "clean", "capabilities"]);
  await unbound.program.parseAsync(["storage", "capabilities", "--json"], { from: "user" });
  assert.deepEqual(JSON.parse(unbound.out.text()), { operations: ["report", "move", "clean"] });
  await assert.rejects(unbound.program.parseAsync(["storage", "compact", "/nowhere"], { from: "user" }));
});

test("compact listed in operations when bound", async t => {
  const dir = await site(t);
  const { binding, calls } = fakeBinding();
  const bound = storageProgram(binding);
  assert.ok(bound.subcommands().includes("compact"));
  await bound.program.parseAsync(["storage", "capabilities", "--json"], { from: "user" });
  assert.deepEqual(JSON.parse(bound.out.text()), { operations: ["report", "move", "clean", "compact"] });
  await bound.program.parseAsync(["storage", "compact", dir, "--json"], { from: "user" });
  await bound.program.parseAsync(["storage", "compact", dir, "--resume", "--json"], { from: "user" });
  assert.deepEqual(calls, [`compact:${dir}`, `resume:${dir}`]);
  assert.deepEqual(bound.exits, [0, 0]);
});

test("resolve requires a confirmed action", async t => {
  const dir = await site(t);
  const { binding, calls, confirmations } = fakeBinding();
  const bound = storageProgram(binding);
  const confirm = JSON.stringify({ markerAt: 17, recoveryCopyPath: "/site/pre-compact-content-17.db", mainIdentity: "dev:ino" });
  const run = (args: string[]) => bound.program.parseAsync(["storage", "compact", dir, ...args, "--json"], { from: "user" });
  await run(["--resolve", "restore-copy", "--database", "content"]);
  await run(["--resolve", "delete-everything", "--database", "content", "--confirm", confirm]);
  await run(["--resolve", "keep-current", "--database", "content", "--confirm", "{\"markerAt\":17}"]);
  await run(["--resolve", "keep-current", "--database", "pages", "--confirm", confirm]);
  assert.deepEqual(calls, [], "no unconfirmed or malformed decision reaches the binding");
  assert.deepEqual(bound.exits, [1, 1, 1, 1]);
  await run(["--resolve", "keep-current", "--database", "chat", "--confirm", confirm]);
  assert.deepEqual(calls, [`resolve:${dir}`]);
  assert.deepEqual(confirmations, [{ action: "keep-current", database: "chat", markerAt: 17, recoveryCopyPath: "/site/pre-compact-content-17.db", mainIdentity: "dev:ino" }]);
  assert.equal(bound.exits.at(-1), 0);
});
