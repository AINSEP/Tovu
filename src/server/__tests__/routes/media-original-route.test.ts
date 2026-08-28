import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminMediaOriginalRoute } from "../../routes/admin/media/original.js";
import { registerAdminMediaTrashRoute } from "../../routes/admin/media/trash.js";
import { registerAdminMediaUploadRoute } from "../../routes/admin/media/upload.js";
import type { RouteDeps } from "../../routes/types.js";
import { uploadMedia } from "#src/features/media/index";

/**
 * @file Route-level tests for `GET /api/admin/v1/workspaces/:workspaceId/media/:mediaId/original`
 * (`routes/admin/media/original.ts`) — the new authenticated, workspace-scoped byte-serving route
 * that lets the admin UI actually render `<img>`/`<video>` previews (the admin Media screen
 * previously had no byte-serving HTTP route at all).
 *
 * Deliberately proves the security properties named in this route's own file header by UPLOADING
 * real HTML/SVG/video bytes through the ordinary JSON `contentType` field declaring an allowed
 * image type (`uploadMedia` only validates that STRING, never the bytes — see
 * `media-service.ts`'s file header) and then asserting the serving route ignores that declared
 * string entirely and serves based on what the bytes actually are.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps() };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminMediaUploadRoute(app, deps);
  registerAdminMediaTrashRoute(app, deps);
  registerAdminMediaOriginalRoute(app, deps);
  return { app, deps };
}

/** Uploads `bytes` verbatim, declaring `declaredContentType` (default `"image/png"`, an allowed
 * upload type regardless of what `bytes` really is) — mirrors the exact gap this route's security
 * model assumes: the declared string is trusted by nothing downstream of upload. */
async function uploadRawBytes(
  baseUrl: string,
  cookie: string,
  input: { filename: string; bytes: Uint8Array; declaredContentType?: string }
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: input.filename,
      contentType: input.declaredContentType ?? "image/png",
      dataBase64: Buffer.from(input.bytes).toString("base64"),
    }),
  });
  assert.equal(res.status, 201, `upload of ${input.filename} should succeed`);
  const payload = (await res.json()) as { media: { id: string } };
  return payload.media.id;
}

function originalUrl(baseUrl: string, mediaId: string): string {
  return `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media/${mediaId}/original`;
}

test("media original route: happy path — a real PNG serves 200 with the sniffed content type and the exact uploaded bytes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "hero.png", bytes: pngBytes });

  const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("content-security-policy"), "CSP header must be present");
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.equal(res.headers.get("content-disposition"), null, "a safe image type is not forced to download");
  const body = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(body, pngBytes);
});

test("media original route: sniffs each supported format from real bytes, independent of the declared upload contentType", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const cases: Array<{ label: string; bytes: Uint8Array; expected: string }> = [
    { label: "jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]), expected: "image/jpeg" },
    { label: "gif", bytes: new TextEncoder().encode("GIF89a" + "rest"), expected: "image/gif" },
    {
      label: "webp",
      bytes: (() => {
        const b = new Uint8Array(16);
        b.set(new TextEncoder().encode("RIFF"), 0);
        b.set(new TextEncoder().encode("WEBP"), 8);
        return b;
      })(),
      expected: "image/webp",
    },
    {
      label: "mp4",
      bytes: (() => {
        const b = new Uint8Array(16);
        b.set(new TextEncoder().encode("ftyp"), 4);
        b.set(new TextEncoder().encode("isom"), 8);
        return b;
      })(),
      expected: "video/mp4",
    },
    { label: "webm", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]), expected: "video/webm" },
  ];

  for (const { label, bytes, expected } of cases) {
    const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: `${label}.bin`, bytes });
    const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
    assert.equal(res.status, 200, label);
    assert.equal(res.headers.get("content-type"), expected, label);
  }
});

test("media original route: an HTML payload declared as image/png at upload is served as application/octet-stream with Content-Disposition: attachment, never as text/html", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>");
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "totally-a-photo.png", bytes: htmlBytes });

  const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
  assert.equal(res.headers.get("content-disposition"), "attachment");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  const body = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(body, htmlBytes, "bytes are still downloadable, just never served as text/html");
});

test("media original route: an SVG payload declared as image/png at upload is served as application/octet-stream with Content-Disposition: attachment, never as image/svg+xml", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "totally-a-photo-2.png", bytes: svgBytes });

  const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
  assert.equal(res.headers.get("content-disposition"), "attachment");
});

test("media original route: Range requests — full body without a Range header, exact slices with one, 416 when unsatisfiable, and full body for malformed/multi-range headers", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const content = "0123456789ABCDEFGHIJ"; // 20 bytes, indices 0-19
  const bytes = new TextEncoder().encode(content);
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "seekable.bin", bytes });

  const full = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
  assert.equal(full.status, 200);
  assert.equal(await full.text(), content);

  const firstFive = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=0-4" } });
  assert.equal(firstFive.status, 206);
  assert.equal(firstFive.headers.get("content-range"), "bytes 0-4/20");
  assert.equal(await firstFive.text(), "01234");

  const clampedTail = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=15-9999" } });
  assert.equal(clampedTail.status, 206);
  assert.equal(clampedTail.headers.get("content-range"), "bytes 15-19/20");
  assert.equal(await clampedTail.text(), "FGHIJ");

  const suffix = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=-5" } });
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get("content-range"), "bytes 15-19/20");
  assert.equal(await suffix.text(), "FGHIJ");

  const unsatisfiable = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=100-200" } });
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers.get("content-range"), "bytes */20");

  const malformed = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=abc-def" } });
  assert.equal(malformed.status, 200, "a malformed Range header must not crash the route — it is ignored");
  assert.equal(await malformed.text(), content);

  const multiRange = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie, Range: "bytes=0-4,10-14" } });
  assert.equal(multiRange.status, 200, "multi-range requests are ignored, not partially served or crashed on");
  assert.equal(await multiRange.text(), content);
});

test("media original route: no session cookie -> 401, never revealing whether the asset exists", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "x.png", bytes: new Uint8Array([1, 2, 3]) });

  const res = await fetch(originalUrl(baseUrl, mediaId));
  assert.equal(res.status, 401);

  const resForMissing = await fetch(originalUrl(baseUrl, "does-not-exist"));
  assert.equal(resForMissing.status, 401, "an unauthenticated caller gets the same 401 for a real or fake id");
});

test("media original route: a media id belonging to a different workspace 404s — never leaks another workspace's asset", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Written directly against the domain function with a foreign workspaceId — the HTTP upload
  // route always writes under `deps.workspaceId`, so this is the only way to get a genuinely
  // cross-workspace row into the same underlying repos this test app's route reads from.
  const { media: foreignMedia } = await uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: {
      workspaceId: "workspace-someone-elses",
      bytes: new TextEncoder().encode("not yours"),
      filename: "secret.png",
      contentType: "image/png",
      createdByPrincipal: "someone-else",
    },
  });

  const res = await fetch(originalUrl(baseUrl, foreignMedia.id), { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("media original route: a trashed asset responds 410 no-store, mirroring the public rendition route's gone mapping", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadRawBytes(baseUrl, cookie, { filename: "goner.png", bytes: new Uint8Array([1, 2, 3]) });

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);

  const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie } });
  assert.equal(res.status, 410);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("media original route: an unknown media id (but real workspace) 404s", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(originalUrl(baseUrl, "does-not-exist"), { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("media original route: an unknown workspace id in the URL 404s before any authorization check", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/media/does-not-matter/original`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("media original route: an authenticated principal with zero grants is denied 403 naming media.read, before any media/blob lookup runs", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadRawBytes(baseUrl, ownerCookie, { filename: "gated.png", bytes: new Uint8Array([1, 2, 3]) });

  await deps.identityReady;
  await deps.principalRepo.save({
    id: "bare-principal-media-original",
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: "bare-principal-media-original",
    workspaceId: deps.workspaceId,
    username: "bare-media-original",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-media-original", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  const bareCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const res = await fetch(originalUrl(baseUrl, mediaId), { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "media.read");
});
