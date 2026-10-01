import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { PUBLISH_CONTENT_BLOB_PROBE_MAX_SHAS } from "#src/features/publish-content/blob-staging";
import { computeBlobStorageKey } from "#src/features/media/index";

/**
 * @file Task 6 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 6.
 *
 * Route-level tests for the blob pre-flight routes, against the hermetic in-memory composition root
 * (`createApp()`/`createRouteDeps()` — no filesystem, no `content.db`), mirroring
 * `publish-content-export.test.ts`'s own harness (same file, same login helpers duplicated here
 * per that file's own precedent of not sharing test harness code across route test files).
 *
 * Required tests (dispatch brief): probe short-circuits an already-present sha; a re-uploaded sha
 * writes nothing (`written: false`); a sha whose bytes do not hash to it is REFUSED.
 */

const WORKSPACE = "workspace-local";

async function startServer(deps: ReturnType<typeof createRouteDeps> = createRouteDeps()) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
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

/** Holds the wildcard `*` (identity/seed.ts) — every permission check passes regardless of whether
 *  Task 9's `publish_content.apply` builtin-role grant has landed yet. */
async function loginAsOwner(baseUrl: string): Promise<string> {
  return loginAs(baseUrl, "admin", "tovu-dev");
}

/** Log in with exactly the requested grants, as in publish-content-blob-get.test.ts. */
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

function sha256Of(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256OfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("PUT .../blobs/:sha 404s when the URL workspace does not match this composition's own workspace", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);
  const bytes = Buffer.from("hello");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/publish-content/blobs/${sha256Of("hello")}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64: bytes.toString("base64") }),
  });
  assert.equal(res.status, 404);
});

test("PUT .../blobs/:sha is 401 without a credential and 403 for a principal lacking publish_content.apply", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const anonymous = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${"a".repeat(64)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataBase64: "aGVsbG8=" }),
  });
  assert.equal(anonymous.status, 401);
  const bytes = Buffer.from("forbidden blob bytes");
  const sha = sha256OfBytes(bytes);
  const storageKey = computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: sha });
  for (const [username, permissions] of [["bare-blob-writer", []], ["read-only-blob-writer", ["publish_content.read"]]] as const) {
    const cookie = await loginWithPermissions(deps, baseUrl, { username, permissions });
    const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${sha}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dataBase64: bytes.toString("base64") }),
    });
    assert.equal(denied.status, 403);
    const body = await denied.json() as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "publish_content.apply");
    assert.equal(await deps.blobStore.exists({ storageKey }), false);
    const probe = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ shas: [sha] }),
    });
    assert.equal(probe.status, 403);
    const probeBody = await probe.json() as { code: string; details: { permission: string } };
    assert.equal(probeBody.code, "FORBIDDEN");
    assert.equal(probeBody.details.permission, "publish_content.apply");
    assert.equal(await deps.blobStore.exists({ storageKey }), false);
  }
});

test("PUT .../blobs/:sha writes real bytes once, then reports written:false on re-upload of the same sha (idempotent dedupe)", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);
  const bytes = Buffer.from("real blob bytes for dedupe test");
  const sha = sha256Of(bytes.toString("utf8"));
  const dataBase64 = bytes.toString("base64");

  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${sha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64 }),
  });
  const firstRaw = await first.text();
  assert.equal(first.status, 200, firstRaw);
  const firstBody = JSON.parse(firstRaw) as { sha256: string; written: boolean };
  assert.equal(firstBody.sha256, sha);
  assert.equal(firstBody.written, true);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${sha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64 }),
  });
  const secondRaw = await second.text();
  assert.equal(second.status, 200, secondRaw);
  const secondBody = JSON.parse(secondRaw) as { sha256: string; written: boolean };
  assert.equal(secondBody.written, false, "re-uploading an already-present sha must write nothing");
});

test("PUT .../blobs/:sha REFUSES bytes that do not hash to the claimed sha256 (security property, plan §4 task 6)", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);
  const realSha = sha256Of("victim content");
  const attackerBytes = Buffer.from("attacker-controlled bytes").toString("base64");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${realSha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64: attackerBytes }),
  });
  const raw = await res.text();
  assert.equal(res.status, 422, raw);
  const body = JSON.parse(raw) as { code: string };
  assert.equal(body.code, "SHA256_MISMATCH");

  // And the mismatched bytes must never have been written under that sha — a probe for it must
  // still report it missing.
  const probe = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ shas: [realSha] }),
  });
  const probeRaw = await probe.text();
  assert.equal(probe.status, 200, probeRaw);
  const probeBody = JSON.parse(probeRaw) as { missing: string[] };
  assert.deepEqual(probeBody.missing, [realSha]);
});

test("PUT .../blobs/:sha 400s on malformed base64 even when the claimed sha is what a lenient decoder would produce", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);

  for (const malformed of ["!!!!", "Zm9v$", "Zm9", "Zm9v\nYmFy"]) {
    const lenientBytes = Buffer.from(malformed, "base64");
    const claimedSha = sha256OfBytes(lenientBytes);

    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${claimedSha}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dataBase64: malformed }),
    });
    const raw = await res.text();
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(malformed)}, got ${res.status}: ${raw}`);
    assert.deepEqual(JSON.parse(raw), { error: "dataBase64 is required and must be valid base64" });

    const storageKey = computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: claimedSha });
    assert.equal(
      await deps.blobStore.exists({ storageKey }),
      false,
      `blob store must not hold a write under the claimed sha for ${JSON.stringify(malformed)}`,
    );
  }
});

test("PUT .../blobs/:sha 400s on a malformed sha param (not lowercase 64-hex)", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/not-a-sha`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64: "aGVsbG8=" }),
  });
  assert.equal(res.status, 400);
});

test("POST .../blobs/probe SHORT-CIRCUITS an already-present sha (required Task 6 property)", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);
  const present = Buffer.from("already have this one");
  const presentSha = sha256Of(present.toString("utf8"));
  const absentSha = sha256Of("never uploaded");

  const upload = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${presentSha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataBase64: present.toString("base64") }),
  });
  assert.equal(upload.status, 200, await upload.text());

  const probe = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ shas: [presentSha, absentSha] }),
  });
  const probeRaw = await probe.text();
  assert.equal(probe.status, 200, probeRaw);
  const body = JSON.parse(probeRaw) as { missing: string[] };
  assert.deepEqual(body.missing, [absentSha], "an already-present sha must be omitted from `missing`");
});

test("POST .../blobs/probe 400s on a non-array / oversized / malformed shas payload", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cookie = await loginAsOwner(baseUrl);

  const notArray = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ shas: "not-an-array" }),
  });
  assert.equal(notArray.status, 400);

  const malformed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ shas: ["not-a-valid-sha"] }),
  });
  assert.equal(malformed.status, 400);
  let existenceChecks = 0;
  const exists = deps.blobStore.exists.bind(deps.blobStore);
  deps.blobStore.exists = async (input) => { existenceChecks++; return exists(input); };
  const oversized = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ shas: Array.from({ length: PUBLISH_CONTENT_BLOB_PROBE_MAX_SHAS + 1 }, (_, i) => sha256Of(`probe-${i}`)) }),
  });
  assert.equal(oversized.status, 400);
  assert.deepEqual(await oversized.json(), { error: `at most ${PUBLISH_CONTENT_BLOB_PROBE_MAX_SHAS} shas are allowed per request` });
  assert.equal(existenceChecks, 0, "reject oversized valid-hash payloads before probing storage");
});
