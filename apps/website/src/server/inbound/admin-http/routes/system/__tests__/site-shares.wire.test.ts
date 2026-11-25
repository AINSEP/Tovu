import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { registerAdminSiteShareRoutes } from "#src/server/runtime/composition/modules/system-site-shares";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { createSiteShare } from "#src/features/site-backup/share-service";
import { SHARE_LIMITS } from "#src/features/site-backup/share-policy";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";

/**
 * w4-routes K (RT-K1-adm-system-13): the exact wire of every admin site-share route, captured through
 * the real registrar on the hand-written routes BEFORE their move to Jini raw specs and kept green
 * after: the route's own `{ code: "NOT_FOUND", message: "<step> failed: …" }` workspace 404 (not the
 * shared JSON 404), `Cache-Control: no-store` on every answer, the refusal order (workspace →
 * connected-computer 403 → RBAC 403 → 503 → input), the artifact upload's body read only AFTER the
 * gates (an oversize upload from a foreign workspace is still the 404), and each step's failure copy.
 */
type Wire = { status: number; type: string | null; cache: string | null; body: unknown };
const ROOT = "/api/admin/v1/workspaces/ws/site-shares";
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("zip body")]);
const TOKEN = "AbCdEfGhIjKlMnOp";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** The error id and timestamps vary per failure; everything else is the route's own copy. */
function normalize(text: string): unknown {
  try { return JSON.parse(text.replaceAll(/ERR-[\w-]+/g, "<id>").replaceAll(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<t>")); }
  catch { return text; }
}

async function serve(t: test.TestContext) {
  const routeErrors = createRouteIncidentReporter().errors;
  const directory = fs.mkdtempSync(path.join(tmpdir(), "share-wire-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory, now: () => Date.now() });
  const state = { principal: true, trusted: false, allowed: true, available: true, failure: undefined as unknown, permissions: [] as string[], tracked: [] as unknown[] };
  const answer = async <T>(value: T): Promise<T> => { if (state.failure) throw state.failure; return value; };
  const backend = {
    registry,
    list: () => answer([{ shareId: "s1" }]),
    create: (input: Record<string, unknown>) => answer({ status: "active", input: { ...input, signal: input.signal instanceof AbortSignal } }),
    staticOptions: () => answer({ activeThemeId: "poster", themes: [] }),
    acknowledge: (input: { shareId: string }) => answer({ acknowledged: input.shareId }),
    revoke: (input: { shareId: string }) => answer({ revoked: input.shareId }),
  };
  const deps = {
    workspaceId: "ws", tracker: { error: (report: unknown) => { state.tracked.push(report); } },
    authorize: async (input: { permission: string }) => { state.permissions.push(input.permission); return { allowed: state.allowed, reason: "test" }; },
    get siteShareBackend() { return state.available ? backend : undefined; },
  } as unknown as RouteDeps;
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => {
    if (state.principal) res.locals.principal = { id: "owner" };
    if (state.trusted) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 };
    next();
  });
  registerAdminSiteShareRoutes({ errors: routeErrors, app, deps });
  const base = await startTestServer(app, t);
  const call = async (method: string, suffix: string, init: { body?: unknown; type?: string; workspace?: string } = {}): Promise<Wire> => {
    const url = `${base}${ROOT.replace("/ws/", `/${init.workspace ?? "ws"}/`)}${suffix}`;
    const body = init.body === undefined ? undefined : Buffer.isBuffer(init.body) ? new Uint8Array(init.body) : JSON.stringify(init.body);
    const headers = body === undefined ? undefined : { "content-type": init.type ?? "application/json" };
    const response = await fetch(url, { method, headers, body });
    return { status: response.status, type: response.headers.get("content-type"), cache: response.headers.get("cache-control"), body: normalize(await response.text()) };
  };
  return { state, call, registry, base };
}

const json = "application/json; charset=utf-8";
const wire = (status: number, body: unknown, type: string | null = json): Wire => ({ status, type, cache: "no-store", body });
const forbidden = (permission: string) => ({ error: `principal 'owner' is not authorized for '${permission}' (test)`, code: "FORBIDDEN", details: { permission, reason: "test" } });

/** Every route of the file, with its fixed step label. */
const ROUTES = [
  ["GET", "", "Export history"], ["POST", "", "Export creation"], ["GET", "/static/options", "Static export options"],
  ["POST", "/static", "Static export creation"], ["POST", `/${UUID}/acknowledge`, "Export acknowledgement"],
  ["GET", `/${UUID}/download`, "Export download"], ["DELETE", `/${UUID}`, "Export revocation"],
  ["PUT", `/artifacts/${TOKEN}/site.tovu.zip`, "Share artifact upload"], ["DELETE", `/artifacts/${TOKEN}/site.tovu.zip`, "Share artifact deletion"],
] as const;
const ARTIFACT = new Set(["Share artifact upload", "Share artifact deletion"]);
const uploadInit = { body: ZIP, type: "application/zip" };

test("site-shares wire: foreign workspace is the step's own NOT_FOUND, before every other gate", async (t) => {
  const { state, call } = await serve(t);
  state.principal = false; state.trusted = true; state.allowed = false; state.available = false;
  for (const [method, suffix, step] of ROUTES) {
    assert.deepEqual(await call(method, suffix, { workspace: "other", ...(method === "PUT" ? uploadInit : {}) }), wire(404, { code: "NOT_FOUND", message: `${step} failed: this workspace is not available.` }), step);
  }
  assert.deepEqual(state.permissions, []);
});

test("site-shares wire: a connected-computer session is refused on admin operations, authorized by its grant on artifacts", async (t) => {
  const { state, call } = await serve(t);
  state.trusted = true;
  for (const [method, suffix, step] of ROUTES) {
    const got = await call(method, suffix, method === "PUT" ? { body: ZIP, type: "text/plain" } : {});
    if (ARTIFACT.has(step)) assert.notEqual(got.status, 403, step);
    else assert.deepEqual(got, wire(403, { code: "FORBIDDEN", message: `${step} requires an authorized admin session.` }), step);
  }
  assert.deepEqual(state.permissions, [], "a publishing grant answers from its own capability set, never RBAC");
});

test("site-shares wire: RBAC denial, then the missing backend, then a missing session's redacted 500", async (t) => {
  const { state, call } = await serve(t);
  state.allowed = false;
  for (const [method, suffix, step] of ROUTES) assert.deepEqual(await call(method, suffix, method === "PUT" ? uploadInit : {}), wire(403, forbidden("site-backup.push")), step);
  assert.equal(state.permissions.every((permission) => permission === "site-backup.push"), true);
  state.allowed = true; state.available = false;
  for (const [method, suffix, step] of ROUTES) {
    assert.deepEqual(await call(method, suffix, method === "PUT" ? uploadInit : {}), wire(503, { code: "UNAVAILABLE", message: `${step} requires a site folder and private artifact storage.` }), step);
  }
  state.available = true; state.principal = false;
  // A missing session discloses no details: the copy is sendAdminFailure's method/route-derived line.
  const missing: Record<string, unknown> = {};
  for (const [method, suffix, step] of ROUTES) {
    const got = await call(method, suffix, method === "PUT" ? uploadInit : {});
    assert.deepEqual({ ...got, body: undefined }, { ...wire(500, undefined) }, step);
    missing[step] = got.body;
  }
  assert.deepEqual(missing, MISSING_SESSION_BODIES);
});

const MISSING_SESSION_BODIES: Record<string, unknown> = {
  "Export history": { code: "SHARE_FAILED", errorId: "<id>", message: "The site shares could not be loaded. Try loading them again. If it still fails, Report this error ID. (error <id>)" }, "Static export options": { code: "SHARE_FAILED", errorId: "<id>", message: "The site shares could not be loaded. Try loading them again. If it still fails, Report this error ID. (error <id>)" }, "Export download": { code: "SHARE_FAILED", errorId: "<id>", message: "The site shares could not be loaded. Try loading them again. If it still fails, Report this error ID. (error <id>)" },
  "Export creation": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share operation could not be completed. Check the result before repeating this operation. Report this error ID. (error <id>)" }, "Static export creation": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share operation could not be completed. Check the result before repeating this operation. Report this error ID. (error <id>)" }, "Export acknowledgement": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share operation could not be completed. Check the result before repeating this operation. Report this error ID. (error <id>)" },
  "Export revocation": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share removal could not be confirmed. Check the list before repeating the removal. Report this error ID. (error <id>)" }, "Share artifact deletion": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share removal could not be confirmed. Check the list before repeating the removal. Report this error ID. (error <id>)" },
  "Share artifact upload": { code: "SHARE_FAILED", errorId: "<id>", message: "The site share save could not be completed. Check whether your changes were saved before repeating the save. Report this error ID. (error <id>)" },
};

test("site-shares wire: input refusals and successes of the admin operations", async (t) => {
  const { state, call } = await serve(t);
  const invalid = (step: string, message: string) => wire(400, { code: "INVALID_INPUT", message: `${step} failed: ${message}` });
  assert.deepEqual(await call("GET", ""), wire(200, { shares: [{ shareId: "s1" }] }));
  assert.deepEqual(await call("POST", "", { body: { share: true } }), invalid("Export creation", "Exports no longer include saved keys. Start an export with {}, or poll with jobId only."));
  assert.deepEqual(await call("POST", "", { body: { jobId: "x" } }), invalid("Export creation", "jobId must be a share job id."));
  assert.deepEqual(await call("POST", "", { body: { jobId: UUID } }), wire(200, { status: "active", input: { principalId: "owner", signal: true, jobId: UUID } }));
  assert.deepEqual(await call("POST", ""), wire(200, { status: "active", input: { principalId: "owner", signal: true } }));
  assert.deepEqual(await call("GET", "/static/options"), wire(200, { activeThemeId: "poster", themes: [] }));
  const badStatic = await call("POST", "/static", { body: { nope: 1 } });
  assert.equal(badStatic.status, 400); assert.equal(badStatic.cache, "no-store");
  assert.match((badStatic.body as { message: string }).message, /^Static export creation failed: /);
  assert.deepEqual(await call("POST", "/static"), wire(200, { status: "active", input: { principalId: "owner", signal: true, format: "static" } }));
  assert.deepEqual(await call("POST", `/${UUID}/acknowledge`), wire(200, { acknowledged: UUID }));
  assert.deepEqual(await call("DELETE", `/${UUID}`), wire(200, { revoked: UUID }));
  assert.deepEqual(state.tracked, []);
});

test("site-shares wire: backend refusals keep their status and step; unexpected failures are tracked SHARE_FAILED 500s", async (t) => {
  const { state, call } = await serve(t);
  t.mock.method(console, "error", () => {});
  state.failure = new SiteShareRefusal({ code: "NOT_FOUND", message: "this export was not found." });
  assert.deepEqual(await call("POST", `/${UUID}/acknowledge`), wire(404, { code: "NOT_FOUND", message: "Export acknowledgement failed: this export was not found." }));
  state.failure = new SiteShareRefusal({ code: "FORBIDDEN", message: "no." });
  assert.deepEqual(await call("DELETE", `/${UUID}`), wire(403, { code: "FORBIDDEN", message: "Export revocation failed: no." }));
  state.failure = new Error("disk exploded");
  for (const [method, suffix, step] of ROUTES.filter(([, , step]) => !step.startsWith("Share artifact") && step !== "Export download")) {
    const got = await call(method, suffix);
    assert.equal(got.status, 500, step); assert.equal(got.cache, "no-store"); assert.equal(got.type, json);
    const body = got.body as { code: string; message: string; details: { failure: { step: string; action: string } } };
    assert.equal(body.code, "SHARE_FAILED", step);
    assert.match(body.message, new RegExp(`^${step} could not finish\\.`), step);
    assert.equal(body.details.failure.step, step);
  }
  assert.equal(state.tracked.length, 6);
});

test("site-shares wire: download refusals, acknowledgement and the ZIP itself", async (t) => {
  const { call, registry } = await serve(t);
  assert.deepEqual(await call("GET", `/${UUID}/download`), wire(404, { code: "NOT_FOUND", message: "Export download failed: this export is missing or was revoked." }));
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: ZIP });
  const got = await call("GET", `/${row.shareId}/download`);
  assert.equal(got.status, 200); assert.equal(got.type, "application/zip");
  assert.match(String(got.body), /zip body/);
});

test("P11 ST-12b: the owner download of an expired export answers the expired message, not the ZIP", async (t) => {
  const { call, registry } = await serve(t);
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: ZIP });
  await registry.markExpired({ shareId: row.shareId, expiresAt: "2026-11-20T00:00:00.000Z" });
  await registry.put({ record: { ...row, expiresAt: "2026-11-20T00:00:00.000Z" } });
  assert.deepEqual(await call("GET", `/${row.shareId}/download`), wire(410, { code: "EXPIRED", message: "This link expired on 2026-11-20 and its file was removed." }));
});

/** Streams `bytes` bytes (a ZIP signature, then zeros), stopping once the server closes or answers. */
async function sendAll({ socket, bytes }: { socket: net.Socket; bytes: number }): Promise<void> {
  const chunk = Buffer.alloc(1 << 20);
  ZIP.copy(chunk);
  for (let sent = 0; sent < bytes && !socket.destroyed;) {
    const size = Math.min(chunk.length, bytes - sent);
    sent += size;
    if (!socket.write(size === chunk.length ? chunk : chunk.subarray(0, size))) await new Promise((resolve) => { socket.once("drain", resolve); socket.once("close", resolve); });
  }
}

/** An upload whose `Content-Length` is over the cap, on a raw socket. The gates answer without reading
 *  it; past them the parser refuses it from the header, but body-parser drains the request before it
 *  hands on its 413, so the whole declared body is streamed. */
function oversize({ base, workspace }: { base: string; workspace: string }): Promise<Wire> {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), "127.0.0.1");
    let text = "";
    socket.on("data", (chunk: Buffer) => {
      text += chunk.toString("latin1");
      const split = text.indexOf("\r\n\r\n");
      if (split < 0) return;
      const head = text.slice(0, split), length = Number(/content-length: (\d+)/i.exec(head)?.[1] ?? 0), body = text.slice(split + 4);
      if (body.length < length) return;
      socket.destroy();
      const header = (name: string) => new RegExp(`^${name}: (.*)$`, "im").exec(head)?.[1] ?? null;
      resolve({ status: Number(head.split(" ")[1]), type: header("content-type"), cache: header("cache-control"), body: normalize(body) });
    });
    socket.on("error", reject);
    socket.write(`PUT ${ROOT.replace("/ws/", `/${workspace}/`)}/artifacts/${TOKEN}/site.tovu.zip HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/zip\r\nContent-Length: ${SHARE_LIMITS.maxArchiveBytes + 1}\r\n\r\n`);
    void sendAll({ socket, bytes: SHARE_LIMITS.maxArchiveBytes + 1 });
  });
}

test("site-shares wire: artifact upload reads its body only after the gates, then validates identity and bytes", async (t) => {
  const { state, call, base } = await serve(t);
  const step = "Share artifact upload";
  const invalid = wire(400, { code: "INVALID_INPUT", message: `${step} failed: Expected a .tovu.zip artifact with a 16-letter token and application/zip body.` });
  assert.deepEqual(await oversize({ base, workspace: "other" }), wire(404, { code: "NOT_FOUND", message: `${step} failed: this workspace is not available.` }));
  assert.deepEqual(await oversize({ base, workspace: "ws" }), wire(413, { code: "LIMIT_EXCEEDED", message: `${step} failed: upload raw application/zip bytes within the 300 MiB cap.` }));
  assert.deepEqual(await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`, { body: ZIP, type: "text/plain" }), invalid);
  assert.deepEqual(await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`), invalid);
  assert.deepEqual(await call("PUT", `/artifacts/short/site.tovu.zip`, uploadInit), invalid);
  assert.deepEqual(await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`, { body: Buffer.from("not a zip"), type: "application/zip" }), invalid);
  const created = await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`, uploadInit);
  assert.equal(created.status, 201); assert.equal(created.cache, "no-store");
  assert.deepEqual(Object.keys(created.body as object), ["shareId", "bytes", "sha256"]);
  assert.equal((created.body as { bytes: number }).bytes, ZIP.length);
  const replay = await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`, uploadInit);
  assert.deepEqual(replay, REPLAY);
  state.trusted = true;
  assert.equal((await call("PUT", `/artifacts/${"Z".repeat(16)}/site.tovu.zip`, uploadInit)).status, 201, "a connected computer may upload");
});

/** Tokens are never reused: a replayed upload is the registry's own refusal, with the step label. */
const REPLAY: Wire = wire(400, { code: "TOKEN_EXISTS", message: "Share artifact upload failed: This share token has already been used. Create a new export." });

test("site-shares wire: artifact deletion answers 404 for an unknown artifact and a bodiless 204 after disabling it", async (t) => {
  const { call } = await serve(t);
  const step = "Share artifact deletion";
  assert.deepEqual(await call("DELETE", `/artifacts/${TOKEN}/site.tovu.zip`), wire(404, { code: "NOT_FOUND", message: `${step} failed: this export was not found.` }));
  assert.equal((await call("PUT", `/artifacts/${TOKEN}/site.tovu.zip`, uploadInit)).status, 201);
  assert.deepEqual(await call("DELETE", `/artifacts/${TOKEN}/site.tovu.zip`), wire(204, "", null));
  assert.deepEqual(await call("DELETE", `/artifacts/${TOKEN}/site.tovu.zip`), wire(204, "", null), "the row stays listed after disable");
});

test("P11 ST-12a: the create bodies carry the owner's expiry choice to the backend; other values are refused before it", async t => {
  const { call } = await serve(t);
  assert.deepEqual((await call("POST", "", { body: { expiresInDays: 30 } })).body, { status: "active", input: { principalId: "owner", signal: true, expiresInDays: 30 } });
  assert.deepEqual((await call("POST", "", { body: {} })).body, { status: "active", input: { principalId: "owner", signal: true } }, "no choice stays no choice: Never");
  const refused = await call("POST", "", { body: { expiresInDays: 14 } });
  assert.equal(refused.status, 400);
  assert.equal((refused.body as { message?: string }).message, "Export creation failed: A share link can expire after 7, 30 or 90 days, or never.");
});
