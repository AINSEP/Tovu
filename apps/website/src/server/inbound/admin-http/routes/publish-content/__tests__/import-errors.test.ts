import { assertAdminDiagnostics, assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
/**
 * @file Coverage for `import-errors.ts`: each gateway/import error maps to its own HTTP status and
 * stable code with the error's own message; anything else is a 500 `INTERNAL_ERROR` with fixed text
 * (its message can carry a path, SQL or a credential) and the full error in the server log.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";

import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
import { PluginHookFailedError } from "#src/contracts/core/plugin-hook-failed-error";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { RestorePointUnavailableError } from "#src/features/publish-content/execute-import";
import { PublishContentBundleNotFoundError } from "#src/features/publish-content/gated-hooks";
import { importErrorResponse } from "../import-errors.js";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";

type Reply = { status: number; body: Record<string, unknown> };
function capturingResponse(): { res: { status(status: number): { json(body: unknown): void } }; replies: Reply[] } {
  const replies: Reply[] = [];
  return { replies, res: { status(status: number) { return { json(body: unknown) { replies.push({ status, body: body as Record<string, unknown> }); } }; } } };
}

// C115: a full disk is an owner-facing refusal with its own plain fix, not a server incident, so it
// is classified before anything is logged or reported, and carries no error ID that points nowhere.
test("the shared backup-route failure sender returns a typed disk refusal as a plain 507, with no incident logged or reported", t => {
  const logged = t.mock.method(console, "error", () => {});
  const tracked: unknown[] = [];
  const error = new DatabaseDiskSpaceError({ freeBytes: 0, requiredBytes: 50 * 1024 * 1024 });
  const { res, replies } = capturingResponse();
  sendAdminFailure({ res, error, tracker: { error: (...args: unknown[]) => { tracked.push(args); } } }, { code: "BACKUP_FAILED", field: "message" });
  assert.deepEqual(replies, [{ status: 507, body: { code: "INSUFFICIENT_STORAGE", message: error.message } }]);
  assert.equal(logged.mock.callCount(), 0, "no incident in the local log");
  assert.deepEqual(tracked, [], "no incident in the tracker");
});

for (const order of [["disk", "crash"], ["crash", "disk"]] as const) {
  test(`disk refusal and a real failure through the same sender (${order.join(" then ")}): only the real failure is an incident`, t => {
    const logged = t.mock.method(console, "error", () => {});
    const tracked: unknown[] = [];
    const tracker = { error: (...args: unknown[]) => { tracked.push(args); } };
    const { res, replies } = capturingResponse();
    const disk = new DatabaseDiskSpaceError({ freeBytes: 1024 * 1024, requiredBytes: 60 * 1024 * 1024 });
    for (const kind of order) sendAdminFailure({ res, error: kind === "disk" ? disk : new Error("database is locked"), tracker });
    const byKind = Object.fromEntries(order.map((kind, index) => [kind, replies[index]!]));
    assert.deepEqual(byKind.disk, { status: 507, body: { code: "INSUFFICIENT_STORAGE", error: disk.message } });
    assert.equal(byKind.crash!.status, 500);
    assert.match(String(byKind.crash!.body.errorId), /^ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/);
    assert.equal(logged.mock.callCount(), 1, "exactly one incident logged: the real failure");
    assert.equal(tracked.length, 1, "exactly one incident reported: the real failure");
    assert.match(JSON.stringify(logged.mock.calls[0]!.arguments), new RegExp(String(byKind.crash!.body.errorId)));
  });
}

test("disk budget refusal is HTTP 507 with its actionable typed message and no incident", t => {
  const logged = t.mock.method(console, "error", () => {});
  const err = new DatabaseDiskSpaceError({ freeBytes: 12 * 1024 * 1024, requiredBytes: 62 * 1024 * 1024 });
  const response = importErrorResponse({ err });
  assert.deepEqual(response, { status: 507, body: { error: err.message, code: "INSUFFICIENT_STORAGE" } });
  assert.equal(logged.mock.callCount(), 0);
});

test("the real pre-publish SQLite capture reaches HTTP 507 before writing, including a separate destination folder", async t => {
  t.mock.method(console, "error", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-disk-budget-"));
  const filePath = path.join(dir, "content.db");
  const db = openContentDb(filePath);
  t.after(() => { db.$client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const directory = path.join(dir, "copies");
  fs.mkdirSync(directory);
  const space = await fsp.statfs(directory);
  const probe = t.mock.method(fsp, "statfs", async () => ({ ...space, bavail: 0 }));
  const adapter = new SqliteDbOpsAdapter({ db, filePath });
  await assert.rejects(adapter.captureRestorePoint({ scopeId: "s" }, { directory }), error => {
    const refusal = importErrorResponse({ err: error });
    assert.equal(refusal.status, 507);
    assert.equal(refusal.body.code, "INSUFFICIENT_STORAGE");
    assert.match(refusal.body.error, /disk is almost full \(0 MB free, needs \d+ MB\)/);
    return true;
  });
  assert.equal(probe.mock.calls[0]?.arguments[0], directory);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("each known import error maps to its status and code, keeping its message", () => {
  const cases: Array<[Error, number, string]> = [
    [new ForbiddenError({ message: "not allowed", reasonCode: "NOT_AUTHORIZED" }), 403, "NOT_AUTHORIZED"],
    [new PlanStaleError({ message: "plan changed" }), 409, "PLAN_STALE"],
    [new TokenExpiredError({ message: "token expired" }), 409, "TOKEN_EXPIRED"],
    [new TokenAlreadyRedeemedError({ message: "token used" }), 409, "TOKEN_ALREADY_REDEEMED"],
    [new RestorePointUnavailableError({ message: "no restore point" }), 409, "RESTORE_POINT_UNAVAILABLE"],
    [new PublishContentBundleNotFoundError({ message: "bundle gone" }), 404, "BUNDLE_NOT_FOUND"],
  ];
  for (const [err, status, code] of cases) {
    assert.deepEqual(importErrorResponse({ err }), { status, body: { error: err.message, code } }, code);
  }
});

test("a plugin save-hook refusal mid-import is a 500 PLUGIN_HOOK_FAILED naming the plugin, like the posts routes", () => {
  const err = new PluginHookFailedError("seo", "plugin 'seo' filter failed: password=hunter2", { refusedItemRef: "post:p-2" });
  assert.deepEqual(importErrorResponse({ err }), {
    status: 500,
    body: {
      error: "a site plugin (seo) refused item post:p-2; items applied before it stay saved, so check the import history before retrying",
      code: "PLUGIN_HOOK_FAILED",
      pluginId: "seo",
    },
  });
});

test("an unrecognised error is a 500 with fixed text; its own message goes only to the server log", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  const err = new Error("SQLITE_CANTOPEN: unable to open /srv/tovu/site.db (password=hunter2)");
  assertAdminResponse({ actual: importErrorResponse({ err }), expected: { status: 500, body: { error: "The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"publishing operation"} });
  assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[routes/publish-content/import-errors]", diagnostics: [/SQLITE_CANTOPEN: unable to open \/srv\/tovu\/site.db/] });
  assert.equal(JSON.stringify(logged.mock.calls).includes("hunter2"), false);
});

test("a non-Error throw is a 500 with the generic message, logged the same way", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  assertAdminResponse({ actual: importErrorResponse({ err: "secret detail" }), expected: { status: 500, body: { error: "The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"publishing operation"} });
  assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[routes/publish-content/import-errors]", diagnostics: [/^secret detail$/] });
});

test("an explicit 503 override preserves default 507 behavior for other admin callers", t => {
  t.mock.method(console, "error", () => {});
  const error = new DatabaseDiskSpaceError({ freeBytes: 0, requiredBytes: 100 });
  let reply: { status: number; body: unknown } | undefined;
  const res = { status(status: number) { return { json(body: unknown) { reply = { status, body }; } }; } };
  sendAdminFailure({ res, error }, { status: 503, code: "CONSENT_UNAVAILABLE", message: "Published enforcement remains in place." });
  assert.equal(reply?.status, 503);
  assert.equal((reply?.body as { code: string }).code, "CONSENT_UNAVAILABLE");
  sendAdminFailure({ res, error });
  assert.equal(reply?.status, 507);
});
