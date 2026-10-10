import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { ContentRouteDeps } from "../../content/deps.js";
import { registerAdminPostCreateRoute } from "../create.js";
import { registerAdminPostUpdateRoute } from "../update.js";
import { registerAdminPostAutosaveRoute } from "../autosave.js";

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
  const postRepo = new InMemoryPostRepo();
  let sequence = 0;
  const deps = { workspaceId: "ws", postRepo, clock: { nowMs: () => Date.parse("2026-10-09T00:00:00Z"), nowIso: () => "2026-10-09T00:00:00.000Z" },
    idGen: { newId: () => `author-rest-${++sequence}` }, changeSets: new InMemoryChangeSetRepo(), outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    authorize: async () => ({ allowed: true, reason: "matched" }), userRepo: { findByPrincipalId: async () => ({ username: "admin" }) },
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "human" }; next(); });
  registerAdminPostCreateRoute(app, deps);
  registerAdminPostUpdateRoute(app, deps);
  registerAdminPostAutosaveRoute(app, deps);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/workspaces/ws/posts`;
  const send = (method: string, suffix: string, body: unknown) => fetch(url + suffix, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { postRepo, send };
}

test("REST create uses the account default and update saves credit and false independently from creator attribution", async t => {
  const { send, postRepo } = await fixture(t);
  const created = await send("POST", "", { title: "Credit" });
  assert.equal(created.status, 201);
  const { post } = await created.json() as { post: { id: string; title: string; slug: string; bodyJson: unknown; status: string; author: string; showAuthor: boolean } };
  assert.deepEqual([post.author, post.showAuthor], ["admin", false]);
  const base = { title: post.title, slug: post.slug, bodyJson: post.bodyJson, status: post.status };
  const changed = await send("PUT", `/${post.id}`, { ...base, author: "Another Name", showAuthor: true });
  assert.equal(changed.status, 200);
  assert.deepEqual([(await postRepo.findById({ workspaceId: "ws", id: post.id }))?.author, (await postRepo.findById({ workspaceId: "ws", id: post.id }))?.showAuthor], ["Another Name", true]);
  const hidden = await send("PUT", `/${post.id}`, { ...base, showAuthor: false });
  assert.equal(hidden.status, 200);
  const row = await postRepo.findById({ workspaceId: "ws", id: post.id });
  assert.deepEqual([row?.author, row?.showAuthor, row?.createdByPrincipalId], ["Another Name", false, "human"]);
  const invalid = await send("PUT", `/${post.id}`, { ...base, showAuthor: "false" });
  assert.equal(invalid.status, 400);
  const error = await invalid.json() as { error: string };
  assert.equal(error.error, "showAuthor must be a boolean");
  assert.equal((await postRepo.findById({ workspaceId: "ws", id: post.id }))?.version, row?.version);
});

test("REST standing draft retains byline edits without changing the saved post", async t => {
  const { send, postRepo } = await fixture(t);
  const created = await send("POST", "", { title: "Credit", author: null, showAuthor: false });
  const { post } = await created.json() as { post: { id: string; version: number } };
  const response = await send("PUT", `/${post.id}/autosave`, { bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, title: "Credit", slug: "credit",
    baseVersion: post.version, author: "Draft Writer", showAuthor: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { applied: true });
  const draft = await postRepo.readAutosave({ workspaceId: "ws", id: post.id });
  assert.deepEqual([draft?.author, draft?.showAuthor], ["Draft Writer", true]);
  const saved = await postRepo.findById({ workspaceId: "ws", id: post.id });
  assert.deepEqual([saved?.author, saved?.showAuthor], [null, false]);
});

test("REST create, update and autosave reject overlong credit with the same error and no writes", async t => {
  const { send, postRepo } = await fixture(t);
  const tooLong = "A".repeat(201);
  const refusedCreate = await send("POST", "", { title: "Credit", author: tooLong });
  assert.equal(refusedCreate.status, 400);
  assert.equal((await refusedCreate.json() as { error: string }).error, "author must be at most 200 characters");
  assert.deepEqual(await postRepo.list({ workspaceId: "ws" }), []);
  const accepted = await send("POST", "", { title: "Credit", author: "A".repeat(200) });
  assert.equal(accepted.status, 201);
  const { post } = await accepted.json() as { post: { id: string; version: number; title: string; slug: string; bodyJson: unknown; status: string } };
  const saved = await postRepo.findById({ workspaceId: "ws", id: post.id });
  for (const [suffix, body] of [
    [`/${post.id}`, { title: post.title, slug: post.slug, bodyJson: post.bodyJson, status: post.status, author: tooLong }],
    [`/${post.id}/autosave`, { title: post.title, slug: post.slug, bodyFormat: "doc", bodyJson: post.bodyJson, baseVersion: post.version, author: tooLong }],
  ] as const) {
    const refused = await send("PUT", suffix, body);
    assert.equal(refused.status, 400);
    assert.equal((await refused.json() as { error: string }).error, "author must be at most 200 characters");
    assert.deepEqual(await postRepo.findById({ workspaceId: "ws", id: post.id }), saved);
    assert.equal(await postRepo.readAutosave({ workspaceId: "ws", id: post.id }), null);
  }
});
