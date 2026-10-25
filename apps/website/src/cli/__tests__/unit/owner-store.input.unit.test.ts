import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { runOwnerStoreCommand, type OwnerStoreAction } from "../../commands/owner-store.js";

/**
 * @file Negative tests for the owner-store stdin contract (lane F8: `cli/` was never mutation-run in
 * Stryker L14; the integration suite leaves 26 validation branches untested). Every malformed request
 * must fail closed with the FIXED `invalid-input` reply, set exit code 1, and never open owner.db
 * (`openStore` is a recording fake that throws if reached).
 */

const INVALID = { code: "invalid-input", message: "Provide a valid owner-store JSON request on stdin." };

function home(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-owner-input-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function run(t: TestContext, action: OwnerStoreAction, request: unknown, raw?: string) {
  const dir = home(t);
  const lines: string[] = [];
  const codes: number[] = [];
  let opened = 0;
  const text = raw ?? JSON.stringify(typeof request === "function" ? (request as (d: string) => unknown)(dir) : request);
  const reply = await runOwnerStoreCommand({ action }, {
    readRequest: async () => text,
    output: (line) => lines.push(line),
    setExitCode: (code) => codes.push(code),
    home: dir,
    openStore: (async () => { opened += 1; throw new Error("owner.db must not be opened for invalid input"); }) as never,
  });
  return { reply, lines, codes, opened };
}

async function assertRefused(t: TestContext, action: OwnerStoreAction, request: unknown, raw?: string): Promise<void> {
  const { reply, lines, codes, opened } = await run(t, action, request, raw);
  assert.deepEqual(reply, { version: 1, ok: false, action, error: INVALID }, `${action} ${raw ?? JSON.stringify(request)}`);
  assert.deepEqual(lines, [`${JSON.stringify(reply)}\n`]);
  assert.deepEqual(codes, [1]);
  assert.equal(opened, 0);
}

test("non-JSON, non-object and oversized stdin is refused with the fixed message (parser text never echoed)", async (t) => {
  for (const raw of ["", "{", "null", "[]", '"x"', "5", "true", `{"userDataDir":"${"a".repeat(64 * 1024)}"}`]) {
    await assertRefused(t, "status", undefined, raw);
  }
});

test("userDataDir must be an absolute, non-blank, NUL-free path with no '..' segment on either separator", async (t) => {
  for (const userDataDir of [undefined, 5, "", "   ", "relative/dir", "./x", "/tmp/a/../b", "/tmp/a\\..\\b", "/tmp/a\0b"]) {
    await assertRefused(t, "status", { userDataDir });
  }
});

test("unknown fields are refused per action before anything is opened (no smuggled options)", async (t) => {
  const cases: Array<[OwnerStoreAction, Record<string, unknown>]> = [
    ["status", { extra: 1 }],
    ["list", { entry: {} }],
    ["sync", { passphrase: "x" }],
    ["revoke", { entryId: "e", consumerId: "c" }],
    ["delete", { entryId: "e", expectedRevision: 1, force: true }],
    ["grant", { entryId: "e", consumerId: "/c", expectedRevision: 1 }],
    ["export", { filePath: "/f", passphrase: "p", entryId: "e" }],
    ["restore", { filePath: "/f", passphrase: "p", overwrite: true }],
    ["put", { entry: {}, entryId: "e" }],
  ];
  for (const [action, extra] of cases) await assertRefused(t, action, (dir: string) => ({ userDataDir: path.join(dir, "profile"), ...extra }));
});

test("a valid request reaches the store: the profile dir is created 0700 and owner.db/owner.key are inside it", async (t) => {
  const dir = home(t);
  const userDataDir = path.join(dir, "profile");
  const seen: Array<{ filePath: string; keyFilePath: string }> = [];
  const lines: string[] = [];
  const reply = await runOwnerStoreCommand({ action: "status" }, {
    readRequest: async () => JSON.stringify({ userDataDir }),
    output: (line) => lines.push(line),
    setExitCode: () => assert.fail("a successful status sets no exit code"),
    home: dir,
    openStore: (async (args: { filePath: string; keyFilePath: string }) => {
      seen.push(args);
      return { service: { list: async () => [1, 2], grants: async () => [1] }, close: async () => {} };
    }) as never,
  });
  assert.deepEqual(reply, { version: 1, ok: true, action: "status", data: { ready: true, entries: 2, grants: 1 } });
  assert.equal(seen[0]!.filePath, path.join(userDataDir, "owner.db"));
  assert.equal(seen[0]!.keyFilePath, path.join(userDataDir, "owner.key"));
  assert.equal(fs.statSync(userDataDir).mode & 0o777, 0o700);
  assert.deepEqual(lines, [`${JSON.stringify(reply)}\n`]);
});

test("an unexpected store failure is reported with the fixed operation-failed text, never the raw error", async (t) => {
  const dir = home(t);
  const reply = await runOwnerStoreCommand({ action: "list" }, {
    readRequest: async () => JSON.stringify({ userDataDir: path.join(dir, "p") }),
    output: () => {},
    setExitCode: () => {},
    home: dir,
    openStore: (async () => { throw new Error("SQLITE_CORRUPT at /secret/path token=abc"); }) as never,
  });
  assert.equal(reply.ok, false);
  assert.deepEqual(!reply.ok && reply.error, {
    code: "operation-failed",
    message: "The owner-store operation failed. Check the store, site key and backup passphrase before retrying.",
  });
});

/** Store fake that records writes; only reached when the outer request shape is valid. */
function putRun(t: TestContext, entry: unknown) {
  const dir = home(t);
  const puts: unknown[] = [];
  return runOwnerStoreCommand({ action: "put" }, {
    readRequest: async () => JSON.stringify({ userDataDir: path.join(dir, "p"), entry }),
    output: () => {},
    setExitCode: () => {},
    home: dir,
    openStore: (async () => ({ service: { put: async (input: unknown) => { puts.push(input); throw new Error("stop"); } }, close: async () => {} })) as never,
  }).then((reply) => ({ reply, puts }));
}

test("put: every entry-shape rule refuses with invalid-input and never writes", async (t) => {
  const good = { label: "Mail", provider: "resend", meta: { credentialType: "vendor" }, payload: { token: "x" }, expectedRevision: null };
  const bad: unknown[] = [
    null, [], "x",
    { ...good, extra: 1 },
    { ...good, kind: "personal" },
    { ...good, kind: "not-a-kind" },
    { ...good, label: "" },
    { ...good, label: 5 },
    { ...good, provider: "  " },
    { ...good, expectedRevision: 0 },
    { ...good, expectedRevision: 1.5 },
    { ...good, expectedRevision: "1" },
    { ...good, expectedRevision: 1 },
    { ...good, id: "" },
    { ...good, payload: [] },
    { ...good, meta: null },
    { ...good, meta: { credentialType: "custom" } },
  ];
  for (const entry of bad) {
    const { reply, puts } = await putRun(t, entry);
    assert.deepEqual(!reply.ok && reply.error, INVALID, JSON.stringify(entry));
    assert.deepEqual(puts, []);
  }
});

test("put: a credential-shaped label or provider is refused before any write", async (t) => {
  const good = { label: "Mail", provider: "resend", meta: { credentialType: "vendor" }, payload: {}, expectedRevision: null };
  for (const entry of [{ ...good, label: `ghp_${"a".repeat(36)}` }, { ...good, provider: "https://user:pw@host.example" }]) {
    const { reply, puts } = await putRun(t, entry);
    assert.equal(reply.ok, false, JSON.stringify(entry));
    assert.deepEqual(puts, []);
  }
});

test("put: a well-formed entry reaches the store with ownerKey 'tovu', no binding and kind defaulted to vendor", async (t) => {
  const { reply, puts } = await putRun(t, { id: "e1", expectedRevision: 3, label: "Mail", provider: "resend", meta: { credentialType: "vendor" }, payload: { token: "x" } });
  assert.equal(reply.ok, false, "the fake store throws after recording");
  assert.deepEqual(puts, [{ id: "e1", kind: "vendor", ownerKey: "tovu", binding: null, expectedRevision: 3, label: "Mail", provider: "resend", meta: { credentialType: "vendor" }, payload: { token: "x" } }]);
});

test("delete: entryId and a positive safe-integer expectedRevision are required", async (t) => {
  for (const extra of [{ entryId: "", expectedRevision: 1 }, { entryId: "e", expectedRevision: 0 }, { entryId: "e" }, { expectedRevision: 1 }]) {
    const dir = home(t);
    const reply = await runOwnerStoreCommand({ action: "delete" }, {
      readRequest: async () => JSON.stringify({ userDataDir: path.join(dir, "p"), ...extra }),
      output: () => {}, setExitCode: () => {}, home: dir,
      openStore: (async () => ({ service: { delete: async () => assert.fail("must not delete") }, close: async () => {} })) as never,
    });
    assert.deepEqual(!reply.ok && reply.error, INVALID, JSON.stringify(extra));
  }
});
