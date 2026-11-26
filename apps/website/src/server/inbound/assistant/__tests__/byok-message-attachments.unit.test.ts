import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import ts from "typescript";
import { AttachmentUnavailableError, prepareByokMessageAttachments } from "../byok-message-attachments.js";
import { createByokToolSurface } from "#src/assistant/index";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { createDiskAttachmentStore } from "@jini-ai/daemon/http";
import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { BYOK_TURN_PATH, createAssistantByokModule } from "#src/server/runtime/composition/modules/assistant-byok";
import { readOwnerChatAttachment } from "#src/features/media/chat-attachment-reader-host";

test("BYOK sniffs a video prefix without hydrating it and delivers full PNG pixels", async t => {
  const uploadDirectory = await mkdtemp(path.join(tmpdir(), "byok-prefix-"));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const store = await createDiskAttachmentStore({ uploadDirectory }, { retainAcrossRestarts: true });
  const directory = await store.createBatchDirectory({ batchId: "batch-prefix" }, {});
  const video = Buffer.alloc(128 * 1024);
  Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]).copy(video);
  const png = Buffer.from("iVBORw0KGgoB", "base64"), refs: string[] = [];
  for (const [name, bytes] of [["clip.mov", video], ["pixel.png", png]] as const) {
    const filePath = path.join(directory, name);
    await writeFile(filePath, bytes);
    const stored = await store.register({ input: { batchId: "batch-prefix", path: filePath, name, kind: "file", size: bytes.length, ownerId: "alice" } }, {});
    refs.push(stored.path);
  }
  const fullReads: string[] = [];
  const prepared = await prepareByokMessageAttachments({ refs, principalId: "alice", uploadDirectory }, {
    read: (input, options) => readOwnerChatAttachment({ uploadDirectory, ...input }, { ...options, openFile: async (filePath, flags) => {
      const handle = await open(filePath, flags);
      return {
        stat: () => handle.stat(), read: options => { assert.equal(options.position, 0); assert.ok(options.length <= 64 * 1024); return handle.read(options); },
        readFile: async () => { assert.equal(path.basename(filePath), "pixel.png", "video payload must not be hydrated"); fullReads.push(filePath); return handle.readFile(); },
        close: () => handle.close(),
      };
    } }),
  });
  assert.match(prepared.notice, /video attachments are unsupported by this runtime/);
  assert.deepEqual(prepared.images, [{ mimeType: "image/png", data: png.toString("base64") }]);
  assert.deepEqual(fullReads.map(filePath => path.basename(filePath)), ["pixel.png"]);
});

test("BYOK attachment refusals stay 400 while preparation faults become redacted incidents", async (t) => {
  const source = ts.createSourceFile("assistant-byok-preflight.ts", readFileSync(new URL("../../../runtime/composition/modules/assistant-byok-preflight.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "attachTurnMessagesOrRespond");
  assert.ok(declaration, "the attachment handler exists");
  const reader = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "readAttachmentRefs");
  assert.ok(reader);
  const code = ts.transpileModule(`${reader.getText(source)}\nreturn (${declaration.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const { reporter, records, reports } = recordingComposedReporter();
  async function attempt(error: Error) {
    const attach = new Function("prepareByokMessageAttachments", "AttachmentUnavailableError", "sendAdminFailure", code)(async () => { throw error; }, AttachmentUnavailableError, sendAdminFailure);
    let status = 200; let body: unknown;
    const res = { locals: { principal: { id: "owner" } }, status(value: number) { status = value; return res; }, json(value: unknown) { body = value; return res; } };
    const result = await attach({ attachmentIds: ["ref"], messages: [{ role: "user", content: "PRIVATE_BODY" }], principalId: "owner", routeDeps: { siteStoragePaths: { chatAttachmentsDir: "/tmp" } }, res, reporter });
    assert.equal(result, false);
    return { status, body };
  }
  const refusal = await attempt(new AttachmentUnavailableError("Attachment is unavailable. Reattach it before sending."));
  assert.equal(refusal.status, 400);
  assert.deepEqual(refusal.body, { error: "Attachment is unavailable. Reattach it before sending.", code: "VALIDATION_ERROR" });
  assert.equal(records.length, 0);
  assert.equal(reports.length, 0);
  const failure = await attempt(new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"));
  assert.equal(failure.status, 500);
  assert.ok(failure.body && typeof failure.body === "object" && "errorId" in failure.body && "error" in failure.body);
  assert.match(String(failure.body.error), /The attachment could not be prepared/);
  assert.equal(records.length, 1);
  assert.equal(reports.length, 1);
  const detail = (records[0]![1] as { meta: { errorId: string; diagnostic: string } }).meta;
  assert.equal(detail.errorId, failure.body.errorId);
  assert.equal((reports[0]![1] as { context: { attributes: { incidentId: string } } }).context.attributes.incidentId, failure.body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /byok-message-attachments\.unit\.test\.ts/);
  assert.doesNotMatch(JSON.stringify({ body: failure.body, records, reports }), /SECRETSECRETSECRETSECRET|PRIVATE_BODY/);
});

test("the BYOK route places prepared pixels only on the newest user message, reading the booted site's attachment directory", async t => {
  const chatAttachmentsDir = await realpath(await mkdtemp(path.join(tmpdir(), "byok-route-attachments-")));
  t.after(() => rm(chatAttachmentsDir, { recursive: true, force: true }));
  const base = createRouteDeps();
  // The directory comes from the booted `RouteDeps.siteStoragePaths`, never from env/`siteDir()`
  // (hardwiring audit #19): the old code passed no directory and resolved one from env per request.
  const deps = { ...base, siteStoragePaths: { ...base.siteStoragePaths, chatAttachmentsDir } };
  const { errors } = createRouteIncidentReporter();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors });
  const toolSurface = createByokToolSurface({ ...deps, reporter: errors.reporter }, { installExtensions: false });
  createAssistantByokModule({ routeDeps: deps, reporter: errors.reporter }, { toolSurface }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const ownerId = await deps.ownerPrincipalId;
  const store = await createDiskAttachmentStore({ uploadDirectory: deps.siteStoragePaths.chatAttachmentsDir }, { retainAcrossRestarts: true });
  const batchId = "batch-colours";
  const directory = await store.createBatchDirectory({ batchId }, {});
  const attachmentIds: string[] = [];
  for (const [name, data] of [["green.png", "iVBORw0KGgoB"], ["yellow.png", "iVBORw0KGgoC"]] as const) {
    const bytes = Buffer.from(data, "base64"), filePath = path.join(directory, name);
    await writeFile(filePath, bytes);
    const stored = await store.register({ input: { batchId, path: filePath, name, kind: "image", size: bytes.length, ownerId } }, {});
    attachmentIds.push(stored.path);
  }
  const calls: unknown[] = [];
  const providerUrl = await startStubProviderServer(t, (_count, body, { method, url }) => {
    calls.push({ method, url, messages: body.messages });
    return { status: 200, body: 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' };
  });
  const messages = [{ role: "user", content: "old question" }, { role: "assistant", content: "old answer" }, { role: "user", content: "colours?" }];
  const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages, attachmentIds, byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl },
  }) });
  assert.equal(response.status, 200);
  await response.text();
  assert.deepEqual(calls, [{ method: "POST", url: "/v1/messages", messages: [...messages.slice(0, -1), { role: "user", content: [
    { type: "text", text: "colours?" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgoB" } },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgoC" } },
  ] }] }]);
});

test("BYOK reads only this message's refs as the authenticated owner and delivers exact pixels", async () => {
  const calls: unknown[] = [];
  const prepared = await prepareByokMessageAttachments({ refs: ["green", "yellow"], principalId: "alice", uploadDirectory: "/unused" }, {
    read: async ({ ref, ownerId }) => {
      calls.push({ ref, ownerId });
      return { ok: true, bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, ref === "green" ? 1 : 2) };
    },
  });
  assert.deepEqual(calls, [{ ref: "green", ownerId: "alice" }, { ref: "yellow", ownerId: "alice" }]);
  assert.deepEqual(prepared.images, [
    { mimeType: "image/png", data: "iVBORw0KGgoB" },
    { mimeType: "image/png", data: "iVBORw0KGgoC" },
  ]);
  assert.equal(prepared.notice, "");
});

test("BYOK refuses unreadable or foreign image refs instead of producing a name-only answer", async () => {
  await assert.rejects(prepareByokMessageAttachments({ refs: ["foreign"], principalId: "alice", uploadDirectory: "/unused" }, {
    read: async () => ({ ok: false, refusal: "not-owner" }),
  }), (error: unknown) => error instanceof AttachmentUnavailableError && error.message === "Attachment is unavailable. Reattach it before sending.");
});

test("BYOK's default reader reads the injected upload directory, not the env/cwd site", async t => {
  // Staged ONLY under the injected directory: the old code ignored the booted site and resolved
  // `TOVU_CONTENT_DB ?? siteDir()` per request (hardwiring audit #19), where this record does not exist.
  const uploadDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "byok-booted-site-")));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const ref = "attachment:12345678-1234-1234-1234-123456789012", batchId = "batch-12345678";
  const filePath = path.join(uploadDirectory, batchId, "green.png");
  await mkdir(path.dirname(filePath)); await mkdir(path.join(uploadDirectory, ".records"));
  await writeFile(filePath, Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 1));
  const info = await lstat(filePath);
  await writeFile(path.join(uploadDirectory, ".records", "attachment_12345678-1234-1234-1234-123456789012.json"), JSON.stringify({
    id: ref, batchId, filePath, name: "green.png", kind: "image", size: info.size, dev: info.dev, ino: info.ino, createdAt: 1, ownerId: "alice",
  }));
  const prepared = await prepareByokMessageAttachments({ refs: [ref], principalId: "alice", uploadDirectory }, {});
  assert.deepEqual(prepared.images, [{ mimeType: "image/png", data: "iVBORw0KGgoB" }]);
});
