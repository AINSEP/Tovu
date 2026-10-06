import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { prepareByokMessageAttachments } from "../byok-message-attachments.js";

test("the BYOK route places prepared pixels only on the newest user message", async () => {
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
  const result = await resolve({ body: { messages, attachmentIds: ["green", "yellow"] } }, {}, { resolve: async () => ({ model: "vision" }) }, { workspaceId: "ws" });
  assert.deepEqual(calls, [{ refs: ["green", "yellow"], principalId: "alice" }]);
  assert.deepEqual(result.messages, [...messages.slice(0, -1), { role: "user", content: "colours?", images }]);
});

test("BYOK reads only this message's refs as the authenticated owner and delivers exact pixels", async () => {
  const calls: unknown[] = [];
  const prepared = await prepareByokMessageAttachments({ refs: ["green", "yellow"], principalId: "alice" }, {
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
  await assert.rejects(prepareByokMessageAttachments({ refs: ["foreign"], principalId: "alice" }, {
    read: async () => ({ ok: false, refusal: "not-owner" }),
  }), { message: "Attachment is unavailable. Reattach it before sending." });
});
