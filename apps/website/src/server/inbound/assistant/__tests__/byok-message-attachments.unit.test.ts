import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { prepareByokMessageAttachments } from "../byok-message-attachments.js";

test("the BYOK route places prepared pixels only on the newest user message, reading the booted site's attachment directory", async () => {
  const source = ts.createSourceFile("assistant-byok.ts", readFileSync(new URL("../../../runtime/composition/modules/assistant-byok.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resolveTurnInputsOrRespond");
  assert.ok(declaration);
  const code = ts.transpileModule(`return (${declaration.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const calls: unknown[] = [];
  const images = [{ mimeType: "image/png", data: "iVBORw0KGgoB" }, { mimeType: "image/png", data: "iVBORw0KGgoC" }];
  const resolve = new Function("resolveMessages", "withPageContextBlock", "readRunPageContext", "getAuthedPrincipal", "prepareByokMessageAttachments", code)(
    (raw: unknown) => raw, ({ messages }: { messages: unknown }) => messages, () => undefined,
    () => ({ id: "alice" }), async (required: unknown) => { calls.push(required); return { images, notice: "" }; },
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
  }), { message: "Attachment is unavailable. Reattach it before sending." });
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
