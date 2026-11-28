import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
