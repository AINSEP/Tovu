import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSkillsModule } from "#src/server/runtime/composition/modules/skills";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";

// NOT RUN in the sandbox: this exercises the authenticated HTTP path using a loopback port.
test("the composed skills module installs, lists, loads, disables and removes an uploaded skill over authenticated HTTP", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "t14-skills-http-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = directory;
  try {
    const deps = createRouteDeps();
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    registerAuthRoutes(app, deps);
    app.use("/api/admin", requireAdminSession(deps));
    createSkillsModule(deps).registerRoutes!(app);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/skills`;
    const headers = { cookie, "Content-Type": "application/json" };
    const markdown = "---\nname: uploaded-check\ndescription: Check before changing state.\n---\nAlways check ownership.\n";
    const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ confirmed: true, files: [{ path: "SKILL.md", contentBase64: Buffer.from(markdown).toString("base64") }] }) });
    assert.equal(created.status, 201);
    const expected = { toolId: "skill_uploaded_check", name: "uploaded-check", description: "Check before changing state.", enabled: true, source: "uploaded" };
    assert.deepEqual(await created.json(), { skill: expected });
    assert.deepEqual(await (await fetch(base, { headers })).json(), { skills: [expected] });
    assert.deepEqual(await (await fetch(`${base}/skill_uploaded_check/guidance`, { headers })).json(), { skillName: "uploaded-check", guidance: markdown, bundledFiles: [] });
    assert.deepEqual(await (await fetch(`${base}/skill_uploaded_check`, { method: "PATCH", headers, body: JSON.stringify({ enabled: false }) })).json(), { updated: true });
    assert.deepEqual(await (await fetch(base, { headers })).json(), { skills: [{ ...expected, enabled: false }] });
    const disabled = await fetch(`${base}/skill_uploaded_check/guidance`, { headers });
    assert.equal(disabled.status, 404);
    assert.deepEqual(await disabled.json(), { error: "Skill was not found or is disabled.", code: "NOT_FOUND" });
    assert.deepEqual(await (await fetch(`${base}/skill_uploaded_check`, { method: "DELETE", headers })).json(), { removed: true });
    assert.deepEqual(await (await fetch(base, { headers })).json(), { skills: [] });
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR;
    else process.env.TOVU_SKILLS_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
