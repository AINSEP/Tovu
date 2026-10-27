import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createRemoteToolExecutor } from "@jini-ai/daemon";
import { createRouteDeps } from "../../app.js";
import { createAssistantByokModule } from "../assistant-byok.js";
import { createDaemonApprovalMemory, createDaemonAwareInstallAttachmentReader } from "../assistant-tool-exec.js";
import { runWithDaemonCallContext } from "../../../../../assistant/daemon-call-context.js";
import { ensureToolExecToken } from "../../../../../assistant/daemon-access.js";

/**
 * @file The daemon-call adapters `assistant-tool-exec.ts` composes into the BYOK surface. Each must
 * act only inside a daemon call (`runWithDaemonCallContext`) and leave a BYOK turn exactly as before.
 */

test("the chat-attachment tools read the daemon's store over the lookup, and only inside a daemon call", async (t) => {
  const deps = createRouteDeps();
  const ownerId = await deps.ownerPrincipalId;
  const lookups: unknown[] = [];
  const attachmentLookup = {
    resolveForRun: async () => undefined,
    listPendingForOwner: async (required: { ownerId: string }, optional: { runId?: string } = {}) => {
      lookups.push({ ...required, ...optional });
      return [{ ref: "attachment:pending-1", name: "notes.txt", kind: "file", size: 3, createdAt: 1 }];
    },
  };
  const module = createAssistantByokModule(deps, undefined, { attachmentLookup: attachmentLookup as never });
  const app = express();
  const router = express.Router();
  app.use(router);
  module.registerToolExecRoutes({ router });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const remote = createRemoteToolExecutor({ baseUrl, token: ensureToolExecToken({}, {}) }, { contextFor: () => ({ attachmentRefs: ["attachment:pending-1"] }) });
  const call = { principal: { id: ownerId }, run: { id: "att-run" }, toolId: "chat_list_pending_attachments", input: {} };

  const viaDaemon = await remote.execute(call);
  assert.equal(viaDaemon.status, "completed");
  assert.match(JSON.stringify(viaDaemon), /attachment:pending-1/);
  assert.deepEqual(lookups, [{ ownerId, runId: "att-run" }]);

  await module.toolSurface.executor.execute(call);
  assert.equal(lookups.length, 1, "a BYOK (non-daemon) call must never reach the daemon's store");
});

test("approval memory reads and grants against the daemon's conversation, and is inert outside a daemon call", async () => {
  const calls: Array<{ op: string; conversationId?: string }> = [];
  const store = {
    hasIdentity: async () => { calls.push({ op: "has" }); return true; },
    grant: async (coordinates: { conversationId: string }) => { calls.push({ op: "grant", conversationId: coordinates.conversationId }); },
  };
  const memory = createDaemonApprovalMemory({ store: store as never, workspaceId: "ws", clock: { nowMs: () => 0 } as never });
  const principal = { id: "owner-1" };
  const input = { ctx: { principal, run: { id: "run-1" } }, key: "k", confirmer: principal } as never;

  assert.equal(await memory.has(input), false);
  await memory.grant(input);
  assert.deepEqual(calls, []);

  await runWithDaemonCallContext({ context: { conversationId: "conv-1" }, fn: async () => {
    assert.equal(await memory.has(input), true);
    await memory.grant(input);
  } });
  assert.deepEqual(calls, [{ op: "has" }, { op: "grant", conversationId: "conv-1" }]);
});

test("plugin-install attachments: a daemon call reads only its message refs; a BYOK turn reads by owner", async (t) => {
  const uploadDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "daemon-install-attachment-")));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const ref = "attachment:12345678-1234-1234-1234-123456789012", batchId = "batch-12345678";
  const filePath = path.join(uploadDirectory, batchId, "plugin.zip");
  await mkdir(path.dirname(filePath)); await mkdir(path.join(uploadDirectory, ".records"));
  await writeFile(filePath, "zip bytes");
  const info = await lstat(filePath);
  await writeFile(path.join(uploadDirectory, ".records", "attachment_12345678-1234-1234-1234-123456789012.json"), JSON.stringify({
    id: ref, batchId, filePath, name: "plugin.zip", kind: "file", size: info.size, dev: info.dev, ino: info.ino, createdAt: 1, ownerId: "owner",
  }));
  const read = createDaemonAwareInstallAttachmentReader({ uploadDirectory });
  const required = { ref, ownerId: "owner", runId: "run-1" };
  const limits = { maxBytes: 1024 };

  assert.equal((await read(required, limits)).ok, true, "BYOK: owner-scoped, no message binding");
  assert.deepEqual(await runWithDaemonCallContext({ context: { attachmentRefs: [] }, fn: () => read(required, limits) }), { ok: false, refusal: "no-record" });
  assert.equal((await runWithDaemonCallContext({ context: { attachmentRefs: [ref] }, fn: () => read(required, limits) })).ok, true);
});
