import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { S3BlobStore } from "#src/features/media/blob-store.s3";
import { createApp } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { loginAsOwner, startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file The SQLite composition's opt-in boot branches that the default boot never takes (F2244):
 * the `TOVU_ADMIN_RESET_PASSWORD` boot reset (awaited through `deps.adminPasswordResetReady`, then
 * proven by logging in over HTTP) and `TOVU_MEDIA_BLOB_STORE`'s backend selection (an unknown
 * backend and an incomplete S3 config refuse to boot with their exact operator-facing message; a
 * complete S3 config swaps in the S3 store and takes uploads out of the site backup).
 */

const BOOT_ENV = [
  "TOVU_ADMIN_RESET_PASSWORD",
  "TOVU_ADMIN_RESET_USERNAME",
  "TOVU_MEDIA_BLOB_STORE",
  "TOVU_S3_BUCKET",
  "TOVU_S3_REGION",
  "TOVU_S3_ACCESS_KEY_ID",
  "TOVU_S3_SECRET_ACCESS_KEY",
  "TOVU_S3_ENDPOINT",
  "TOVU_S3_KEY_PREFIX",
] as const;

/** Clears every boot option this file sets, applies `env`, and restores the originals afterwards. */
function withBootEnv(t: TestContext, env: Partial<Record<(typeof BOOT_ENV)[number], string>>): void {
  const saved = Object.fromEntries(BOOT_ENV.map((name) => [name, process.env[name]]));
  for (const name of BOOT_ENV) delete process.env[name];
  Object.assign(process.env, env);
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function siteDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-boot-options-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

type SiteDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;

/** Settles every boot promise before the store closes and the folder is removed, so no boot task
 *  outlives its test (the same set `create-site-route-deps.postgres.test.ts` drains). */
function closeAfter(t: TestContext, deps: SiteDeps): void {
  t.after(async () => {
    await Promise.all(
      [deps.identityReady, deps.settingsReady, deps.seoReady, deps.commentsReady, deps.commentsSettingsReady, deps.executionSettingsReady, deps.settingsUiTabsReady, deps.analyticsSettingsReady, deps.siteTitleReady, deps.pluginRuntimeReady, deps.blobHydrationReady, deps.adminPasswordResetReady].map((ready) => Promise.resolve(ready).catch(() => undefined))
    );
    await deps.contentKernel?.close();
  });
}

async function loginStatus(baseUrl: string, password: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  await res.text();
  return res.status;
}

/** Captures `console.error` lines for the rest of the test (the reset reports only there). */
function captureErrors(t: TestContext): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  t.after(() => {
    console.error = original;
  });
  return lines;
}

const NEW_PASSWORD = "Reset-Passw0rd-F2244-boot";

test("TOVU_ADMIN_RESET_PASSWORD resets the admin password at boot: the new one logs in and the seeded one no longer does", async (t) => {
  withBootEnv(t, { TOVU_ADMIN_RESET_PASSWORD: NEW_PASSWORD });
  const errors = captureErrors(t);
  const dir = siteDir(t);
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  closeAfter(t, deps);
  await deps.identityReady;
  assert.ok(deps.adminPasswordResetReady, "the real composition exposes the boot reset's completion");
  await deps.adminPasswordResetReady;

  assert.ok(errors.some((line) => line.includes("[admin-password-reset] SUCCESS — username='admin'")), errors.join("\n"));
  const baseUrl = await startTestServer(createApp(deps), t);
  assert.equal(await loginStatus(baseUrl, NEW_PASSWORD), 200, "the reset password logs in");
  assert.equal(await loginStatus(baseUrl, "tovu-dev"), 401, "the seeded password no longer logs in");
});

test("a boot reset for a username that does not exist resolves without throwing, reports FAILED, and leaves the seeded password working", async (t) => {
  withBootEnv(t, { TOVU_ADMIN_RESET_PASSWORD: NEW_PASSWORD, TOVU_ADMIN_RESET_USERNAME: "no-such-admin" });
  const errors = captureErrors(t);
  const dir = siteDir(t);
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  closeAfter(t, deps);
  await deps.identityReady;
  await deps.adminPasswordResetReady;

  assert.ok(errors.some((line) => line.includes("[admin-password-reset] FAILED for username='no-such-admin'") && line.includes("user 'no-such-admin' was not found")), errors.join("\n"));
  const baseUrl = await startTestServer(createApp(deps), t);
  assert.equal(await loginStatus(baseUrl, "tovu-dev"), 200, "the seeded password still logs in");
  assert.equal(await loginStatus(baseUrl, NEW_PASSWORD), 401, "nothing was reset");
});

test("an unknown TOVU_MEDIA_BLOB_STORE refuses to boot, naming the accepted backends", async (t) => {
  withBootEnv(t, { TOVU_MEDIA_BLOB_STORE: "gcs" });
  const dir = siteDir(t);
  await assert.rejects(createSiteRouteDeps(path.join(dir, "content.db")), { message: "Unknown TOVU_MEDIA_BLOB_STORE 'gcs' — expected 'local' or 's3'." });
});

test("TOVU_MEDIA_BLOB_STORE=s3 with missing variables refuses to boot, naming every required one and exactly the missing ones", async (t) => {
  withBootEnv(t, { TOVU_MEDIA_BLOB_STORE: "s3", TOVU_S3_BUCKET: "tovu-media", TOVU_S3_ACCESS_KEY_ID: "AKIA-F2244" });
  const dir = siteDir(t);
  await assert.rejects(createSiteRouteDeps(path.join(dir, "content.db")), {
    message: "TOVU_MEDIA_BLOB_STORE=s3 requires TOVU_S3_BUCKET, TOVU_S3_REGION, TOVU_S3_ACCESS_KEY_ID, TOVU_S3_SECRET_ACCESS_KEY — missing: TOVU_S3_REGION, TOVU_S3_SECRET_ACCESS_KEY.",
  });
});

test("a complete S3 config boots with the S3 blob store, and the site backup then leaves uploads out", async (t) => {
  // The endpoint is a closed local port, so any request the boot made to it would fail loudly
  // rather than reach a real bucket.
  withBootEnv(t, {
    TOVU_MEDIA_BLOB_STORE: "s3",
    TOVU_S3_BUCKET: "tovu-media",
    TOVU_S3_REGION: "eu-west-1",
    TOVU_S3_ACCESS_KEY_ID: "AKIA-F2244",
    TOVU_S3_SECRET_ACCESS_KEY: "secret-F2244",
    TOVU_S3_ENDPOINT: "http://127.0.0.1:9",
  });
  const dir = siteDir(t);
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  closeAfter(t, deps);
  await deps.identityReady;

  assert.ok(deps.blobStore instanceof S3BlobStore, "the S3 backend is the store media writes go to");
  assert.equal(deps.siteBackupSources?.mediaUploadsDir, null, "with media in S3 there is no local uploads folder to back up");
});

test("the composed plugin callbacks: enabling word-count over HTTP makes the next post save carry its count, disabling it stops that", async (t) => {
  withBootEnv(t, {});
  const dir = siteDir(t);
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  closeAfter(t, deps);
  await deps.identityReady;
  await deps.pluginRuntimeReady;
  const baseUrl = await startTestServer(createApp(deps), t);
  const cookie = await loginAsOwner(baseUrl);
  const ws = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`;
  const send = (method: string, url: string, body?: unknown) =>
    fetch(url, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const bodyJson = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const createPost = async (title: string, text: string): Promise<{ ext?: Record<string, unknown> }> => {
    const res = await send("POST", `${ws}/posts`, { title, status: "draft", bodyJson: bodyJson(text) });
    const payload = (await res.json()) as { post: { id: string } };
    assert.equal(res.status, 201, JSON.stringify(payload));
    const stored = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: payload.post.id });
    assert.ok(stored);
    return stored as { ext?: Record<string, unknown> };
  };

  const listed = (await (await send("GET", `${ws}/plugins`)).json()) as { plugins: Array<{ id: string; enabled: boolean }> };
  assert.equal(listed.plugins.find((p) => p.id === "word-count")?.enabled, false, "discoverPlugins lists the built-in, off by default");
  assert.equal((await createPost("Before", "one two three")).ext?.["word-count"], undefined, "no count while the plugin is off");

  assert.equal((await send("PATCH", `${ws}/plugins/word-count`, { enabled: true })).status, 200);
  assert.deepEqual((await createPost("On", "one two three four")).ext?.["word-count"], { count: 4 }, "onPluginEnabled attached the beforeSave hook");

  assert.equal((await send("PATCH", `${ws}/plugins/word-count`, { enabled: false })).status, 200);
  assert.equal((await createPost("Off", "one two")).ext?.["word-count"], undefined, "onPluginDisabled detached it again");
});
