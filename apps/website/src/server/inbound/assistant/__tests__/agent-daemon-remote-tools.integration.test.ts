/** ADR-070: server tools must resolve uploads through the live daemon-owned store. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import ts from "typescript";
import { createDiskAttachmentStore, createRemoteAttachmentLookup } from "@jini-ai/daemon/http";
import { createRunScopedCredentials, registerDaemonAttachmentLookup } from "#src/assistant/daemon-access";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { daemonFunction, daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/** Execute the real entry's lookup registration without booting its databases or agent CLIs. */
async function bootAttachmentOwner(t: import("node:test").TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "daemon-attachment-owner-"));
  const store = await createDiskAttachmentStore({ uploadDirectory: directory }, { retainAcrossRestarts: true });
  t.after(async () => { await store.dispose(); await rm(directory, { recursive: true, force: true }); });
  const statements = daemonFunction("start").body!.statements;
  const registration = statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(daemonSource) === "registerDaemonAttachmentLookup");
  assert.ok(registration, "the daemon must mount its authenticated attachment lookup after creating its store");
  const storeAssignment = statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isBinaryExpression(statement.expression)
    && statement.expression.left.getText(daemonSource) === "attachmentStore");
  assert.ok(storeAssignment);
  assert.ok(statements.indexOf(storeAssignment) < statements.indexOf(registration), "lookup must capture the initialized store");
  const app = express();
  const token = "attachment-owner-test-token";
  await evaluateDaemonStatements([registration], {
    app, attachmentStore: store,
    // Keep the production gate and inject only the boot secret, never a substitute registrar.
    registerDaemonAttachmentLookup: (required: Parameters<typeof registerDaemonAttachmentLookup>[0]) =>
      registerDaemonAttachmentLookup(required, { env: { TOVU_AGENT_DAEMON_TOKEN: token } }),
  });
  const baseUrl = await startTestServer(app, t);
  return { store, token, baseUrl };
}

test("post-boot uploaded attachment resolves through the daemon owner", async t => {
  const { store, token, baseUrl } = await bootAttachmentOwner(t);
  const lookup = createRemoteAttachmentLookup({ baseUrl, token });
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "owner" }), []);
  // Upload AFTER mounting the route. A boot-time copy of the store's records would miss this.
  const batchId = "post-boot";
  const directory = await store.createBatchDirectory({ batchId });
  const filePath = path.join(directory, "after-boot.txt");
  await writeFile(filePath, "after boot", { mode: 0o600 });
  const uploaded = await store.register({ input: {
    batchId, path: filePath, name: "after-boot.txt", kind: "file", size: 10, ownerId: "owner",
  } });
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "other-owner" }), []);
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "owner" }), await store.listPendingForOwner({ ownerId: "owner" }));
  const resolved = await lookup.resolveForRun({ ref: uploaded.path, runId: "owning-run" });
  assert.ok(resolved);
  assert.equal(await readFile(resolved.path, "utf8"), "after boot");
  assert.deepEqual(resolved, await store.resolveForRun({ ref: uploaded.path, runId: "owning-run" }));
  await assert.rejects(lookup.resolveForRun({ ref: uploaded.path, runId: "other-run" }), /claimed/);
});

test("attachment lookup refuses missing and run-scoped credentials before parsing", async t => {
  const { baseUrl } = await bootAttachmentOwner(t);
  const credentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => runId === "owning-run" ? "owner" : undefined }, {});
  const runToken = credentials.mint({ runId: "owning-run" }, {});
  assert.ok(credentials.resolveCaller({ token: runToken }), "the negative probe carries a valid live-run credential");
  for (const authorization of [undefined, `Bearer ${runToken}`]) {
    const response = await fetch(`${baseUrl}/internal/attachment-lookup`, {
      method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: "{invalid-json",
    });
    assert.equal(response.status, 401);
  }
});
