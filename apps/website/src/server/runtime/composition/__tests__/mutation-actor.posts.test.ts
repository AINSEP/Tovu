import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { bootAuthenticated } from "../../../__tests__/helpers/http-test-server.js";
import { registerAuthRoutes, requireAdminSession } from "../../../inbound/admin-http/dev-auth.js";
import { createRouteDeps } from "../app.js";
import { registerAdminPostCreateRoute, registerAdminPostUpdateRoute } from "../modules/posts.js";

/**
 * P10-H2.T: the post writers stamp whatever trusted actor their channel hands them, so the kind is
 * decided where the channel is composed. This drives the real composed admin post registrars and reads
 * the kind back off the stored outbox events: an owner's click in the admin is a `user` change.
 * (The assistant's post tools stamp `agent`; `features/post/__tests__/tool-registrations.actor.test.ts` pins that.)
 */

async function sendJson(required: { url: string; cookie: string; method: "POST" | "PUT"; body: unknown }) {
  const res = await fetch(required.url, { method: required.method, headers: { "content-type": "application/json", cookie: required.cookie }, body: JSON.stringify(required.body) });
  assert.ok(res.ok, `${required.url} -> ${res.status} ${await res.clone().text()}`);
  return await res.json() as { post: { id: string } };
}

test("an admin post update records kind user on its outbox event", async t => {
  const deps = createRouteDeps();
  // The admin routes drain the outbox after each write, so the events are read as they are enqueued.
  const events: Array<Parameters<typeof deps.outbox.enqueue>[0]> = [];
  const enqueue = deps.outbox.enqueue.bind(deps.outbox);
  deps.outbox.enqueue = async (event, ...rest) => { events.push(event); return enqueue(event, ...rest); };
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminPostCreateRoute({ app, deps });
  registerAdminPostUpdateRoute({ app, deps });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const api = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`;

  const { post } = await sendJson({ url: api, cookie, method: "POST", body: { title: "Attributed", status: "published" } });
  await sendJson({ url: `${api}/${post.id}`, cookie, method: "PUT", body: { title: "Attributed again", slug: "attributed", status: "draft", bodyJson: { type: "doc", content: [] } } });

  const byName = (name: string) => events.find(event => event.name === name);
  const ownerId = (byName("content.created")?.payload as { actorId?: string } | undefined)?.actorId;
  assert.ok(ownerId, "the admin create recorded its acting owner");
  assert.deepEqual(byName("content.created")?.actor, { id: ownerId, kind: "user" });
  assert.deepEqual(byName("content.saved")?.actor, { id: ownerId, kind: "user" });
  // The status transition the update caused carries the same attribution as the save itself.
  assert.deepEqual(byName("entry.published")?.actor, { id: ownerId, kind: "user" });
  assert.deepEqual(byName("entry.unpublished")?.actor, { id: ownerId, kind: "user" });
});
