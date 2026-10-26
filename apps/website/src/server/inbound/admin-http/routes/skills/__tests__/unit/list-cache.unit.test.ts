/** Skills validators match If-None-Match themselves, after workspace and permission guards. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createTempSiteLayoutFixture } from "#src/__tests__/fixtures/site-layout-context";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerSkillsListRoute } from "../../list.js";
import type { SkillsRouteDeps } from "../../deps.js";

test("matching validators return an empty 304; changed skills return a private 200 with a new ETag", async t => {
  const fixture = createTempSiteLayoutFixture({});
  t.after(fixture.cleanup);
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerSkillsListRoute(app, { ...fixture.deps, workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "test" }) });
  const base = await startTestServer(app, t);
  const url = `${base}/api/admin/v1/workspaces/workspace-local/skills`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { skills: [] });
  assert.equal(first.headers.get("cache-control"), "private, no-cache");
  assert.match(first.headers.get("vary") ?? "", /Cookie/);
  const etag = first.headers.get("etag");
  assert.ok(etag);
  // Default fetch mode, as the admin client sends it: fetch adds `Cache-Control: no-cache` here.
  const headers = { "If-None-Match": etag };
  const unchanged = await fetch(url, { headers });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
  assert.equal(unchanged.headers.get("etag"), etag);
  assert.equal(unchanged.headers.get("cache-control"), "private, no-cache");
  const directory = path.join(fixture.deps.skillLayout.forWorkspace("workspace-local").root, "new-skill");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "SKILL.md"), "---\nname: new-skill\ndescription: A new skill.\n---\nGuidance.\n");
  const changed = await fetch(url, { headers });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  assert.equal((await changed.json()).skills[0].name, "new-skill");
});

test("matching validators cannot bypass workspace or authorization guards or reach enumeration", async t => {
  const fixture = createTempSiteLayoutFixture({});
  t.after(fixture.cleanup);
  let allowed = true, refuseEnumeration = false, authorizations = 0;
  const deps: SkillsRouteDeps = {
    workspaceId: "workspace-local", siteBinding: fixture.deps.siteBinding,
    get skillLayout() { assert.equal(refuseEnumeration, false, "guards must precede enumeration"); return fixture.deps.skillLayout; },
    authorize: async () => { authorizations++; return { allowed, reason: "test" }; },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerSkillsListRoute(app, deps);
  const base = await startTestServer(app, t);
  const url = `${base}/api/admin/v1/workspaces/workspace-local/skills`;
  const etag = (await fetch(url)).headers.get("etag");
  assert.ok(etag);
  allowed = false; refuseEnumeration = true;
  const headers = { "If-None-Match": etag };
  assert.equal((await fetch(url.replace("workspace-local", "other"), { headers })).status, 404);
  assert.equal(authorizations, 1);
  const denied = await fetch(url, { headers });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "FORBIDDEN");
  assert.equal(authorizations, 2);
});
