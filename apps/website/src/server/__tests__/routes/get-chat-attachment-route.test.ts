import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import express from "express";

import { createSurfaceExchangeStore } from "../../../contracts/core/tool-surface-exchanges.js";
import { registerAuthRoutes } from "../../inbound/admin-http/dev-auth.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createAssistantModule } from "../../runtime/composition/modules/assistant.js";
import type { RouteDeps } from "../../routes/types.js";
import { loginAsBarePrincipal, startTestServer } from "../helpers/http-test-server.js";

/**
 * @file `GET /api/attachments/:ref` — the chat-attachment read-back route.
 *
 * These are REGISTRATION tests as much as behavior tests, and that is the point. The route is
 * composed here through the real `createAssistantModule(...).registerRoutes(app)` — never by
 * calling its own registrar directly — because the single most common defect in this codebase is a
 * correct route nobody wired. A test that registered the route itself would pass just as happily
 * against a composition module that never mentions it.
 *
 * The same composition is what proves the authentication gate: `modules/assistant.ts` mounts
 * `requireAdminSession` on the `/api/attachments` PREFIX, and this route lives one segment deeper.
 * That it is covered by that mount is an Express routing fact, so it is asserted through a real
 * unauthenticated request rather than assumed.
 *
 * `TOVU_CHAT_ATTACHMENTS_DIR` points the composed app at a staged upload root laid out exactly as
 * `createDiskAttachmentStore` lays one out with `retainAcrossRestarts` on — the real production
 * override (`chat-attachment-directory.ts`), not a test-only seam.
 *
 * Per-check refusal reasons are exercised in `features/media/__tests__/read-chat-attachment.test.ts`.
 * What this file adds is that NONE of them is distinguishable over HTTP: every refusal below is
 * asserted against one shared response constant, so a caller cannot tell "no such attachment" from
 * "that belongs to another admin".
 */

const REF = "attachment:11111111-2222-3333-4444-555555555555";
const BATCH = "batch-0000-1111";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

/** The one response every refusal must produce, byte for byte. */
const NOT_FOUND_BODY = { error: "attachment was not found", code: "NOT_FOUND" };

interface Staged {
  readonly uploadDirectory: string;
  readonly batchDirectory: string;
  readonly filePath: string;
  readonly sidecarDirectory: string;
}

async function stageUploadRoot(t: test.TestContext, bytes: Uint8Array = PNG_BYTES): Promise<Staged> {
  // Canonicalized first: macOS's `tmpdir()` is itself a symlink, and the real store records a
  // canonical `filePath`.
  const uploadDirectory = await realpath(await mkdtemp(join(tmpdir(), "tovu-attachment-route-")));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const batchDirectory = resolve(uploadDirectory, BATCH);
  const sidecarDirectory = resolve(uploadDirectory, ".records");
  await mkdir(batchDirectory, { recursive: true });
  await mkdir(sidecarDirectory, { recursive: true });
  const filePath = resolve(batchDirectory, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.bin");
  await writeFile(filePath, bytes);
  return { uploadDirectory, batchDirectory, filePath, sidecarDirectory };
}

async function writeSidecar(staged: Staged, ownerId: string): Promise<void> {
  const info = await lstat(staged.filePath);
  await writeFile(
    resolve(staged.sidecarDirectory, `attachment_${REF.slice("attachment:".length)}.json`),
    JSON.stringify({
      id: REF,
      filePath: staged.filePath,
      name: "hero.png",
      kind: "image",
      size: info.size,
      batchId: BATCH,
      dev: info.dev,
      ino: info.ino,
      createdAt: Date.now(),
      ownerId,
    })
  );
}

/** Boots the REAL assistant composition module against `staged`, and logs in two distinct
 *  principals so "another admin cannot read this" is a real second session, not a fabricated id. */
async function boot(t: test.TestContext, staged: Staged) {
  process.env.TOVU_CHAT_ATTACHMENTS_DIR = staged.uploadDirectory;
  t.after(() => {
    delete process.env.TOVU_CHAT_ATTACHMENTS_DIR;
  });

  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantModule(deps, createSurfaceExchangeStore()).registerRoutes(app);

  const baseUrl = await startTestServer(app, t);
  const uploaderName = `uploader-${Math.random().toString(36).slice(2, 10)}`;
  const otherName = `other-${Math.random().toString(36).slice(2, 10)}`;
  return {
    baseUrl,
    uploader: { cookie: await loginAsBarePrincipal(deps, baseUrl, { username: uploaderName }), id: `bare-${uploaderName}` },
    other: { cookie: await loginAsBarePrincipal(deps, baseUrl, { username: otherName }), id: `bare-${otherName}` },
  };
}

function attachmentUrl(baseUrl: string, ref: string): string {
  return `${baseUrl}/api/attachments/${ref}`;
}

async function assertIndistinguishableRefusal(res: globalThis.Response, label: string): Promise<void> {
  assert.equal(res.status, 404, label);
  assert.deepEqual(await res.json(), NOT_FOUND_BODY, label);
}

test("chat attachment read: the route is registered by the real assistant module and serves the owner's bytes", async (t) => {
  const staged = await stageUploadRoot(t);
  const { baseUrl, uploader } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);

  const res = await fetch(attachmentUrl(baseUrl, REF), { headers: { cookie: uploader.cookie } });

  assert.equal(res.status, 200, "a 404 here means the composition module never registered this route");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG_BYTES);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("content-disposition"), null, "a real image is previewable inline");
});

test("chat attachment read: an unauthenticated request is refused by the prefix session gate", async (t) => {
  const staged = await stageUploadRoot(t);
  const { baseUrl, uploader } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);

  const res = await fetch(attachmentUrl(baseUrl, REF));

  // 401, not 404: the gate mounted on `/api/attachments` must cover this subpath. A 404 here would
  // mean the route sits outside that mount and is reachable without a session.
  assert.equal(res.status, 401);
  // ...and this URL really is the route, not a URL nothing serves — without this line the
  // assertion above passes just as well against a route that was never registered at all.
  const authorized = await fetch(attachmentUrl(baseUrl, REF), { headers: { cookie: uploader.cookie } });
  assert.equal(authorized.status, 200, "the same URL must serve the owner, or the 401 above proves nothing");
});

test("chat attachment read: another admin's session cannot read this attachment, and cannot tell why", async (t) => {
  const staged = await stageUploadRoot(t);
  const { baseUrl, uploader, other } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);

  // Same ref, same server, a genuinely different signed-in principal.
  await assertIndistinguishableRefusal(
    await fetch(attachmentUrl(baseUrl, REF), { headers: { cookie: other.cookie } }),
    "a peer principal must be refused"
  );
  // ...and the refusal is byte-identical to every other refusal, so it discloses nothing about
  // whether this ref exists at all.
  await assertIndistinguishableRefusal(
    await fetch(attachmentUrl(baseUrl, "attachment:99999999-9999-9999-9999-999999999999"), {
      headers: { cookie: other.cookie },
    }),
    "an unknown ref must be refused identically"
  );
});

test("chat attachment read: traversal-shaped refs, encoded or not, are refused like any unknown ref", async (t) => {
  const staged = await stageUploadRoot(t);
  const { baseUrl, uploader } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);
  // Something to steal, one level above the upload root and outside every batch directory.
  const secret = resolve(staged.uploadDirectory, "..", `tovu-attachment-route-secret-${process.pid}.txt`);
  await writeFile(secret, "SECRET");
  t.after(() => rm(secret, { force: true }));

  // Anchor: a route that serves nothing would refuse every hostile ref below for free. Prove the
  // route serves SOMETHING first, so each 404 that follows is a decision and not an absence.
  assert.equal(
    (await fetch(attachmentUrl(baseUrl, REF), { headers: { cookie: uploader.cookie } })).status,
    200,
    "the legitimate ref must succeed, or the refusals below prove nothing"
  );

  for (const ref of [
    "attachment:..",
    "..%2F..%2Fetc%2Fpasswd",
    "attachment:%2E%2E%2F%2E%2E%2Fetc%2Fpasswd",
    `attachment:${encodeURIComponent("../../")}${encodeURIComponent(secret)}`,
    encodeURIComponent(secret),
    ".records",
  ]) {
    const res = await fetch(attachmentUrl(baseUrl, ref), { headers: { cookie: uploader.cookie } });
    // 404 either way — Express may not match the route at all for some of these, which is also a
    // refusal; what must never happen is a 200 carrying bytes from outside the upload root.
    assert.equal(res.status, 404, `ref: ${ref}`);
    assert.equal((await res.text()).includes("SECRET"), false, `ref must not serve foreign bytes: ${ref}`);
  }
});

test("chat attachment read: uploaded HTML is never served as HTML", async (t) => {
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const staged = await stageUploadRoot(t, html);
  const { baseUrl, uploader } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);

  const res = await fetch(attachmentUrl(baseUrl, REF), { headers: { cookie: uploader.cookie } });

  // A chat composer accepts any file, so an uploaded `.html` is ordinary — and a same-origin
  // stored-XSS vector if it were ever rendered inline. The stored `kind` said `image`; the bytes
  // decide, not the record.
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
  assert.equal(res.headers.get("content-disposition"), "attachment");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("chat attachment read: a Range request is honored so a video attachment can seek", async (t) => {
  const staged = await stageUploadRoot(t);
  const { baseUrl, uploader } = await boot(t, staged);
  await writeSidecar(staged, uploader.id);

  const res = await fetch(attachmentUrl(baseUrl, REF), {
    headers: { cookie: uploader.cookie, range: "bytes=2-5" },
  });

  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"), `bytes 2-5/${PNG_BYTES.byteLength}`);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG_BYTES.slice(2, 6));
});
