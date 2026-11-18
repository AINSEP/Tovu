import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createInMemoryApp } from "#src/server/runtime/composition/memory-route-deps";

/**
 * @file Route-level pin for decision KT-DT6: an `expectedVersion` above the safe-integer range is
 * answered 400 `VALIDATION_ERROR` (the same envelope every other malformed basis gets) and the edit
 * does not land. Before KT-DT6 the value was accepted and then surfaced as a version conflict.
 */

const WS = "workspace-local";
const BODY_JSON = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };

test("PUT posts/:postId 400 VALIDATION_ERROR when expectedVersion is above the safe-integer range", async (t) => {
  const server = createServer(createInMemoryApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { "content-type": "application/json", cookie };

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, { method: "POST", headers, body: JSON.stringify({ title: "Unsafe Basis", slug: "unsafe-basis" }) });
  assert.equal(created.status, 201);
  const { post } = (await created.json()) as { post: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${post.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "Should Not Land", slug: "unsafe-basis", bodyJson: BODY_JSON, status: "draft", expectedVersion: 2 ** 53 }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "'expectedVersion' must be a non-negative integer when present", code: "VALIDATION_ERROR" });

  const after = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${post.id}`, { headers: { cookie } });
  assert.equal(((await after.json()) as { post: { title: string } }).post.title, "Unsafe Basis");
});
