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
import { sendAdminFailure } from "../../system/site-share-errors.js";

test("the shared backup-route failure sender preserves typed disk refusals and their diagnosis", t => {
  t.mock.method(console, "error", () => {});
  const error = new DatabaseDiskSpaceError({ freeBytes: 0, requiredBytes: 50 * 1024 * 1024 });
  let actual: { status: number; body: unknown } | undefined;
  const res = { status(status: number) { return { json(body: unknown) { actual = { status, body }; } }; } };
  sendAdminFailure({ res, error }, { code: "BACKUP_FAILED", field: "message" });
  assert.equal(actual?.status, 507);
  const body = actual?.body as { code: string; message: string; errorId: string };
  assert.equal(body.code, "INSUFFICIENT_STORAGE");
  assert.equal(body.message, error.message);
  assert.match(body.errorId, /^[a-f0-9-]{36}$/);
});

test("disk budget refusal is HTTP 507 with its actionable typed message", t => {
  t.mock.method(console, "error", () => {});
  const err = new DatabaseDiskSpaceError({ freeBytes: 12 * 1024 * 1024, requiredBytes: 62 * 1024 * 1024 });
  const response = importErrorResponse(err);
  assert.match(response.body.errorId!, /^[a-f0-9-]{36}$/);
  assert.deepEqual(response, { status: 507, body: { error: err.message, code: "INSUFFICIENT_STORAGE", errorId: response.body.errorId } });
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
    const refusal = importErrorResponse(error);
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
    [new RestorePointUnavailableError("no restore point"), 409, "RESTORE_POINT_UNAVAILABLE"],
    [new PublishContentBundleNotFoundError("bundle gone"), 404, "BUNDLE_NOT_FOUND"],
  ];
  for (const [err, status, code] of cases) {
    assert.deepEqual(importErrorResponse(err), { status, body: { error: err.message, code } }, code);
  }
});

test("a plugin save-hook refusal mid-import is a 500 PLUGIN_HOOK_FAILED naming the plugin, like the posts routes", () => {
  const err = new PluginHookFailedError("seo", "plugin 'seo' filter failed: password=hunter2", { refusedItemRef: "post:p-2" });
  assert.deepEqual(importErrorResponse(err), {
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
  assertAdminResponse({ actual: importErrorResponse(err), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } });
  assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[routes/publish-content/import-errors]", diagnostics: [/SQLITE_CANTOPEN: unable to open \/srv\/tovu\/site.db/] });
  assert.equal(JSON.stringify(logged.mock.calls).includes("hunter2"), false);
});

test("a non-Error throw is a 500 with the generic message, logged the same way", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  assertAdminResponse({ actual: importErrorResponse("secret detail"), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } });
  assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[routes/publish-content/import-errors]", diagnostics: [/^secret detail$/] });
});
