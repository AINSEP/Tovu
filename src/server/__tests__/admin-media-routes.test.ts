import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app";

/**
 * @file Route-level tests for the admin `media` HTTP surface (ADR-027 walking
 * skeleton). Boots the real `createApp()` (media routes are fully wired into
 * `server/app.ts`, unlike the menus routes' interim standalone-app test at the
 * time that suite was written) and exercises upload -> list -> update ->
 * trash -> purge over real HTTP, mirroring `packet-one-routes.test.ts`'s
 * login-then-fetch harness style.
 */
async function withLoggedInServer(run: (baseUrl: string, cookie: string) => Promise<void>) {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    await run(baseUrl, cookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function base64Of(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

test("admin media routes: upload -> list -> update -> trash -> purge ladder", async () => {
  await withLoggedInServer(async (baseUrl, cookie) => {
    const uploadRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        filename: "hero.png",
        contentType: "image/png",
        dataBase64: base64Of("fake-png-bytes"),
        alt: "a hero image",
      }),
    });
    assert.equal(uploadRes.status, 201);
    const uploadPayload = (await uploadRes.json()) as {
      media: { id: string; title: string; alt: string; status: string; version: number };
    };
    assert.equal(uploadPayload.media.title, "hero");
    assert.equal(uploadPayload.media.alt, "a hero image");
    assert.equal(uploadPayload.media.status, "active");
    const mediaId = uploadPayload.media.id;

    const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
      headers: { cookie },
    });
    assert.equal(listRes.status, 200);
    const listPayload = (await listRes.json()) as { media: Array<{ id: string }> };
    assert.ok(listPayload.media.some((m) => m.id === mediaId));

    const updateRes = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ caption: "A striking hero shot", credit: "Jane Doe" }),
      }
    );
    assert.equal(updateRes.status, 200);
    const updatePayload = (await updateRes.json()) as {
      media: { caption: string; credit: string; version: number };
    };
    assert.equal(updatePayload.media.caption, "A striking hero shot");
    assert.equal(updatePayload.media.credit, "Jane Doe");
    assert.equal(updatePayload.media.version, 2);

    // Purge before trash -> 409 with a referencing list.
    const prematurePurge = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`,
      { method: "DELETE", headers: { cookie } }
    );
    assert.equal(prematurePurge.status, 409);
    const prematurePayload = (await prematurePurge.json()) as { referencing: string[] };
    assert.ok(prematurePayload.referencing.length > 0);

    const trashRes = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`,
      { method: "POST", headers: { cookie } }
    );
    assert.equal(trashRes.status, 200);
    const trashPayload = (await trashRes.json()) as { media: { status: string } };
    assert.equal(trashPayload.media.status, "trashed");

    const purgeRes = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`,
      { method: "DELETE", headers: { cookie } }
    );
    assert.equal(purgeRes.status, 200);
    const purgePayload = (await purgeRes.json()) as { purged: boolean };
    assert.equal(purgePayload.purged, true);

    const listAfterPurge = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
      headers: { cookie },
    });
    const listAfterPurgePayload = (await listAfterPurge.json()) as { media: Array<{ id: string }> };
    assert.ok(!listAfterPurgePayload.media.some((m) => m.id === mediaId));
  });
});

test("admin media routes: upload rejects a disallowed content type with 400", async () => {
  await withLoggedInServer(async (baseUrl, cookie) => {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        filename: "malware.exe",
        contentType: "application/x-msdownload",
        dataBase64: base64Of("x"),
      }),
    });
    assert.equal(res.status, 400);
  });
});

test("admin media routes: 404s for an unknown workspace id and an unknown media id", async () => {
  await withLoggedInServer(async (baseUrl, cookie) => {
    const wrongWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/media`, {
      headers: { cookie },
    });
    assert.equal(wrongWorkspace.status, 404);

    const unknownMedia = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/does-not-exist/trash`,
      { method: "POST", headers: { cookie } }
    );
    assert.equal(unknownMedia.status, 404);
  });
});
