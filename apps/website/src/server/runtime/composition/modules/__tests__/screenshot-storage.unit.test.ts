import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import express from "express";
import { FileLockTimeoutError } from "@jini-ai/core/contracts/runtime";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { captureRootFor } from "@jini-ai/integrations/web-screenshot/capture-files";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { bindCaptureRetention } from "@jini-ai/integrations/web-screenshot/capture-retention";
import { adminSameOriginWrites, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { captureWriterFence, createScreenshotStorageModule, mountScreenshotCleanup, refusalForCleanupError, screenshotOwnerFrom } from "../screenshot-storage.js";

const WS = "ws";
const BASE = `/api/workspaces/${WS}/storage/screenshots`;

/** Real captures on disk, the real binding and fence, behind the real admin ports. */
async function harness() {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), "screenshot-storage-"));
  const file = path.join(captureRootFor({ siteDir }), "2026-01-01", "old.jpg");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "jpg");
  await fs.utimes(file, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 1)));
  const app = express();
  app.use(express.json());
  app.use(BASE, (req, res, next) => { res.locals.principal = { id: String(req.headers["x-test-principal"] ?? "owner") }; next(); });
  const retention = bindCaptureRetention({
    siteDir, captureRootFor, writerFence: captureWriterFence, fs, clock: () => Date.UTC(2026, 10, 25),
    previewStore: createCleanupPreviewStore({ randomToken: () => crypto.randomUUID(), mono: () => 0 }),
    authorizeOwner: screenshotOwnerFrom({ ownerPrincipalId: async () => "owner" }),
  }, {});
  mountScreenshotCleanup({ app, retention, adminPorts: { errors: createRouteIncidentReporter().errors, mount: mountAdminJsonRoute, deps: { workspaceId: WS, authorize: (() => ({ ok: true })) as never }, origin: adminSameOriginWrites } });
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (route: string, body: unknown, { principal = "owner", sameOrigin = true } = {}) => {
    const res = await fetch(`${origin}${BASE}/${route}`, { method: "POST", headers: { "content-type": "application/json", "x-test-principal": principal, origin: sameOrigin ? origin : "https://evil.example" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) as Record<string, any> | null };
  };
  return { call, file, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("screenshot cleanup is owner-only, same-origin, and deletes only after a confirmed preview", async () => {
  const h = await harness();
  try {
    const before = Date.UTC(2026, 5, 1);
    assert.equal((await h.call("preview", { before }, { principal: "editor" })).status, 403);
    assert.equal((await h.call("preview", { before }, { sameOrigin: false })).status, 403);
    const preview = await h.call("preview", { before });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body?.items, ["2026-01-01/old.jpg"]);
    const token = preview.body?.previewToken;
    assert.deepEqual(await h.call("apply", { previewToken: token }), { status: 400, body: { error: "Confirm the screenshot preview first.", code: "INVALID_INPUT" } });
    assert.equal((await h.call("apply", { previewToken: token, confirm: true }, { sameOrigin: false })).status, 403);
    assert.equal((await h.call("apply", { previewToken: token, confirm: true }, { principal: "editor" })).status, 403);
    await fs.access(h.file);
    const applied = await h.call("apply", { previewToken: token, confirm: true });
    assert.deepEqual(applied, { status: 200, body: { deleted: ["2026-01-01/old.jpg"], kept: [] } });
    const again = await h.call("apply", { previewToken: token, confirm: true });
    assert.equal(again.status, 410);
    assert.equal(again.body?.code, "PREVIEW_EXPIRED");
  } finally { await h.close(); }
});

test("production screenshot cleanup lazily binds the site's capture root and validates date and token", async (t) => {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), "screenshot-storage-module-"));
  t.after(() => fs.rm(siteDir, { recursive: true, force: true }));
  const capture = path.join(captureRootFor({ siteDir }), "2020-01-01", "owned.jpg");
  await fs.mkdir(path.dirname(capture), { recursive: true });
  await fs.writeFile(capture, "fixture capture");
  const created = new Date("2020-01-01T00:00:00.000Z");
  await fs.utimes(capture, created, created);

  let bindingReads = 0;
  const deps = {
    workspaceId: WS, ownerPrincipalId: "owner-14",
    authorize: async () => ({ allowed: true, reason: "test" }),
    get siteBinding() { bindingReads += 1; return { dir: siteDir }; },
  } as unknown as Parameters<typeof createScreenshotStorageModule>[0];
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner-14", workspaceId: WS, kind: "user", roles: [] };
    next();
  });
  const incidents = createRouteIncidentReporter();
  createScreenshotStorageModule(deps).registerRoutes?.({ app, errors: incidents.errors });
  const origin = await startTestServer(app, t);
  async function call(route: "preview" | "apply", body: unknown) {
    const res = await fetch(`${origin}${BASE}/${route}`, {
      method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as { previewToken?: string; items?: string[] } };
  }

  assert.equal(bindingReads, 0);
  assert.deepEqual(await call("preview", { before: "2021-01-01" }), {
    status: 400, body: { code: "INVALID_INPUT", error: "Choose the date to delete screenshots before." },
  });
  assert.deepEqual(await call("apply", { confirm: true, previewToken: 7 }), {
    status: 400, body: { code: "INVALID_INPUT", error: "Preview the screenshots to delete first." },
  });
  assert.equal(bindingReads, 0);
  const preview = await call("preview", { before: Date.parse("2021-01-01") });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.items, ["2020-01-01/owned.jpg"]);
  assert.match(preview.body.previewToken ?? "", /^[a-zA-Z0-9_-]{16,}$/);
  assert.equal(await fs.readFile(capture, "utf8"), "fixture capture");
  assert.deepEqual(await call("apply", { confirm: true, previewToken: preview.body.previewToken }), {
    status: 200, body: { deleted: ["2020-01-01/owned.jpg"], kept: [] },
  });
  await assert.rejects(fs.stat(capture), { code: "ENOENT" });
  assert.equal(bindingReads, 1);
  assert.deepEqual(incidents.entries, []);
});

test("screenshot cleanup translates a busy lock without disclosing its path and preserves unknown failures", () => {
  const lock = new FileLockTimeoutError({ lockPath: "/private/captures/owner.lock", holder: undefined, waitedMs: 15_000 });
  assert.throws(() => refusalForCleanupError({ error: lock }), (error: unknown) =>
    error instanceof RouteRefusalError && error.response.status === 409 &&
    assertBusyBody(error.response.body));
  const unknown = new Error("unexpected storage failure");
  assert.throws(() => refusalForCleanupError({ error: unknown }), (error: unknown) => error === unknown);
});

function assertBusyBody(body: unknown): true {
  assert.deepEqual(body, { code: "BUSY", error: "Screenshots are being saved right now. Try again in a moment." });
  return true;
}

test("screenshot cleanup maps the confirm wording to a 400, passes an existing refusal through, and never matches a non-Error rejection", () => {
  assert.throws(() => refusalForCleanupError({ error: new Error("Confirm the screenshot preview first.") }), (thrown: unknown) => {
    assert.ok(thrown instanceof RouteRefusalError);
    assert.deepEqual([thrown.response.status, thrown.response.body], [400, { code: "INVALID_INPUT", error: "Confirm the screenshot preview first." }]);
    return true;
  });
  const already = new RouteRefusalError({ status: 403, body: { code: "OWNER_ONLY", error: "Only the site owner can delete screenshots." } });
  assert.throws(() => refusalForCleanupError({ error: already }), (thrown: unknown) => thrown === already);
  assert.throws(() => refusalForCleanupError({ error: "This preview is out of date" }), (thrown: unknown) => thrown === "This preview is out of date");
});
