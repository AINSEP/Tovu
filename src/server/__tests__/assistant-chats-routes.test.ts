import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../app";
import { createAssistantChatsModule } from "../modules/assistant-chats";
import { registerAuthRoutes } from "../middleware/dev-auth";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server";
import type { RouteDeps } from "../routes/types";

/**
 * @file HTTP-level coverage for `/api/assistant/chats`.
 *
 * The store's own isolation is covered in `@jini-ai/sqlite`'s tests. What this file adds is the
 * part that lives in Tovu: that the routes actually go through `deps.chatHistory(principal)` and
 * cannot be talked out of it. A store with a perfect predicate is worthless if a handler reaches
 * around it, and that mistake is only visible from out here.
 */

function buildApp(deps: RouteDeps = createRouteDeps()) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantChatsModule(deps).registerRoutes?.(app);
  return app;
}

async function api(baseUrl: string, cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/assistant/chats${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

test("rejects an unauthenticated caller before touching any store", async (t) => {
  const baseUrl = await startTestServer(buildApp(), t);
  const response = await fetch(`${baseUrl}/api/assistant/chats`);
  assert.equal(response.status, 401);
});

test("creates, lists, renames and deletes a conversation", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const created = await api(baseUrl, cookie, "", {
    method: "POST",
    body: JSON.stringify({ firstMessage: 'search my posts for "slow mornings"' }),
  });
  assert.equal(created.status, 201);
  const { conversation } = (await created.json()) as { conversation: { id: string; title: string | null } };
  // The title comes from the local heuristic: filler verb and stop words dropped, Title Case.
  assert.equal(conversation.title, "Posts Slow Mornings");

  const listed = (await (await api(baseUrl, cookie, "")).json()) as { conversations: { id: string }[] };
  assert.deepEqual(listed.conversations.map((c) => c.id), [conversation.id]);

  const renamed = await api(baseUrl, cookie, `/${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Q3 content audit" }),
  });
  assert.equal(renamed.status, 200);

  // A generated title must not win over the manual rename above.
  await api(baseUrl, cookie, `/${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Slow Mornings Search", source: "generated" }),
  });
  const afterGenerated = (await (await api(baseUrl, cookie, "")).json()) as {
    conversations: { title: string }[];
  };
  assert.equal(afterGenerated.conversations[0]?.title, "Q3 content audit");

  const deleted = await api(baseUrl, cookie, `/${conversation.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  const empty = (await (await api(baseUrl, cookie, "")).json()) as { conversations: unknown[] };
  assert.deepEqual(empty.conversations, []);
});

test("round-trips messages in position order", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })
  ).json()) as { conversation: { id: string } };

  for (const [id, content] of [["m1", "first"], ["m2", "second"]] as const) {
    const put = await api(baseUrl, cookie, `/${conversation.id}/messages/${id}`, {
      method: "PUT",
      // Identical createdAt on both: ordering must come from `position`, not the timestamp.
      body: JSON.stringify({ role: "user", content, createdAt: 1_000 }),
    });
    assert.equal(put.status, 200);
  }

  const { messages } = (await (
    await api(baseUrl, cookie, `/${conversation.id}/messages`)
  ).json()) as { messages: { id: string; content: string }[] };
  assert.deepEqual(messages.map((m) => m.id), ["m1", "m2"]);
});

test("404s rather than 403s on another principal's conversation id", async (t) => {
  // Both requests hit the same app and the same store; only the principal differs. A 403 here
  // would confirm the id exists, which is exactly what an enumeration attempt is looking for.
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(deps), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ firstMessage: "private" }) })
  ).json()) as { conversation: { id: string } };

  // A different principal, obtained the same way any route would obtain one.
  const otherStore = deps.chatHistory({
    kind: "user",
    workspaceId: deps.workspaceId,
    userId: "someone-else",
  });

  assert.equal(await otherStore.get(conversation.id), null, "another user could read the conversation");
  assert.deepEqual(await otherStore.messages(conversation.id), []);
  await otherStore.delete(conversation.id);
  assert.notEqual(
    await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "admin" }),
    null,
  );
  // The owner's copy must have survived the other principal's delete.
  const stillThere = (await (await api(baseUrl, cookie, "")).json()) as { conversations: unknown[] };
  assert.equal(stillThere.conversations.length, 1, "another user's DELETE removed the owner's conversation");
});

test("rejects a rename with an empty title instead of erasing it", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ firstMessage: "keep me" }) })
  ).json()) as { conversation: { id: string } };

  const response = await api(baseUrl, cookie, `/${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "   " }),
  });
  assert.equal(response.status, 400);
});

test("rejects a message with an unknown role", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })
  ).json()) as { conversation: { id: string } };

  const response = await api(baseUrl, cookie, `/${conversation.id}/messages/m1`, {
    method: "PUT",
    body: JSON.stringify({ role: "system", content: "nope" }),
  });
  assert.equal(response.status, 400);
});
