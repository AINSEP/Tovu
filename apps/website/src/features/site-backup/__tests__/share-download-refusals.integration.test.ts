import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, get as httpGet } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminSiteShareRoutes } from "#src/server/runtime/composition/modules/system-site-shares";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The authenticated share download's refusals that sit between the registry row and the
 * stored bytes: a row whose credentials still need acknowledging, and a stored path that cannot be
 * streamed for a reason other than a missing file. The registry is a fixed-row port; the route,
 * its gate and Express's real `sendFile` run unchanged.
 */

type Row = { shareId: string; file: string; status: string; needsAcknowledgement?: boolean; credentialWarnings?: unknown[] };

async function download(t: { after(fn: () => unknown): void }, row: Row, directory?: string) {
  const routeErrors = createRouteIncidentReporter().errors;
  const root = directory ?? await mkdtemp(path.join(tmpdir(), "share-download-refusal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lookups: unknown[] = [];
  const registry = { directory: root, get: async (input: unknown) => { lookups.push(input); return row; } };
  const app = express();
  let headers: Record<string, unknown> = {};
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" };
    res.on("finish", () => { headers = res.getHeaders(); });
    next();
  });
  registerAdminSiteShareRoutes({ errors: routeErrors, app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true }), siteShareBackend: { registry } } as unknown as RouteDeps });
  const response = await dispatchJsonRequest(app, "GET", `/api/admin/v1/workspaces/ws/site-shares/${row.shareId}/download`);
  return { response, headers, lookups, root };
}

const ACK_MESSAGE = "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.";

test("a share whose credential warnings are unacknowledged is refused with those warnings and no file", async t => {
  const warnings = [{ path: "config/.env", kind: "env-file" }];
  const { response, headers, lookups } = await download(t, { shareId: "share-ack", file: "site.tovu.zip", status: "ready", needsAcknowledgement: true, credentialWarnings: warnings });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { code: "ACKNOWLEDGE_CREDENTIALS", message: ACK_MESSAGE, credentialWarnings: warnings });
  assert.equal(headers["content-disposition"], undefined);
  assert.equal(headers["cache-control"], "no-store");
  assert.deepEqual(lookups, [{ shareId: "share-ack", site: "ws" }]);
});

test("an unacknowledged share without a warning list is refused with an empty list", async t => {
  const { response } = await download(t, { shareId: "share-ack-bare", file: "site.tovu.zip", status: "ready", needsAcknowledgement: true });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { code: "ACKNOWLEDGE_CREDENTIALS", message: ACK_MESSAGE, credentialWarnings: [] });
});

test("a stored path that cannot be streamed (a directory, not a missing file) fails as a server error without the attachment header", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "share-download-dir-"));
  await mkdir(path.join(root, "share-dir.tovu.zip"));
  const { response, headers } = await download(t, { shareId: "share-dir", file: "site.tovu.zip", status: "ready", needsAcknowledgement: false }, root);
  const body = response.body as { code: string; details: { failure: { message: string; step: string } } };
  assert.equal(response.status, 500, "only a missing ZIP is reported as missing (404)");
  assert.equal(body.code, "SHARE_FAILED");
  assert.equal(body.details.failure.message, "Export download could not finish.");
  assert.equal(body.details.failure.step, "Export download");
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
  assert.equal(headers["content-disposition"], undefined);
});

test("a client that drops the connection mid-stream gets its socket destroyed, with no JSON rewrite and no incident", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "share-download-abort-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "share-big.tovu.zip"), Buffer.alloc(32 * 1024 * 1024, 7));
  const incidents = createRouteIncidentReporter();
  const registry = { directory: root, get: async () => ({ shareId: "share-big", file: "site.tovu.zip", status: "ready", needsAcknowledgement: false }) };
  const app = express();
  const events: string[] = [];
  let closed!: () => void;
  const serverClosed = new Promise<void>(resolve => { closed = resolve; });
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" };
    const destroy = res.destroy.bind(res);
    res.destroy = (error?: Error) => { events.push(`destroy:headersSent=${res.headersSent}:disposition=${String(res.getHeader("content-disposition"))}`); return destroy(error); };
    res.on("close", () => { setTimeout(closed, 50); });
    next();
  });
  registerAdminSiteShareRoutes({ errors: incidents.errors, app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true }), siteShareBackend: { registry } } as unknown as RouteDeps });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address() as AddressInfo;
  const status = await new Promise<number>((resolve, reject) => {
    const request = httpGet({ host: "127.0.0.1", port: address.port, path: "/api/admin/v1/workspaces/ws/site-shares/share-big/download" }, response => {
      resolve(response.statusCode ?? 0);
      request.destroy();
    });
    request.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error); });
  });
  await serverClosed;
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(status, 200, "the stream had started (head sent) before the client dropped");
  assert.deepEqual(events, ['destroy:headersSent=true:disposition=attachment; filename="site.tovu.zip"']);
  assert.deepEqual(incidents.entries, []);
  assert.deepEqual(incidents.reports, []);
});
