import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminSiteBackupRoutes } from "#src/server/runtime/composition/modules/system-site-backups";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SiteBackupToolDeps } from "#src/features/site-backup/backup-service";

/**
 * w4-routes K (RT-K1-adm-system-15): the exact wire of the site-backup door's own gates, captured
 * through the real registrar on the hand-written route BEFORE its move to a Jini raw spec, and kept
 * green after: `res.sendStatus(404)` / `res.sendStatus(403)`'s plain-text replies (not the shared
 * JSON 404), both headers on every answer, the workspace refusal ahead of the publish-trust one, and
 * a missing session answered by the route's own redacted `BACKUP_FAILED` 500.
 */
async function serve(t: test.TestContext, { principal = true, trusted = false }: { principal?: boolean; trusted?: boolean } = {}) {
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }) } as unknown as SiteBackupToolDeps;
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => {
    if (principal) res.locals.principal = { id: "owner" };
    if (trusted) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 };
    next();
  });
  registerAdminSiteBackupRoutes({ app, deps });
  const base = await startTestServer(app, t);
  return async (workspaceId: string, step: "plan" | "push") => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}/site-backups/${step}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return {
      status: response.status, type: response.headers.get("content-type"), text: await response.text(),
      cache: response.headers.get("cache-control"), sniff: response.headers.get("x-content-type-options"),
    };
  };
}

const gated = { cache: "no-store", sniff: "nosniff" };

test("site-backups: workspace and publish-trust refusals are sendStatus text, in that order, with both headers", async (t) => {
  const trusted = await serve(t, { trusted: true });
  for (const step of ["plan", "push"] as const) {
    assert.deepEqual(await trusted("other", step), { status: 404, type: "text/plain; charset=utf-8", text: "Not Found", ...gated });
    assert.deepEqual(await trusted("ws", step), { status: 403, type: "text/plain; charset=utf-8", text: "Forbidden", ...gated });
  }
});

test("site-backups: a missing session is the route's redacted BACKUP_FAILED 500, after the workspace refusal", async (t) => {
  const anonymous = await serve(t, { principal: false });
  assert.deepEqual(await anonymous("other", "plan"), { status: 404, type: "text/plain; charset=utf-8", text: "Not Found", ...gated });
  const failed = await anonymous("ws", "plan");
  assert.equal(failed.status, 500);
  assert.equal(failed.type, "application/json; charset=utf-8");
  assert.equal(failed.cache, "no-store");
  // The error id and timestamp vary per failure; everything else is the route's own copy.
  const normalized = JSON.parse(failed.text.replaceAll(/ERR-[\w-]+/g, "<id>").replaceAll(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<t>"));
  assert.deepEqual(normalized, { code: "BACKUP_FAILED", errorId: "<id>", message: "The site backup preparation could not be completed. Check the result before repeating this operation. Report this error ID. (error <id>)" });
});
