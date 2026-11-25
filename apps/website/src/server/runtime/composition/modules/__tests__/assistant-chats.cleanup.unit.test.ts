import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { createChatBulkDeletion } from "@jini-ai/chat/store/sqlite";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import type { ChatOwnerScope } from "@jini-ai/chat/store";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { chatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "#src/assistant/persistence/chat-history-store";
import { adminSameOriginWrites, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { mountChatCleanup, ownerFromSession } from "../assistant-chats.js";

const WS = "ws";
const BASE = "/api/assistant/chats";

/** A real `chat.db`, the real Jini routes behind the real admin ports, and a stand-in for
 * `requireAdminSession` that sets the session principal from a header. */
async function harness() {
  const kernel = chatKernel({ store: openChatDb({ filePath: ":memory:" }) });
  let clock = 1_000;
  const storeOf = (scope: ChatOwnerScope) => createChatHistoryStore({ kernel, scope }, { now: () => clock });
  const app = express();
  app.use(express.json());
  app.use(BASE, (req, res, next) => { res.locals.principal = { id: String(req.headers["x-test-principal"] ?? "alice") }; next(); });
  mountChatCleanup({
    app,
    ownerStoreFor: ({ scope, openConversations }) => ({ store: storeOf(scope), bulkDeletion: createChatBulkDeletion({ kernel, scope, now: () => clock, openConversations }) }),
    ownerCheck: ({ context }) => ownerFromSession({ context, workspaceId: WS }),
    openConversations: async () => new Set<string>(),
    previewStore: createCleanupPreviewStore({ randomToken: () => crypto.randomUUID(), mono: () => clock }),
    adminPorts: { mount: mountAdminJsonRoute, deps: { workspaceId: WS, authorize: (() => ({ ok: true })) as never }, origin: adminSameOriginWrites },
  });
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body: unknown, { principal = "alice", sameOrigin = true } = {}) => {
    const res = await fetch(origin + BASE + path, { method, headers: { "content-type": "application/json", "x-test-principal": principal, ...(sameOrigin ? { origin } : { origin: "https://evil.example" }) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) as Record<string, any> | null };
  };
  const own = (ownerId: string) => storeOf({ scopeId: WS, ownerKind: "user", ownerId });
  return { call, own, advance: (ms: number) => { clock += ms; }, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("rename still works with no pinned field", async () => {
  const h = await harness();
  try {
    await h.own("alice").create({ id: "c1" });
    const renamed = await h.call("PATCH", "/c1", { title: "  Launch plan  " });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body?.conversation.title, "Launch plan");
    assert.equal(renamed.body?.conversation.id, "c1");
    const invalid = await h.call("PATCH", "/c1", { title: "   " });
    assert.deepEqual(invalid, { status: 400, body: { error: "'title' must be a non-empty string", code: "VALIDATION_ERROR" } });
    const pinned = await h.call("PATCH", "/c1", { title: "Pinned plan", pinned: true });
    assert.equal(pinned.status, 200);
    assert.equal(pinned.body?.conversation.title, "Pinned plan");
    assert.equal(pinned.body?.conversation.pinned, true, "pin and rename land together");
    assert.equal("pinned" in (renamed.body?.conversation ?? {}), false, "a plain rename does not pin");
  } finally { await h.close(); }
});

test("generated title does not override a manual rename", async () => {
  const h = await harness();
  try {
    await h.own("alice").create({ id: "c1" });
    assert.equal((await h.call("PATCH", "/c1", { title: "Mine" })).status, 200);
    const generated = await h.call("PATCH", "/c1", { title: "Model guess", source: "generated" });
    assert.equal(generated.status, 200);
    assert.equal(generated.body?.conversation.title, "Mine");
  } finally { await h.close(); }
});

test("wire owner and CSRF checks: unowned id is a plain 404 and cross-origin writes are refused", async () => {
  const h = await harness();
  try {
    await h.own("bob").create({ id: "bobs" });
    const foreign = await h.call("PATCH", "/bobs", { title: "Taken", pinned: true });
    const missing = await h.call("PATCH", "/nope", { title: "Taken" });
    assert.deepEqual(foreign, { status: 404, body: { error: "not found" } });
    assert.deepEqual(missing, foreign, "an unowned id answers exactly like a missing one");
    assert.equal((await h.own("bob").get({ id: "bobs" }))?.title ?? "", "");
    for (const [method, path, body] of [["PATCH", "/bobs", { title: "x" }], ["POST", "/cleanup/preview", { before: 5 }], ["POST", "/cleanup/apply", { previewToken: "t", confirm: true }], ["POST", "/delete-selected", { ids: ["bobs"], confirm: true }]] as const) {
      const refused = await h.call(method, path, body, { principal: "bob", sameOrigin: false });
      assert.equal(refused.status, 403, `${method} ${path} must require same origin`);
    }
    assert.ok(await h.own("bob").get({ id: "bobs" }), "nothing was deleted by a cross-origin request");
  } finally { await h.close(); }
});

test("body/query owner and workspace spoofing ignored", async () => {
  const h = await harness();
  try {
    await h.own("bob").create({ id: "bobs" });
    await h.own("alice").create({ id: "alices" });
    h.advance(10_000);
    const spoof = { ownerId: "bob", workspaceId: WS, scope: { scopeId: WS, ownerKind: "user", ownerId: "bob" } };
    const preview = await h.call("POST", "/cleanup/preview?ownerId=bob&workspaceId=other", { before: 5_000, ...spoof });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body?.ids, ["alices"], "preview only ever sees the session owner's chats");
    const selected = await h.call("POST", "/delete-selected?ownerId=bob", { ids: ["bobs"], confirm: true, ...spoof });
    assert.equal(selected.status, 200);
    assert.deepEqual(selected.body?.deleted, []);
    assert.ok(await h.own("bob").get({ id: "bobs" }), "another owner's chat survives a spoofed owner");
    const patched = await h.call("PATCH", "/bobs?ownerId=bob", { title: "Mine now", ...spoof });
    assert.deepEqual(patched, { status: 404, body: { error: "not found" } });
  } finally { await h.close(); }
});

test("delete-selected without confirm is refused", async () => {
  const h = await harness();
  try {
    await h.own("alice").create({ id: "c1" });
    const refused = await h.call("POST", "/delete-selected", { ids: ["c1"] });
    assert.equal(refused.status, 400);
    assert.equal(refused.body?.code, "INVALID_INPUT");
    assert.ok(await h.own("alice").get({ id: "c1" }), "no automatic deletion without confirm: true");
    const applied = await h.call("POST", "/cleanup/apply", { previewToken: "never-issued", confirm: true });
    assert.equal(applied.status, 409);
    assert.equal(applied.body?.code, "PREVIEW_EXPIRED");
  } finally { await h.close(); }
});
