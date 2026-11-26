import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { AttachmentUnavailableError, prepareByokMessageAttachments } from "../byok-message-attachments.js";
import { readPickedFolders } from "#src/assistant/run-page-context";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { createDiskAttachmentStore } from "@jini-ai/daemon/http";
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
  const source = ts.createSourceFile("assistant-byok.ts", readFileSync(new URL("../../../runtime/composition/modules/assistant-byok.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "attachTurnMessagesOrRespond");
  assert.ok(declaration, "the attachment handler exists");
  const code = ts.transpileModule(`return (${declaration.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  async function attempt(error: Error) {
    const attach = new Function("prepareByokMessageAttachments", "AttachmentUnavailableError", "sendAdminFailure", code)(async () => { throw error; }, AttachmentUnavailableError, sendAdminFailure);
    let status = 200; let body: unknown;
    const res = { locals: { principal: { id: "owner" } }, status(value: number) { status = value; return res; }, json(value: unknown) { body = value; return res; } };
    const result = await attach({ attachmentIds: ["ref"], messages: [{ role: "user", content: "PRIVATE_BODY" }], principalId: "owner", routeDeps: { siteStoragePaths: { chatAttachmentsDir: "/tmp" } }, res });
    assert.equal(result, false);
    return { status, body };
  }
  const refusal = await attempt(new AttachmentUnavailableError("Attachment is unavailable. Reattach it before sending."));
  assert.equal(refusal.status, 400);
  assert.deepEqual(refusal.body, { error: "Attachment is unavailable. Reattach it before sending.", code: "VALIDATION_ERROR" });
  assert.equal(logs.length, 0);
  const failure = await attempt(new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"));
  assert.equal(failure.status, 500);
  assert.ok(failure.body && typeof failure.body === "object" && "errorId" in failure.body && "error" in failure.body);
  assert.match(String(failure.body.error), /The attachment could not be prepared/);
  const entry = logs.find(args => args[0] === "[assistant-byok:attachments]");
  assert.ok(entry, "the attachment failure is reported");
  const detail = entry[1] as { errorId: string; diagnostic: string };
  assert.equal(detail.errorId, failure.body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /byok-message-attachments\.unit\.test\.ts/);
  assert.doesNotMatch(JSON.stringify({ body: failure.body, logs }), /SECRETSECRETSECRETSECRET|PRIVATE_BODY/);
});

test("the BYOK route places prepared pixels only on the newest user message, reading the booted site's attachment directory", async () => {
  const source = ts.createSourceFile("assistant-byok.ts", readFileSync(new URL("../../../runtime/composition/modules/assistant-byok.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resolveTurnInputsOrRespond");
  assert.ok(declaration);
  // why: 540014db (complexity <=10) moved the attachment step into attachTurnMessagesOrRespond(),
  // which resolveTurnInputsOrRespond() awaits; both real declarations are evaluated together.
  const attach = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "attachTurnMessagesOrRespond");
  assert.ok(attach);
  const code = ts.transpileModule(`${attach.getText(source)}\nreturn (${declaration.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const calls: unknown[] = [];
  const images = [{ mimeType: "image/png", data: "iVBORw0KGgoB" }, { mimeType: "image/png", data: "iVBORw0KGgoC" }];
  // why: 40ea6e547 made the turn validate picked folders first; the real reader is injected, so an
  // absent `folders` still resolves to none rather than the harness failing on an unbound name.
  const resolve = new Function("resolveMessages", "withPageContextBlock", "readRunPageContext", "getAuthedPrincipal", "prepareByokMessageAttachments", "readPickedFolders", code)(
    // why: the (required, optional) argument rule made the real call `resolveMessages({ raw })`.
    ({ raw }: { raw: unknown }) => raw, ({ messages }: { messages: unknown }) => messages, () => undefined,
    () => ({ id: "alice" }), async (required: unknown) => { calls.push(required); return { images, notice: "" }; }, readPickedFolders,
  );
  const messages = [{ role: "user", content: "old question" }, { role: "assistant", content: "old answer" }, { role: "user", content: "colours?" }];
  // The directory comes from the booted `RouteDeps.siteStoragePaths`, never from env/`siteDir()`
  // (hardwiring audit #19): the old code passed no directory and resolved one from env per request.
  const routeDeps = { workspaceId: "ws", siteStoragePaths: { chatAttachmentsDir: "/booted-site/uploads/chat-attachments" } };
  const result = await resolve({ body: { messages, attachmentIds: ["green", "yellow"] } }, {}, { resolve: async () => ({ model: "vision" }) }, routeDeps);
  assert.deepEqual(calls, [{ refs: ["green", "yellow"], principalId: "alice", uploadDirectory: "/booted-site/uploads/chat-attachments" }]);
  assert.deepEqual(result.messages, [...messages.slice(0, -1), { role: "user", content: "colours?", images }]);
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
