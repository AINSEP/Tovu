import { withExtensionApprovalPolicy } from "#src/assistant/assistant-tool-approval-policy";
import { createTempSiteLayoutFixture, testSiteLayoutContext, type TestSiteLayoutFixture } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
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
async function harness(fn: (call: (method: string, suffix: string, body?: unknown, workspace?: string | null) => Promise<ReturnType<typeof response>>, siteLayouts: TestSiteLayoutFixture) => Promise<void>, allowed = true) {
  const siteLayouts = createTempSiteLayoutFixture({});
  try {
    const app = express();
    const handlers = new Map<string, Function>();
    for (const method of ["get", "post", "patch", "delete"] as const) app[method] = ((route: string, handler: Function) => { handlers.set(`${method} ${route}`, handler); return app; }) as typeof app[typeof method];
    registerSkillsManagementRoutes(app, testSiteLayoutContext({ withExtensionApprovalPolicy, ...siteLayouts.deps, workspaceId: "workspace-local", authorize: async params => { assert.equal(params.principalId, "owner"); assert.equal(params.permission, "admin.assistant.use"); return { allowed, reason: "test" }; } }));
    await fn(async (method, suffix, body, workspace: string | null = "workspace-local") => {
      const handler = handlers.get(`${method} ${base}${suffix}`);
      assert.equal(typeof handler, "function");
      const res = response();
      // `null` omits the param entirely: Express never does, so only a direct call reaches the `?? ""` guard.
      await handler!({ params: workspace === null ? { toolId: "skill_check_ownership" } : { workspaceId: workspace, toolId: "skill_check_ownership" }, body }, res);
      return res;
    }, siteLayouts);
  } finally { siteLayouts.cleanup(); }
}
const payload = { confirmed: true, files: [{ path: "SKILL.md", contentBase64: Buffer.from(MD).toString("base64") }] };
test("install, read selected guidance, disable, and delete mutate the installed state", () => harness(async (call, siteLayouts) => {
  assert.deepEqual((await call("post", "", payload)).body, { skill: { toolId: "skill_check_ownership", name: "check-ownership", description: "Check who owns a record.", enabled: true, source: "uploaded" } });
  assert.deepEqual((await call("get", "/:toolId/guidance")).body, { skillName: "check-ownership", guidance: MD, files: [".tovu-install.json"], bundledFiles: [] });
  assert.equal((await call("patch", "/:toolId", { enabled: false })).code, 200);
  assert.equal((await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })))[0]!.enabled, false);
  assert.deepEqual((await call("get", "/:toolId/guidance")).body, { error: "Skill was not found or is disabled.", code: "NOT_FOUND" });
  assert.deepEqual((await call("delete", "/:toolId")).body, { removed: true });
  assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
}));
test("unconfirmed and mixed-source installs refuse before persistence", () => harness(async (call, siteLayouts) => {
  assert.deepEqual((await call("post", "", { ...payload, confirmed: false })).body, { error: "Confirm the skill installation first.", code: "VALIDATION_ERROR" });
  assert.deepEqual((await call("post", "", { ...payload, githubUrl: "https://github.com/acme/skill" })).body, { error: "Choose exactly one source: GitHub URL, files, or ZIP.", code: "VALIDATION_ERROR" });
  assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
}));
test("workspace mismatch refuses before authorization or installation", () => harness(async (call, siteLayouts) => {
  assert.deepEqual((await call("post", "", payload, "other-workspace")).body, { error: "workspace was not found" });
  assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
}));
test("permission denial prevents installation", () => harness(async (call, siteLayouts) => {
  const res = await call("post", "", payload);
  assert.equal(res.code, 403);
  assert.deepEqual(res.body, { error: "principal 'owner' is not authorized for 'admin.assistant.use' (test)", code: "FORBIDDEN", details: { permission: "admin.assistant.use", reason: "test" } });
  assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
}, false));

const sourceError = "Choose exactly one source: GitHub URL, files, or ZIP.";
const confirmationError = "Confirm the skill installation first.";
const fieldsError = "Skill source has invalid fields.";
const installationRefusals: { name: string; body: unknown; error: string }[] = [
  ...[undefined, null, false, 0, "files", []].map(body => ({ name: `non-object body ${JSON.stringify(body)}`, body, error: sourceError })),
  ...[undefined, false, "true", 1].map(confirmed => ({ name: `confirmation ${JSON.stringify(confirmed)}`, body: { ...payload, confirmed }, error: confirmationError })),
  { name: "confirmation precedes source validation", body: {}, error: confirmationError },
  { name: "no source", body: { confirmed: true }, error: sourceError },
  { name: "undefined source", body: { confirmed: true, files: undefined }, error: sourceError },
  { name: "unknown top-level field", body: { ...payload, extra: true }, error: sourceError },
  { name: "GitHub and archive sources", body: { confirmed: true, githubUrl: "invalid", archiveBase64: "!" }, error: sourceError },
  { name: "files and archive sources", body: { ...payload, archiveBase64: "!" }, error: sourceError },
  { name: "non-string GitHub source", body: { confirmed: true, githubUrl: null }, error: fieldsError },
  { name: "non-string archive source", body: { confirmed: true, archiveBase64: 1 }, error: fieldsError },
  { name: "non-array files", body: { confirmed: true, files: {} }, error: fieldsError },
  ...[null, false, 0, "file", {}, { path: 1, contentBase64: "" }, { path: "SKILL.md", contentBase64: 1 }, { ...payload.files[0], extra: true }].map(file => ({
    name: `invalid uploaded entry ${JSON.stringify(file)}`, body: { confirmed: true, files: [file] }, error: fieldsError,
  })),
  { name: "invalid entry after valid entry", body: { confirmed: true, files: [...payload.files, null] }, error: fieldsError },
  { name: "empty file array reaches installer validation", body: { confirmed: true, files: [] }, error: "A skill must contain 1–256 files." },
  { name: "GitHub string reaches installer validation", body: { confirmed: true, githubUrl: "invalid" }, error: "Use an HTTPS GitHub repository URL, optionally ending in /tree/ref/skill-folder." },
  { name: "archive string reaches installer validation", body: { confirmed: true, archiveBase64: "!" }, error: "Skill upload must use valid base64." },
];
for (const scenario of installationRefusals) {
  test(`installation input refuses ${scenario.name} without persistence`, () => harness(async (call, siteLayouts) => {
    const res = await call("post", "", scenario.body);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, { error: scenario.error, code: "VALIDATION_ERROR" });
    assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
  }));
}
test("an undefined alternative source does not prevent a confirmed file installation", () => harness(async (call) => {
  const res = await call("post", "", { ...payload, githubUrl: undefined, archiveBase64: undefined });
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { skill: { toolId: "skill_check_ownership", name: "check-ownership", description: "Check who owns a record.", enabled: true, source: "uploaded" } });
}));
test("a request with no :workspaceId param at all is a 404 before authorization or installation (direct handler call)", () => harness(async (call, siteLayouts) => {
  assert.deepEqual((await call("post", "", payload, null)).body, { error: "workspace was not found" });
  assert.deepEqual(await listManagedSkills(testSiteLayoutContext({ ...siteLayouts.deps, workspaceId: "workspace-local" })), []);
}));
test("an enable/disable request with no body at all is a validation error, not a crash", () => harness(async (call) => {
  const res = await call("patch", "/:toolId", undefined);
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: "enabled must be a boolean.", code: "VALIDATION_ERROR" });
}));
