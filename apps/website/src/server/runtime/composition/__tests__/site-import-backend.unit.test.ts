import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { mock } from "node:test";
import { leaveSavedKeysOut } from "@jini-ai/devops/backup/site/saved-keys";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { importFixture } from "#src/features/site-backup/__tests__/import.fixture";
import type { createSiteImportBackend } from "#src/features/site-backup/import-backend";
import type { bindSiteImportBackfill } from "../site-import-backfill.js";
import { IMPORT_INDEX_STATE_SCHEMA } from "@jini-ai/devops/backup/site/import-index/mode";

/**
 * @file The composed site importer (`composeSiteImportBackend`): the optional host hooks reach the
 * backend, and the dormant backfill (the shipped policy is "rollback", so only a direct call runs it)
 * opens its candidate DB fail-closed. The backend factory is wrapped, not replaced, to reach `backfill`.
 */
type Captured = Parameters<typeof createSiteImportBackend>[0] & { backfill: ReturnType<typeof bindSiteImportBackfill> };
const DAMAGED = { name: "ImportHistoryUnavailable", code: "IMPORT_HISTORY_DAMAGED", message: "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID." };
const startSite = async () => ({ adminUrl: null, status: "stopped" });

// One wrapper for the whole file: the composed module binds the factory once, at its first import.
const captures: Captured[] = [];
const real = await import("#src/features/site-backup/import-backend");
mock.module(new URL("../../../../features/site-backup/import-backend.ts", import.meta.url).href, { namedExports: {
  ...real,
  createSiteImportBackend: (required: Captured, optional: Parameters<typeof createSiteImportBackend>[1]) => { captures.push(required); return real.createSiteImportBackend(required, optional); },
} });
const { composeSiteImportBackend } = await import("../site-import-backend.js");

async function composed(t: test.TestContext) {
  const h = await importFixture(t);
  const compose = (workspaceId: string, optional: Parameters<typeof composeSiteImportBackend>[1] = {}) => {
    const before = captures.length;
    const backend = composeSiteImportBackend({ workspaceId, workspace: h.workspace, savedKeys: { restore: leaveSavedKeysOut }, startSite }, optional);
    assert.equal(captures.length, before + 1, "each composition builds exactly one backend");
    return { backend, captured: captures.at(-1)!, directory: path.join(h.workspace.config({}).appData, "site-imports", workspaceId) };
  };
  return { h, compose };
}

test("the host's tracker, setup base and status reporter reach the composed importer", async t => {
  const { h, compose } = await composed(t);
  const reports: unknown[] = [];
  const spans: string[] = [];
  const tracker = { trace: ({ name, run }: { name: string; run: () => unknown }) => { spans.push(name); return run(); } } as unknown as Tracker;
  const { backend } = compose("hooks", { tracker, setupBase: "https://setup.example/imports", report: report => reports.push(report) });
  const upload = await backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await backend.importBackup({ principalId: "owner", source: upload, requestId: "request-1" });
  assert.equal(pending.status, "needs-owner");
  assert.equal(pending.setupUrl, `https://setup.example/imports/${pending.importId}/owner`);
  assert.deepEqual(reports, [{ importId: pending.importId, status: "verifying" }, { importId: pending.importId, status: "needs-owner" }]);
  assert.deepEqual(spans, ["site.import.verify"]);
  // The legacy store reads the row back through the composed durable-JSON port.
  const read = backend.get({ principalId: "owner", importId: pending.importId });
  assert.deepEqual([read.importId, read.status, read.setupUrl], [pending.importId, "needs-owner", pending.setupUrl]);
});

test("an unreadable legacy record blocks the backfill and is logged with its counts, never opening a candidate", async t => {
  const { compose } = await composed(t);
  const { captured, directory } = compose("blocked");
  fs.writeFileSync(path.join(directory, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json"), "{");
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(captured.backfill({}), { state: "blocked" });
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [["[site-backup]", "An import record could not be read; imports keep using the old store until it is fixed.", { unreadable: 1, malformed: 0 }]]);
  assert.equal(fs.existsSync(path.join(directory, "site-imports.db")), false);
});

test("the backfill creates a private candidate DB and refuses one that is not a file or that other users can read", async t => {
  const { compose } = await composed(t);
  const { captured, directory } = compose("private");
  const file = path.join(directory, "site-imports.db");
  assert.equal(captured.backfill({}).state, "cutover");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const shared = compose("shared");
  fs.writeFileSync(path.join(shared.directory, "site-imports.db"), "");
  fs.chmodSync(path.join(shared.directory, "site-imports.db"), 0o644);
  assert.throws(() => shared.captured.backfill({}), DAMAGED);
  const folder = compose("folder");
  fs.mkdirSync(path.join(folder.directory, "site-imports.db"), { mode: 0o700 });
  assert.throws(() => folder.captured.backfill({}), DAMAGED);
});

test("a candidate DB that fails its integrity check refuses the backfill as damaged history", async t => {
  const { compose } = await composed(t);
  const first = compose("corrupt");
  const importId = "00000000-0000-4000-8000-000000000001";
  fs.writeFileSync(path.join(first.directory, `${importId}.json`), JSON.stringify({ importId, principalId: "owner", requestId: "request-1", status: "needs-owner", source: { uploadId: importId }, displayName: "test", newSiteId: null, newSiteName: null, createdAt: new Date().toISOString(), expiresAt: Date.now() + 3_600_000 }));
  assert.equal(first.captured.backfill({}).state, "cutover");
  const file = path.join(first.directory, "site-imports.db");
  // Damage the imports table's page only: opening and migrating never read it, so only the integrity check can refuse.
  const reader = openNativeSqlite(file, { readonly: true });
  const page = reader.prepare<[], { rootpage: number }>("SELECT rootpage FROM sqlite_master WHERE name = 'imports'").get()!.rootpage;
  reader.close();
  const bytes = fs.readFileSync(file);
  const pageSize = bytes.readUInt16BE(16);
  bytes.fill(0x5a, (page - 1) * pageSize + 8, page * pageSize);
  fs.writeFileSync(file, bytes);
  assert.throws(() => compose("corrupt").captured.backfill({}), DAMAGED);
});

// Mutation: the composed `readJsonAt` (l.82) reads nothing (`({ kind: "missing" })`) -> a fresh backend cannot find the saved import.
test("a freshly composed backend reads an earlier import's record back from disk through the durable-JSON port", async t => {
  const { h, compose } = await composed(t);
  const first = compose("reload").backend;
  const pending = await first.importBackup({ principalId: "owner", source: await first.upload({ principalId: "owner", archive: h.archive }), requestId: "request-reload" });
  const read = compose("reload").backend.get({ principalId: "owner", importId: pending.importId });
  assert.deepEqual([read.importId, read.status, read.setupUrl], [pending.importId, "needs-owner", pending.setupUrl]);
});

// Mutation: the authority `log` (l.75) drops its message (`() => {}`) -> the rollback refusal is never reported.
test("under the shipped rollback policy an already-indexed history stays in use and the refused rollback is logged", async t => {
  const { h, compose } = await composed(t);
  const { captured, directory } = compose("indexed");
  const cutover = captured.backfill({});
  assert.equal(cutover.state, "cutover");
  if (cutover.state !== "cutover") return;
  // Any positive safe-integer time is a recorded first indexed write; the policy only checks `> 0`.
  fs.writeFileSync(path.join(directory, "import-index.state.json"), JSON.stringify({ schema: IMPORT_INDEX_STATE_SCHEMA, mode: "indexed", dbId: cutover.dbId, cutoverAt: cutover.cutoverAt, firstIndexedWriteAt: 1_800_000_000_000, legacyRetiredAt: 0 }), { mode: 0o600 });
  fs.writeFileSync(path.join(directory, ".history-indexed-v1"), "", { mode: 0o600 });
  const warn = t.mock.method(console, "warn", () => {});
  const backend = compose("indexed").backend;
  const pending = await backend.importBackup({ principalId: "owner", source: await backend.upload({ principalId: "owner", archive: h.archive }), requestId: "request-indexed" });
  assert.equal(pending.status, "needs-owner");
  const logged = warn.mock.calls.map(call => call.arguments);
  assert.deepEqual(new Set(logged.map(args => JSON.stringify(args))), new Set([JSON.stringify(["[site-backup]", "Rollback is not possible after the first indexed import write; the index-aware store stays in use."])]));
});
