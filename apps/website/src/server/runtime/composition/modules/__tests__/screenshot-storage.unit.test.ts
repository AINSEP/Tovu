import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import express from "express";
import { captureRootFor } from "@jini-ai/integrations/web-screenshot/capture-files";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { bindCaptureRetention } from "#src/features/web-screenshot/capture-retention";
import { adminSameOriginWrites, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { captureWriterFence, mountScreenshotCleanup, screenshotOwnerFrom } from "../screenshot-storage.js";

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
