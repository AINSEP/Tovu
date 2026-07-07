import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";

test("packet-one admin and content routes expose the seeded post loop", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Admin routes are gated by requireAdminSession — establish a session first.
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const postResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts/post-home`, {
    headers: { cookie },
  });
  assert.equal(postResponse.status, 200);
  const postPayload = (await postResponse.json()) as {
    post: { id: string; slug: string; title: string };
  };
  assert.equal(postPayload.post.id, "post-home");
  assert.equal(postPayload.post.slug, "welcome");

  const themeUpdate = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/presentation`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ activeThemeId: "glassmorphic" }),
  });
  assert.equal(themeUpdate.status, 200);
  const themePayload = (await themeUpdate.json()) as {
    settings: { activeThemeId: string };
  };
  assert.equal(themePayload.settings.activeThemeId, "glassmorphic");

  const saveResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts/post-home`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Welcome to Tovu",
      slug: "welcome",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Packet one is alive." }],
          },
        ],
      },
      status: "published",
    }),
  });
  assert.equal(saveResponse.status, 200);

  const contentResponse = await fetch(`${baseUrl}/api/content/v1/workspaces/workspace-local/posts/welcome`);
  assert.equal(contentResponse.status, 200);
  const contentPayload = (await contentResponse.json()) as {
    post: { title: string; workspaceId?: string; version?: number; status?: string };
    presentation: { activeThemeId: string };
  };
  assert.equal(contentPayload.post.title, "Welcome to Tovu");
  assert.equal(contentPayload.post.workspaceId, undefined);
  assert.equal(contentPayload.post.version, undefined);
  assert.equal(contentPayload.post.status, undefined);
  assert.equal(contentPayload.presentation.activeThemeId, "glassmorphic");
});
