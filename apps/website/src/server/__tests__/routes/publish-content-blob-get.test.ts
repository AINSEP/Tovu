import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file Route-level tests for `GET .../publish-content/blobs/:sha` — the blob DOWNLOAD endpoint
 * that makes the pull direction able to carry media bytes at all (`peer-transport.ts`'s own
 * "KNOWN GAP" note: the peer exposed `PUT .../blobs/:sha` but no GET, so a pulled media entity was
 * always `blocked`).
 *
 * Harness mirrors `publish-content-blobs.test.ts` (the PUT/probe sibling) and
 * `publish-content-export.test.ts`'s `loginWithPermissions` — hermetic in-memory composition root,
 * no filesystem, no `content.db`, fixtures owned by this file per the directory's own convention.
 *
 * ## What these tests pin, and why each one exists
 *
 * A content-addressed store makes a leaked or guessed sha a READ CAPABILITY if the route treats
 * "knows the hash" as sufficient. These tests therefore assert the gate directly, not just the
 * happy path: anonymous is 401, a principal with no permissions is 403, and — the load-bearing one
 * — a principal holding ONLY `publish_content.apply` (the permission that lets it UPLOAD that very
 * blob) is still 403 on the download. Knowing the sha, and even having put the bytes there, is not
 * a read capability.
 */

const WORKSPACE = "workspace-local";

async function startServer(deps: ReturnType<typeof createRouteDeps> = createRouteDeps()) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  // The seeded owner does not exist until the identity seed resolves; logging in before it does is
  // a real race (observed as an intermittent 401 from `/auth/login` for `admin`).
  await deps.identityReady;
  const address = server.address() as AddressInfo;
  return { deps, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function loginAs(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200, `login failed for ${username}: ${await res.text()}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Holds the wildcard `*` (identity/seed.ts) — used only to PUT the fixture bytes. */
async function loginAsOwner(baseUrl: string): Promise<string> {
  return loginAs(baseUrl, "admin", "tovu-dev");
}

/** A logged-in principal holding EXACTLY `permissions`, via a hand-built non-builtin policy —
 *  copied from `publish-content-export.test.ts`, which copied it from `api-key-routes.test.ts`. */
async function loginWithPermissions(
  deps: ReturnType<typeof createRouteDeps>,
  baseUrl: string,
  args: { username: string; permissions: readonly string[] }
): Promise<string> {
  await deps.identityReady;
  const principalId = `${args.username}-principal`;
  await deps.principalRepo.save({
    id: principalId,
    workspaceId: WORKSPACE,
    kind: "user",
    displayName: args.username,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: WORKSPACE,
    username: args.username,
    passwordHash: await deps.passwordHasher.hash("p4ssw0rd-not-secret!"),
  });
  if (args.permissions.length > 0) {
    const policyId = `${args.username}-policy`;
    await deps.policyRepo.save({ id: policyId, workspaceId: WORKSPACE, name: policyId, isBuiltin: false, isFrozen: false });
    for (const [index, permission] of args.permissions.entries()) {
      await deps.policyPermissionRepo.save({
        id: `${policyId}-perm-${index}`,
        workspaceId: WORKSPACE,
        policyId,
        permission,
        resourceType: null,
        constraintJson: null,
      });
    }
    await deps.principalPolicyRepo.save({ id: `${policyId}-attachment`, workspaceId: WORKSPACE, principalId, policyId });
  }
  return loginAs(baseUrl, args.username, "p4ssw0rd-not-secret!");
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blobUrl(baseUrl: string, sha: string, workspace: string = WORKSPACE): string {
  return `${baseUrl}/api/admin/v1/workspaces/${workspace}/publish-content/blobs/${sha}`;
}

/** Uploads real bytes through the PUT sibling so the fixture exists by the SAME path a pushing peer
 *  would have written it — never by reaching into the blob store directly. */
async function putBlob(baseUrl: string, cookie: string, bytes: Buffer): Promise<string> {
  const sha = sha256Of(bytes);
  const res = await fetch(blobUrl(baseUrl, sha), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64: bytes.toString("base64") }),
  });
  assert.equal(res.status, 200, `fixture upload failed: ${await res.text()}`);
  return sha;
}

test("GET .../blobs/:sha returns the EXACT bytes that were uploaded, and they hash to the requested sha", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const owner = await loginAsOwner(baseUrl);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x7f]);
  const sha = await putBlob(baseUrl, owner, bytes);

  // Downloaded by a principal holding ONLY publish_content.read — the least privilege a pull-only
  // peer credential should ever need on the SOURCE instance.
  const reader = await loginWithPermissions(deps, baseUrl, { username: "blob-reader", permissions: ["publish_content.read"] });
  const res = await fetch(blobUrl(baseUrl, sha), { headers: { cookie: reader } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);

  const body = JSON.parse(raw) as { sha256: string; dataBase64: string };
  assert.equal(body.sha256, sha);
  const returned = Buffer.from(body.dataBase64, "base64");
  assert.deepEqual(returned, bytes, "the bytes must round-trip byte-for-byte, including non-UTF-8 bytes");
  assert.equal(sha256Of(returned), sha, "the returned bytes must hash to the sha that was requested");
});

test("GET .../blobs/:sha 404s when the URL workspace does not match this composition's own workspace", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const owner = await loginAsOwner(baseUrl);
  const sha = await putBlob(baseUrl, owner, Buffer.from("cross-workspace probe"));

  const res = await fetch(blobUrl(baseUrl, sha, "some-other-workspace"), { headers: { cookie: owner } });
  const raw = await res.text();
  assert.equal(res.status, 404, raw);
  // Asserted on the BODY, not just the status: an unregistered route also 404s (with Express's own
  // HTML), so a status-only assertion here would pass against no implementation at all.
  assert.equal((JSON.parse(raw) as { error: string }).error, "workspace was not found");
});

test("GET .../blobs/:sha is 401 without a credential and 403 for an authenticated principal holding nothing", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const owner = await loginAsOwner(baseUrl);
  const sha = await putBlob(baseUrl, owner, Buffer.from("secret bytes nobody may read"));

  const anonymous = await fetch(blobUrl(baseUrl, sha));
  assert.equal(anonymous.status, 401);

  const bare = await loginWithPermissions(deps, baseUrl, { username: "bare-blob", permissions: [] });
  const forbidden = await fetch(blobUrl(baseUrl, sha), { headers: { cookie: bare } });
  const forbiddenRaw = await forbidden.text();
  assert.equal(forbidden.status, 403, forbiddenRaw);
  assert.equal((JSON.parse(forbiddenRaw) as { code: string }).code, "FORBIDDEN");
});

test("GET .../blobs/:sha REFUSES a principal holding only publish_content.apply — knowing (and having uploaded) a sha is not a read capability", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const uploader = await loginWithPermissions(deps, baseUrl, {
    username: "uploader-only",
    permissions: ["publish_content.apply"],
  });
  const bytes = Buffer.from("bytes this principal uploaded itself");
  const sha = await putBlob(baseUrl, uploader, bytes);

  const res = await fetch(blobUrl(baseUrl, sha), { headers: { cookie: uploader } });
  const raw = await res.text();
  assert.equal(res.status, 403, raw);
  assert.equal((JSON.parse(raw) as { code: string }).code, "FORBIDDEN");
  assert.ok(!raw.includes(bytes.toString("base64")), "a refusal must not leak the bytes it refused");
});

test("GET .../blobs/:sha 400s on a malformed sha param (not lowercase 64-hex)", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const reader = await loginWithPermissions(deps, baseUrl, { username: "malformed-reader", permissions: ["publish_content.read"] });
  for (const bad of ["not-a-sha", "A".repeat(64), "abc"]) {
    const res = await fetch(blobUrl(baseUrl, bad), { headers: { cookie: reader } });
    assert.equal(res.status, 400, `expected 400 for '${bad}'`);
  }
});

test("GET .../blobs/:sha 404s with BLOB_NOT_FOUND for a well-formed sha this instance does not hold", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const reader = await loginWithPermissions(deps, baseUrl, { username: "absent-reader", permissions: ["publish_content.read"] });
  const res = await fetch(blobUrl(baseUrl, sha256Of(Buffer.from("never uploaded anywhere"))), { headers: { cookie: reader } });
  const raw = await res.text();
  assert.equal(res.status, 404, raw);
  assert.equal((JSON.parse(raw) as { code: string }).code, "BLOB_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// S18 (S-F3) route wiring — `publish-files-plan-2026-09-24.md` §3. This route must serve a blob
// that lives ONLY in `RouteDeps.fileBlobIndex` (a file-tree type's `pack()` fill), never uploaded
// to the media blob store, through `createCompositePeerBlobSource` — see `composite-blob-source.ts`
// for the pure fallback/re-hash logic these two tests prove is actually WIRED into this route.
// ---------------------------------------------------------------------------

test("GET .../blobs/:sha serves a blob that exists only in the file index, never uploaded to the blob store", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const dir = mkdtempSync(path.join(tmpdir(), "publish-content-blob-get-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "theme.css");
  const content = "body { color: red; } /* file-index-only fixture */";
  writeFileSync(filePath, content);
  const sha = sha256Of(Buffer.from(content));
  deps.fileBlobIndex.set(sha, { absPath: filePath, size: content.length });

  const reader = await loginWithPermissions(deps, baseUrl, { username: "file-index-reader", permissions: ["publish_content.read"] });
  const res = await fetch(blobUrl(baseUrl, sha), { headers: { cookie: reader } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);

  const body = JSON.parse(raw) as { sha256: string; dataBase64: string };
  assert.equal(body.sha256, sha);
  assert.equal(Buffer.from(body.dataBase64, "base64").toString("utf8"), content);
});

test("GET .../blobs/:sha 404s BLOB_NOT_FOUND when the indexed file changed on disk since it was packed", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const dir = mkdtempSync(path.join(tmpdir(), "publish-content-blob-get-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "theme.css");
  const original = "body { color: red; }";
  writeFileSync(filePath, original);
  const sha = sha256Of(Buffer.from(original));
  deps.fileBlobIndex.set(sha, { absPath: filePath, size: original.length });

  // The author edits the same theme file after the operator opened the publish dialog (packed it) —
  // bytes on disk no longer hash to the sha the index recorded them under.
  writeFileSync(filePath, "body { color: blue; }");

  const reader = await loginWithPermissions(deps, baseUrl, { username: "stale-file-reader", permissions: ["publish_content.read"] });
  const res = await fetch(blobUrl(baseUrl, sha), { headers: { cookie: reader } });
  const raw = await res.text();
  assert.equal(res.status, 404, raw);
  assert.equal((JSON.parse(raw) as { code: string }).code, "BLOB_NOT_FOUND");
});
