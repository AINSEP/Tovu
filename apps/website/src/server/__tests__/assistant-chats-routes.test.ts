import { createRouteIncidentReporter } from "./helpers/route-incident-reporter.js";
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../runtime/composition/app.js";
import { createAssistantChatsModule } from "../runtime/composition/modules/assistant-chats.js";
import { registerAuthRoutes } from "../inbound/admin-http/dev-auth.js";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";
import type { RouteDeps } from "../routes/types.js";
import { openChatDb } from "../../platform/db/sqlite/chat-db.js";
import { createChatBulkDeletionFor, createChatStoreFactory } from "../../assistant/persistence/store-factory.js";

/**
 * @file HTTP-level coverage for `/api/assistant/chats`.
 *
 * The store's own isolation is covered in `@jini-ai/sqlite`'s tests. What this file adds is the
 * part that lives in Tovu: that the routes actually go through `deps.chatHistory(principal)` and
 * cannot be talked out of it. A store with a perfect predicate is worthless if a handler reaches
 * around it, and that mistake is only visible from out here.
 */

function buildApp(deps: RouteDeps = createRouteDeps()) {
  const routeErrors = createRouteIncidentReporter().errors;
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  createAssistantChatsModule(deps).registerRoutes?.({ errors: routeErrors, app });
  return app;
}

async function api(baseUrl: string, cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/assistant/chats${path}`, {
    ...init,
    // P11 ST-9.T (7dc6e8453) mounts PATCH/DELETE behind `adminSameOriginWrites`; the browser admin
    // sends its own Origin, so this client does too. Cross-origin refusal is pinned in assistant-chats.cleanup.unit.test.ts.
    headers: { cookie, origin: baseUrl, "content-type": "application/json", ...(init.headers ?? {}) },
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
  assert.equal(conversation.title, "Posts for slow mornings");

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

  const expected = [
    { id: "zz-first", role: "user", content: "first", createdAt: 1_000 },
    { id: "aa-second", role: "assistant", content: "second", createdAt: 1_000 },
  ];
  for (const { id, ...message } of expected) {
    const put = await api(baseUrl, cookie, `/${conversation.id}/messages/${id}`, {
      method: "PUT",
      // Identical createdAt on both: ordering must come from `position`, not the timestamp.
      body: JSON.stringify(message),
    });
    assert.equal(put.status, 200);
  }

  const { messages } = (await (
    await api(baseUrl, cookie, `/${conversation.id}/messages`)
  ).json()) as { messages: { id: string; content: string }[] };
  assert.deepEqual(messages.map((m) => m.id), ["zz-first", "aa-second"]);
  assert.deepEqual(messages, expected);
});

test("rejects a 51-character rename, then saves a trimmed 50-character manual title", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = await (await api(baseUrl, cookie, "", {
    method: "POST", body: JSON.stringify({}),
  })).json() as { conversation: { id: string } };
  const path = `/${conversation.id}`;
  const rejected = await api(baseUrl, cookie, path, {
    method: "PATCH", body: JSON.stringify({ title: "x".repeat(51) }),
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), {
    error: "'title' must be at most 50 characters", code: "VALIDATION_ERROR",
  });
  const unchanged = await (await api(baseUrl, cookie, "")).json() as { conversations: { title: string | null }[] };
  assert.equal(unchanged.conversations[0]?.title, null, "an invalid rename must not write");
  const title = "y".repeat(50);
  const valid = await api(baseUrl, cookie, path, {
    method: "PATCH", body: JSON.stringify({ title: `  ${title}  ` }),
  });
  assert.equal(valid.status, 200);
  const saved = await valid.json() as { conversation: { title: string; titleSource: string } };
  assert.equal(saved.conversation.title, title);
  assert.equal(saved.conversation.titleSource, "manual");
  const listed = await (await api(baseUrl, cookie, "")).json() as { conversations: { title: string; titleSource: string }[] };
  assert.equal(listed.conversations[0]?.title, title);
  assert.equal(listed.conversations[0]?.titleSource, "manual");
});

test("names an untitled conversation from its first user message", async (t) => {
  // The dock creates the conversation when "New" is clicked, before anything is typed, so this is
  // the only path that can ever name an admin chat. Without it every conversation in the switcher
  // reads "Untitled" forever — which is exactly what shipped.
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })
  ).json()) as { conversation: { id: string; title: string | null } };
  assert.equal(conversation.title, null, "a conversation created with no first message starts unnamed");

  await api(baseUrl, cookie, `/${conversation.id}/messages/m1`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "please rebuild the sitemap for the blog", createdAt: 1 }),
  });

  const listed = (await (await api(baseUrl, cookie, "")).json()) as {
    conversations: { title: string | null; titleSource: string }[];
  };
  assert.equal(listed.conversations[0]?.title, "Please rebuild the sitemap for the blog");
  assert.equal(listed.conversations[0]?.titleSource, "fallback");
});

test("a later message does not rename a conversation the user named", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })
  ).json()) as { conversation: { id: string } };

  await api(baseUrl, cookie, `/${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "My Own Name" }),
  });
  await api(baseUrl, cookie, `/${conversation.id}/messages/m1`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "now purge the cache and redeploy", createdAt: 1 }),
  });

  const listed = (await (await api(baseUrl, cookie, "")).json()) as {
    conversations: { title: string | null; titleSource: string }[];
  };
  assert.equal(listed.conversations[0]?.title, "My Own Name");
  assert.equal(listed.conversations[0]?.titleSource, "manual");
});

test("an unusable first message leaves the chat namable by the next one", async (t) => {
  // A bare URL derives to "", so nothing is written and the *next* message gets to name it. The
  // alternative — stamping a blank title — would lock the chat as unnamed permanently.
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({}) })
  ).json()) as { conversation: { id: string } };

  await api(baseUrl, cookie, `/${conversation.id}/messages/m1`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "https://example.com/a/b/c", createdAt: 1 }),
  });
  const stillUnnamed = (await (await api(baseUrl, cookie, "")).json()) as {
    conversations: { title: string | null }[];
  };
  assert.equal(stillUnnamed.conversations[0]?.title, null);

  await api(baseUrl, cookie, `/${conversation.id}/messages/m2`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "fix the redirect loop", createdAt: 2 }),
  });
  const named = (await (await api(baseUrl, cookie, "")).json()) as {
    conversations: { title: string | null }[];
  };
  assert.equal(named.conversations[0]?.title, "Redirect loop");
});

test("a message id belonging to another conversation cannot overwrite it", async (t) => {
  /*
   * The upsert behind `appendMessage` conflicts on `id`, the global message primary key. Its
   * `DO UPDATE` used to carry no conversation predicate, so PUTting an id that already existed in a
   * different conversation updated THAT row — and the caller still got a 404, because the follow-up
   * read is conversation-scoped and found nothing. A rejected-looking request that had already
   * written.
   *
   * Asserted here as well as in `@jini-ai/sqlite`'s own isolation tests because this is the layer
   * where the misleading 404 is visible, and because the real trigger was a client bug, not an
   * attacker: the admin dock briefly PUT one conversation's transcript against another's id.
   */
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const mk = async (firstMessage: string) =>
    (
      (await (
        await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ firstMessage }) })
      ).json()) as { conversation: { id: string } }
    ).conversation.id;

  const first = await mk("first chat");
  const second = await mk("second chat");

  await api(baseUrl, cookie, `/${first}/messages/shared-id`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "original", createdAt: 1 }),
  });

  const collide = await api(baseUrl, cookie, `/${second}/messages/shared-id`, {
    method: "PUT",
    body: JSON.stringify({ role: "user", content: "overwritten", createdAt: 2 }),
  });
  assert.equal(collide.status, 404, "a foreign message id must be refused");

  const { messages } = (await (await api(baseUrl, cookie, `/${first}/messages`)).json()) as {
    messages: { id: string; content: string }[];
  };
  assert.deepEqual(
    messages.map((m) => m.content),
    ["original"],
    "the first conversation's message was overwritten through the other conversation's route",
  );

  const other = (await (await api(baseUrl, cookie, `/${second}/messages`)).json()) as {
    messages: unknown[];
  };
  assert.deepEqual(other.messages, [], "the refused write must not have landed here either");
});

test("404s rather than 403s on another principal's conversation id", async (t) => {
  // Both requests hit the same app and the same store; only the principal differs. A 403 here
  // would confirm the id exists, which is exactly what an enumeration attempt is looking for.
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(deps), t);
  const { conversation } = (await (
    await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ firstMessage: "private" }) })
  ).json()) as { conversation: { id: string; title: string | null } };

  const ownerMessage = { id: "private-message", role: "user", content: "owner secret", createdAt: 42 };
  assert.equal((await api(baseUrl, cookie, `/${conversation.id}/messages/${ownerMessage.id}`, {
    method: "PUT", body: JSON.stringify(ownerMessage),
  })).status, 200);
  const peerCookie = await loginAsBarePrincipal(deps, baseUrl, { username: "chat-peer" });
  assert.deepEqual(await (await api(baseUrl, peerCookie, "")).json(), { conversations: [] });
  // Reads conceal a foreign id as an empty list; deletes are intentionally idempotent.
  assert.deepEqual(await (await api(baseUrl, peerCookie, `/${conversation.id}/messages`)).json(), { messages: [] });
  assert.equal((await api(baseUrl, peerCookie, `/${conversation.id}`, {
    method: "PATCH", body: JSON.stringify({ title: "Stolen" }),
  })).status, 404);
  assert.equal((await api(baseUrl, peerCookie, `/${conversation.id}/messages/${ownerMessage.id}`, {
    method: "PUT", body: JSON.stringify({ ...ownerMessage, content: "overwritten" }),
  })).status, 404);
  assert.equal((await api(baseUrl, peerCookie, `/${conversation.id}`, { method: "DELETE" })).status, 204);
  const ownerMessages = await (await api(baseUrl, cookie, `/${conversation.id}/messages`)).json();
  assert.deepEqual(ownerMessages, { messages: [ownerMessage] });

  // A different principal, obtained the same way any route would obtain one.
  const otherStore = deps.chatHistory({
    kind: "user",
    workspaceId: deps.workspaceId,
    userId: "someone-else",
  });

  // Object arguments, per the `ChatStore` port: a bare id string left `required.id` undefined, so
  // these reads returned null/[] for ANY caller and the delete matched nothing — the isolation
  // checks passed without ever naming the conversation.
  assert.equal(await otherStore.get({ id: conversation.id }), null, "another user could read the conversation");
  assert.deepEqual(await otherStore.messages({ conversationId: conversation.id }), []);
  await otherStore.delete({ id: conversation.id });
  // The owner store is keyed by the logged-in owner's principal id, exactly as the route's `storeFor` does.
  assert.notEqual(
    await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: await deps.ownerPrincipalId }).get({ id: conversation.id }),
    null,
    "another user's store-level delete removed the owner's conversation",
  );
  // The owner's copy must have survived the other principal's delete.
  const stillThere = (await (await api(baseUrl, cookie, "")).json()) as { conversations: unknown[] };
  assert.equal(stillThere.conversations.length, 1, "another user's DELETE removed the owner's conversation");
  assert.equal((stillThere.conversations[0] as { title: string | null }).title, conversation.title, "a foreign rename must leave the owner's title intact");
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

test("pasted credentials are removed before real chat-store rows are written or returned", async t => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = await (await api(baseUrl, cookie, '', { method: 'POST', body: '{}' })).json() as { conversation: { id: string } };
  const secret = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0';
  for (const content of [`Save ${secret} please`, `Update ${secret} please`]) {
    const response = await api(baseUrl, cookie, `/${conversation.id}/messages/guarded`, {
      method: 'PUT', body: JSON.stringify({ role: 'user', content, createdAt: 1 }),
    });
    assert.equal(response.status, 200);
    const saved = await response.json() as { message: { content: string } };
    assert.equal(saved.message.content, content.startsWith('Save') ? 'Save [token removed] please' : 'Update [token removed] please');
    assert.equal(JSON.stringify(saved).includes(secret), false, 'credential escaped the write boundary');
  }
  const rows = await (await api(baseUrl, cookie, `/${conversation.id}/messages`)).json() as { messages: Array<{ content: string }> };
  assert.deepEqual(rows.messages.map(row => row.content), ['Update [token removed] please']);
  assert.equal(JSON.stringify(rows).includes(secret), false, 'credential escaped the stored transcript');
});

// B140: a rename is user text too — a pasted credential must not reach the stored chat title.
test("renamed title with a token is stored redacted", async t => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const { conversation } = await (await api(baseUrl, cookie, '', { method: 'POST', body: '{}' })).json() as { conversation: { id: string } };
  const secret = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0';
  const response = await api(baseUrl, cookie, `/${conversation.id}`, { method: 'PATCH', body: JSON.stringify({ title: `Key ${secret} chat` }) });
  assert.equal(response.status, 200);
  const renamed = await response.json() as { conversation: { title: string } };
  assert.equal(renamed.conversation.title, 'Key [token removed] chat');
  const list = await (await api(baseUrl, cookie, '')).json();
  assert.equal(JSON.stringify(list).includes(secret), false, 'credential escaped into the stored title');
});

test("a client-chosen chat id is kept; an empty or non-string id, or a non-object body, gets a fresh one", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  const create = async (body: unknown) => {
    const response = await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify(body) });
    assert.equal(response.status, 201);
    return ((await response.json()) as { conversation: { id: string } }).conversation.id;
  };
  assert.equal(await create({ id: "chat-chosen-by-client" }), "chat-chosen-by-client");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const fresh = [await create({ id: "" }), await create({ id: 42 }), await create(["chat-in-array"])];
  for (const id of fresh) assert.match(id, uuid);
  assert.equal(new Set(fresh).size, 3);
});

test("a rename whose title is not a string is refused and leaves the title alone", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-title", firstMessage: "plan the launch" }) });
  const response = await api(baseUrl, cookie, "/c-title", { method: "PATCH", body: JSON.stringify({ title: 5 }) });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "'title' must be a non-empty string", code: "VALIDATION_ERROR" });
  const { conversations } = (await (await api(baseUrl, cookie, "")).json()) as { conversations: { id: string; title: string }[] };
  assert.equal(conversations.find((c) => c.id === "c-title")?.title, "Plan the launch");
});

test("a saved message needs string content; a non-object body is refused on its role", async (t) => {
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-content" }) });
  const noContent = await api(baseUrl, cookie, "/c-content/messages/m1", { method: "PUT", body: JSON.stringify({ role: "user", content: ["hi"] }) });
  assert.equal(noContent.status, 400);
  assert.deepEqual(await noContent.json(), { error: "'content' must be a string", code: "VALIDATION_ERROR" });
  const arrayBody = await api(baseUrl, cookie, "/c-content/messages/m1", { method: "PUT", body: JSON.stringify([{ role: "user", content: "hi" }]) });
  assert.equal(arrayBody.status, 400);
  assert.deepEqual(await arrayBody.json(), { error: "'role' must be 'user' or 'assistant'", code: "VALIDATION_ERROR" });
  const { messages } = (await (await api(baseUrl, cookie, "/c-content/messages")).json()) as { messages: unknown[] };
  assert.deepEqual(messages, []);
});

/** Wraps the real per-principal store so one of its methods reads as absent or is replaced. */
function withStoreOverride(deps: RouteDeps, override: Record<string, unknown>): RouteDeps {
  const original = deps.chatHistory.bind(deps);
  deps.chatHistory = ((owner: Parameters<RouteDeps["chatHistory"]>[0]) => {
    const store = original(owner);
    return new Proxy(store, { get(target, property) {
      if (property in override) return override[property as string];
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    } });
  }) as RouteDeps["chatHistory"];
  return deps;
}

test("a store without the streamed JSON reader answers the messages as one JSON body", async (t) => {
  const deps = withStoreOverride(createRouteDeps(), { messagesJson: undefined });
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(deps), t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-plain" }) });
  await api(baseUrl, cookie, "/c-plain/messages/m1", { method: "PUT", body: JSON.stringify({ role: "user", content: "hello", createdAt: 5 }) });
  const response = await api(baseUrl, cookie, "/c-plain/messages");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { messages: [{ id: "m1", role: "user", content: "hello", createdAt: 5 }] });
});

test("a failing streamed messages read tears the response down and reaches the error handler instead of hanging", async (t) => {
  const deps = withStoreOverride(createRouteDeps(), {
    messagesVersion: undefined,
    messagesJson: async () => (async function* () { throw new Error("chat.db read failed"); })(),
  });
  const app = buildApp(deps);
  const failures: unknown[] = [];
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { failures.push(error); res.status(500).json({ error: "internal" }); });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-broken" }) });
  // The stream pipeline destroys the response on a read error, so the client sees the connection end.
  await assert.rejects(api(baseUrl, cookie, "/c-broken/messages", { signal: AbortSignal.timeout(3000) }), (error: Error) => error.name !== "TimeoutError");
  assert.equal(failures.length, 1);
  assert.equal((failures[0] as Error).message, "chat.db read failed");
});

test("without a bulk-deletion store the module's cleanup preview and delete-selected answer 503 NOT_CONFIGURED", async (t) => {
  const deps = createRouteDeps();
  Object.assign(deps, { chatBulkDeletionFor: undefined });
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(deps), t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-kept" }) });
  for (const [path, body] of [["/cleanup/preview", { before: Date.now() }], ["/delete-selected", { ids: ["c-kept"], confirm: true }]] as const) {
    const response = await api(baseUrl, cookie, path, { method: "POST", body: JSON.stringify(body) });
    assert.equal(response.status, 503, path);
    assert.deepEqual(await response.json(), { error: "Chat cleanup is not available on this site.", code: "NOT_CONFIGURED" });
  }
  const { conversations } = (await (await api(baseUrl, cookie, "")).json()) as { conversations: Array<{ id: string }> };
  assert.deepEqual(conversations.map((c) => c.id), ["c-kept"]);
});

test("with the site's bulk-deletion store, the module's own preview store issues a single-use token that apply redeems", async (t) => {
  const deps = createRouteDeps();
  const chat = openChatDb({ filePath: ":memory:" });
  t.after(() => chat.close());
  Object.assign(deps, { chatHistory: createChatStoreFactory({ store: chat }), chatBulkDeletionFor: createChatBulkDeletionFor({ store: chat, now: () => Date.now() }) });
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(deps), t);
  await api(baseUrl, cookie, "", { method: "POST", body: JSON.stringify({ id: "c-stale" }) });

  const preview = await api(baseUrl, cookie, "/cleanup/preview", { method: "POST", body: JSON.stringify({ before: Date.now() + 60_000 }) });
  assert.equal(preview.status, 200);
  const previewed = (await preview.json()) as { ids: string[]; previewToken: string };
  assert.deepEqual(previewed.ids, ["c-stale"]);
  assert.match(previewed.previewToken, /^[A-Za-z0-9_-]{16,}$/, "a random url-safe token from the module's default preview store");

  const applied = await api(baseUrl, cookie, "/cleanup/apply", { method: "POST", body: JSON.stringify({ previewToken: previewed.previewToken, confirm: true }) });
  assert.equal(applied.status, 200);
  assert.deepEqual(((await applied.json()) as { deleted: string[] }).deleted, ["c-stale"]);
  const { conversations } = (await (await api(baseUrl, cookie, "")).json()) as { conversations: unknown[] };
  assert.deepEqual(conversations, []);

  const replayed = await api(baseUrl, cookie, "/cleanup/apply", { method: "POST", body: JSON.stringify({ previewToken: previewed.previewToken, confirm: true }) });
  assert.equal(replayed.status, 409);
  assert.equal(((await replayed.json()) as { code: string }).code, "PREVIEW_EXPIRED");
});
