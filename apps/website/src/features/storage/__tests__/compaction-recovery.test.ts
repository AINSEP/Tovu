import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { SqliteCompactionMarker } from "@jini-ai/core/contracts/storage";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { discardCompactionLeftovers, resolveCompactionAttention, resumeCompactionRestore } from "../compaction-recovery.js";
import { compactionRecoverySqlitePorts, nodeRestoreFs, siteRestoreJournal } from "../compaction-recovery-ports.js";
import type { MaintenanceLease, ResolveCompactionAttentionRequired, RestoreConfirmation, RestoreFs } from "../compaction-recovery.types.js";

const KNOWN = CONTENT_MIGRATIONS.slice(0, 2).map((step) => step.id);
const MARKER_AT = 1000;

function writeDb(file: string, { rows, steps }: { rows: number; steps: readonly string[] }): void {
  const db = new Database(file);
  try {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); CREATE TABLE tovu_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const note = db.prepare("INSERT INTO notes (body) VALUES (?)");
    for (let index = 0; index < rows; index += 1) note.run(`note ${index}`);
    const step = db.prepare("INSERT INTO tovu_migrations VALUES (?, ?, ?)");
    steps.forEach((id, index) => step.run(id, `sum-${id}`, `2026-01-0${index + 1}`));
  } finally { db.close(); }
}

/** A site whose compaction rewrite failed: the live file (5 rows) differs from the recovery copy (3 rows). */
async function site(t: test.TestContext, { copySteps = KNOWN }: { copySteps?: readonly string[] } = {}) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tovu-restore-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, "data"));
  const mainPath = path.join(dir, "data", "content.db");
  const copy = path.join(dir, "data", `pre-compact-content-${MARKER_AT}.db`);
  writeDb(copy, { rows: 3, steps: copySteps });
  writeDb(mainPath, { rows: 5, steps: KNOWN });
  let marker: SqliteCompactionMarker | undefined = { state: "needs-attention", recoveryCopyPath: copy, at: MARKER_AT, reason: "check failed" };
  const markerStore = { read: async () => marker, clear: async () => { events.push("marker-clear"); marker = undefined; } };
  const events: string[] = [];
  const lease = { attached: null as object | null, held: true, released: 0 };
  const claim = (): MaintenanceLease => ({ attached: lease.attached, isHeld: () => lease.held, release: () => { lease.released += 1; } });
  const oldIdentity = await nodeRestoreFs.identity(mainPath);
  const oldSha = await nodeRestoreFs.sha256(mainPath);
  const copySha = await nodeRestoreFs.sha256(copy);
  const confirmation: RestoreConfirmation = { action: "restore-copy", database: "content", markerAt: MARKER_AT, recoveryCopyPath: copy, mainIdentity: oldIdentity };
  const sqlite = compactionRecoverySqlitePorts({ database: "content" });
  const required: ResolveCompactionAttentionRequired = {
    dir, mainPath, confirmation, claim, marker: markerStore, journal: siteRestoreJournal({ dir, database: "content" }), fs: nodeRestoreFs,
    ...sqlite, holdCopy: ({ work }) => work(), now: () => 2000,
  };
  return { dir, mainPath, copy, required, lease, events, oldIdentity, oldSha, copySha, marker: () => marker };
}

const exists = (file: string) => nodeRestoreFs.exists(file);
const withFs = (required: ResolveCompactionAttentionRequired, patch: Partial<RestoreFs>): ResolveCompactionAttentionRequired => ({ ...required, fs: { ...nodeRestoreFs, ...patch } });

test("restore-copy publishes the copy, keeps the old file and the copy, and clears the marker", async (t) => {
  const s = await site(t);
  const outcome = await resolveCompactionAttention(s.required);
  assert.equal(outcome.status, "restored");
  if (outcome.status !== "restored") return;
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.copySha);
  // The preserved file is the OLD inode, so the swap "rename before link" is caught here.
  assert.equal(await nodeRestoreFs.identity(outcome.preservedPath), s.oldIdentity);
  assert.equal(await nodeRestoreFs.sha256(outcome.preservedPath), s.oldSha);
  assert.equal(await nodeRestoreFs.sha256(s.copy), s.copySha, "the recovery copy is untouched");
  assert.equal(s.marker(), undefined);
  assert.equal(await s.required.journal.read(), undefined);
  assert.equal(await exists(`${s.mainPath}.restore.partial`), false);
  assert.match(outcome.message, /nothing was deleted/);
  assert.equal(s.lease.released, 1);
});

test("failed restore preserves both copies and the attention marker", async (t) => {
  const s = await site(t);
  const required = { ...s.required, inspect: ({ path: file }: { path: string }) => (file.endsWith(".restore.partial") ? "failed" as const : s.required.inspect({ path: file })) };
  const outcome = await resolveCompactionAttention(required);
  assert.equal(outcome.status === "refused" && outcome.reason, "verify-failed");
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(await nodeRestoreFs.sha256(s.copy), s.copySha);
  assert.equal(s.marker()?.state, "needs-attention");
  assert.equal(await exists(`${s.mainPath}.restore.partial`), false);
  assert.equal(await s.required.journal.read(), undefined);
});

test("refused while the site serves", async (t) => {
  const s = await site(t);
  s.lease.attached = { pid: 1 };
  const outcome = await resolveCompactionAttention(s.required);
  assert.equal(outcome.status === "refused" && outcome.reason, "running");
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(s.marker()?.state, "needs-attention");
});

test("refused while another connection holds a transaction", async (t) => {
  const s = await site(t);
  const other = new Database(s.mainPath);
  t.after(() => other.close());
  other.exec("BEGIN IMMEDIATE");
  const outcome = await resolveCompactionAttention(s.required);
  other.exec("ROLLBACK");
  assert.equal(outcome.status === "refused" && outcome.reason, "busy");
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity);
  assert.equal(s.marker()?.state, "needs-attention");
});

test("copy with a newer migration than this binary is never published", async (t) => {
  const s = await site(t, { copySteps: [...KNOWN, "9999_from_a_newer_app"] });
  const outcome = await resolveCompactionAttention(s.required);
  assert.equal(outcome.status === "refused" && outcome.reason, "schema-unknown");
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(await s.required.journal.read(), undefined);
});

test("staged bytes that differ from the copy are not published", async (t) => {
  const s = await site(t);
  const required = withFs(s.required, { copyExclusive: async (from, to) => {
    await nodeRestoreFs.copyExclusive(from, to);
    if (!to.endsWith(".restore.partial")) return;
    const bytes = await fs.readFile(to);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1]! + 1) % 256;
    await fs.writeFile(to, bytes);
  } });
  const outcome = await resolveCompactionAttention(required);
  assert.equal(outcome.status === "refused" && outcome.reason, "verify-failed");
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(await exists(`${s.mainPath}.restore.partial`), false);
  assert.equal(s.marker()?.state, "needs-attention");
});

test("main is never absent: crash after link and before rename leaves the old main serving", async (t) => {
  const s = await site(t);
  const crashing = withFs(s.required, { renameAtomic: async () => { throw new Error("power lost"); } });
  await assert.rejects(resolveCompactionAttention(crashing), /power lost/);
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity, "the live name still holds the old file");
  assert.equal((await s.required.journal.read() as { step: string }).step, "preserved");
  // A restore cannot start over an unfinished one.
  const blocked = await resolveCompactionAttention(s.required);
  assert.equal(blocked.status === "refused" && blocked.reason, "journal-pending");
  const resumed = await resumeCompactionRestore({ ...s.required, database: "content" });
  assert.equal(resumed.status === "refused" && resumed.reason, "verify-failed");
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity);
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(await exists(`${s.mainPath}.restore.partial`), false);
  assert.deepEqual((await fs.readdir(path.dirname(s.mainPath))).filter((name) => name.startsWith("failed-compact-")), []);
  assert.equal(await s.required.journal.read(), undefined);
  assert.equal(s.marker()?.state, "needs-attention");
});

test("crash after rename resumes to verification and clears the marker", async (t) => {
  const s = await site(t);
  const journal = s.required.journal;
  const crashing = { ...s.required, journal: { ...journal, write: async (entry: Parameters<typeof journal.write>[0]) => {
    if (entry.step === "published") throw new Error("power lost");
    await journal.write(entry);
  } } };
  await assert.rejects(resolveCompactionAttention(crashing), /power lost/);
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.copySha);
  assert.equal(s.marker()?.state, "needs-attention", "not cleared before verification");
  const resumed = await resumeCompactionRestore({ ...s.required, database: "content" });
  assert.equal(resumed.status, "restored");
  assert.equal(s.marker(), undefined);
  assert.equal(await s.required.journal.read(), undefined);
});

test("publish verification failure rolls back to the old inode", async (t) => {
  const s = await site(t);
  const required = { ...s.required, inspect: ({ path: file }: { path: string }) => (file === s.mainPath ? "failed" as const : s.required.inspect({ path: file })) };
  const outcome = await resolveCompactionAttention(required);
  assert.equal(outcome.status === "refused" && outcome.reason, "publish-verify-failed");
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity);
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
  assert.equal(await nodeRestoreFs.sha256(s.copy), s.copySha);
  assert.equal(s.marker()?.state, "needs-attention");
  assert.equal(await s.required.journal.read(), undefined);
});

test("marker cleared only after the published file verifies", async (t) => {
  const s = await site(t);
  const required = withFs(s.required, { sha256: async (file) => { if (file === s.mainPath) s.events.push("verify-main"); return nodeRestoreFs.sha256(file); } });
  assert.equal((await resolveCompactionAttention(required)).status, "restored");
  assert.deepEqual(s.events, ["verify-main", "marker-clear"]);
});

test("lease lost or a reader arriving before the publishing rename publishes nothing", async (t) => {
  const s = await site(t);
  let checks = 0;
  const required = { ...s.required, claim: (): MaintenanceLease => ({ attached: null, isHeld: () => { checks += 1; return false; }, release: () => {} }) };
  const outcome = await resolveCompactionAttention(required);
  assert.equal(outcome.status === "refused" && outcome.reason, "running");
  assert.equal(checks, 1);
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity);
  assert.equal(await exists(`${s.mainPath}.restore.partial`), false);
  let admissions = 0;
  const busyLate = { ...s.required, admitStopped: (input: { path: string }) => (++admissions > 1 ? "busy" as const : s.required.admitStopped(input)) };
  const late = await resolveCompactionAttention(busyLate);
  assert.equal(late.status === "refused" && late.reason, "busy");
  assert.equal(await nodeRestoreFs.identity(s.mainPath), s.oldIdentity);
});

test("keep-current requires a fresh integrity check", async (t) => {
  const s = await site(t);
  const keep = { ...s.required, confirmation: { ...s.required.confirmation, action: "keep-current" as const } };
  const failing = await resolveCompactionAttention({ ...keep, inspect: () => "failed" });
  assert.equal(failing.status === "refused" && failing.reason, "verify-failed");
  assert.equal(s.marker()?.state, "needs-attention");
  const inspected: string[] = [];
  const kept = await resolveCompactionAttention({ ...keep, inspect: (input) => { inspected.push(input.path); return s.required.inspect(input); } });
  assert.equal(kept.status, "kept-current");
  assert.deepEqual(inspected, [s.mainPath]);
  assert.equal(s.marker(), undefined);
  assert.equal(await nodeRestoreFs.sha256(s.copy), s.copySha, "keep-current removes nothing");
});

test("stale confirmation is refused", async (t) => {
  const s = await site(t);
  for (const confirmation of [
    { ...s.required.confirmation, markerAt: MARKER_AT + 1 },
    { ...s.required.confirmation, recoveryCopyPath: `${s.copy}.other` },
    { ...s.required.confirmation, mainIdentity: "0:0" },
  ]) {
    const outcome = await resolveCompactionAttention({ ...s.required, confirmation });
    assert.equal(outcome.status === "refused" && outcome.reason, "stale");
  }
  assert.equal(await nodeRestoreFs.sha256(s.mainPath), s.oldSha);
});

test("discard refuses while the marker still needs attention, and deletes only the confirmed files", async (t) => {
  const s = await site(t);
  const item = { path: s.copy, kind: "recovery-copy" as const, identity: await nodeRestoreFs.identity(s.copy), bytes: await nodeRestoreFs.size(s.copy) };
  const removed: string[] = [];
  const base = {
    dir: s.dir, items: [item], claim: s.required.claim, fs: nodeRestoreFs, marker: s.required.marker, holdCopy: s.required.holdCopy,
    unlink: async ({ path: file }: { path: string }) => { removed.push(file); await fs.unlink(file); },
  };
  const pending = await discardCompactionLeftovers({ ...base, confirmation: { paths: [s.copy], identities: [item.identity], markerState: "needs-attention" } });
  assert.equal(pending.status === "refused" && pending.reason, "needs-attention");
  assert.deepEqual(removed, []);
  await s.required.marker.clear();
  const stale = await discardCompactionLeftovers({ ...base, confirmation: { paths: [s.copy], identities: ["0:0"], markerState: "none" } });
  assert.equal(stale.status === "refused" && stale.reason, "stale");
  assert.deepEqual(removed, []);
  const done = await discardCompactionLeftovers({ ...base, confirmation: { paths: [s.copy], identities: [item.identity], markerState: "none" } });
  assert.equal(done.status, "discarded");
  assert.deepEqual(removed, [s.copy]);
  assert.equal(await exists(s.mainPath), true);
});
