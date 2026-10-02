import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { registerSkillsManagementRoutes } from "../../manage.js";
import { listManagedSkills } from "#src/features/skills/install-service";

const base = "/api/admin/v1/workspaces/:workspaceId/skills";
const MD = "---\nname: check-ownership\ndescription: Check who owns a record.\n---\nAsk before deleting.\n";
function response() {
  const res = { locals: { principal: { id: "owner" } }, code: 200, body: undefined as unknown, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  return res;
}
async function harness(fn: (call: (method: string, suffix: string, body?: unknown, workspace?: string) => Promise<ReturnType<typeof response>>) => Promise<void>, allowed = true) {
  const root = await mkdtemp(path.join(tmpdir(), "t14-routes-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = root;
  try {
    const app = express();
    const handlers = new Map<string, Function>();
    for (const method of ["get", "post", "patch", "delete"] as const) app[method] = ((route: string, handler: Function) => { handlers.set(`${method} ${route}`, handler); return app; }) as typeof app[typeof method];
    registerSkillsManagementRoutes(app, { workspaceId: "workspace-local", authorize: async params => { assert.equal(params.principalId, "owner"); assert.equal(params.permission, "admin.assistant.use"); return { allowed, reason: "test" }; } });
    await fn(async (method, suffix, body, workspace = "workspace-local") => {
      const handler = handlers.get(`${method} ${base}${suffix}`);
      assert.equal(typeof handler, "function");
      const res = response();
      await handler!({ params: { workspaceId: workspace, toolId: "skill_check_ownership" }, body }, res);
      return res;
    });
  } finally { if (previous === undefined) delete process.env.TOVU_SKILLS_DIR; else process.env.TOVU_SKILLS_DIR = previous; await rm(root, { recursive: true, force: true }); }
}
const payload = { confirmed: true, files: [{ path: "SKILL.md", contentBase64: Buffer.from(MD).toString("base64") }] };
test("install, read selected guidance, disable, and delete mutate the installed state", () => harness(async call => {
  assert.deepEqual((await call("post", "", payload)).body, { skill: { toolId: "skill_check_ownership", name: "check-ownership", description: "Check who owns a record.", enabled: true, source: "uploaded" } });
  assert.deepEqual((await call("get", "/:toolId/guidance")).body, { skillName: "check-ownership", guidance: MD, bundledFiles: [] });
  assert.equal((await call("patch", "/:toolId", { enabled: false })).code, 200);
  assert.equal((await listManagedSkills({ workspaceId: "workspace-local" }))[0]!.enabled, false);
  assert.deepEqual((await call("get", "/:toolId/guidance")).body, { error: "Skill was not found or is disabled.", code: "NOT_FOUND" });
  assert.deepEqual((await call("delete", "/:toolId")).body, { removed: true });
  assert.deepEqual(await listManagedSkills({ workspaceId: "workspace-local" }), []);
}));
test("unconfirmed and mixed-source installs refuse before persistence", () => harness(async call => {
  assert.deepEqual((await call("post", "", { ...payload, confirmed: false })).body, { error: "Confirm the skill installation first.", code: "VALIDATION_ERROR" });
  assert.deepEqual((await call("post", "", { ...payload, githubUrl: "https://github.com/acme/skill" })).body, { error: "Choose exactly one source: GitHub URL, files, or ZIP.", code: "VALIDATION_ERROR" });
  assert.deepEqual(await listManagedSkills({ workspaceId: "workspace-local" }), []);
}));
test("workspace mismatch refuses before authorization or installation", () => harness(async call => {
  assert.deepEqual((await call("post", "", payload, "other-workspace")).body, { error: "workspace was not found" });
  assert.deepEqual(await listManagedSkills({ workspaceId: "workspace-local" }), []);
}));
test("permission denial prevents installation", () => harness(async call => {
  const res = await call("post", "", payload);
  assert.equal(res.code, 403);
  assert.deepEqual(res.body, { error: "principal 'owner' is not authorized for 'admin.assistant.use' (test)", code: "FORBIDDEN", details: { permission: "admin.assistant.use", reason: "test" } });
  assert.deepEqual(await listManagedSkills({ workspaceId: "workspace-local" }), []);
}, false));
