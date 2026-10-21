import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { PUSH_POLL_WAIT_MS, registerAdminSiteBackupRoutes } from "../site-backups.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SiteBackupToolDeps } from "#src/features/site-backup/backup-service";

/** The route is a thin door onto `backup-service.ts` (whose plan/push behaviour the site-backup tool
 *  tests cover); these pin what the door itself owns: workspace 404, publish-trust 403, no-store,
 *  error mapping, the service's own refusal passed through, and the short push wait. */
test("site-backup routes gate, map errors and run the shared plan/push service", async (t) => {
  let allowed = true, trusted = false, authorizeThrows = false;
  const waits: number[] = [];
  const progress = { filesDone: 1, filesTotal: 2, bytesDone: 10, bytesTotal: 20 };
  const jobs = {
    find: ({ planId }: { planId: string }) => (planId === "running-plan" ? { planId } : undefined),
    wait: async (_job: unknown, options: { budgetMs: number }) => { waits.push(options.budgetMs); return { state: "running", progress, elapsedMs: 1500 }; },
  };
  const deps = {
    workspaceId: "ws",
    authorize: async () => { if (authorizeThrows) throw new Error("SECRET internals"); return { allowed, reason: "test" }; },
    siteBackupPushJobs: jobs,
  } as unknown as SiteBackupToolDeps;
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; if (trusted) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 }; next(); });
  registerAdminSiteBackupRoutes({ app, deps });
  const base = await startTestServer(app, t), root = base + "/api/admin/v1/workspaces/ws/site-backups";
  const post = (path: string, body: unknown) => fetch(root + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  assert.equal((await fetch(root.replace("/ws/", "/other/") + "/plan", { method: "POST" })).status, 404);
  trusted = true; assert.equal((await post("/plan", { owner: "o", repo: "r" })).status, 403); trusted = false;

  // No site folder in this runtime: the service's own refusal comes back as 200, uncached.
  const unavailable = await post("/plan", { owner: "o", repo: "r" });
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.equal((await unavailable.json()).code, "UNAVAILABLE");

  const invalid = await post("/plan", { owner: "o", repo: "r", credential: 7 });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { code: "INVALID_INPUT", message: "'credential' must be a string" });
  const noPlanId = await post("/push", {});
  assert.equal(noPlanId.status, 400);
  assert.equal((await noPlanId.json()).code, "INVALID_INPUT");

  allowed = false;
  for (const path of ["/plan", "/push"]) {
    const denied = await post(path, { owner: "o", repo: "r", planId: "p" });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { code: "FORBIDDEN", message: "You do not have permission to back up this site." });
  }
  allowed = true;

  authorizeThrows = true;
  const broken = await post("/plan", { owner: "o", repo: "r" });
  assert.equal(broken.status, 500);
  assert.deepEqual(await broken.json(), { code: "BACKUP_FAILED", message: "Git backup failed. Try again." });
  authorizeThrows = false;

  const running = await (await post("/push", { planId: "running-plan" })).json();
  assert.equal(running.inProgress, true);
  assert.deepEqual(running.progress, progress);
  assert.deepEqual(waits, [PUSH_POLL_WAIT_MS]);
});
