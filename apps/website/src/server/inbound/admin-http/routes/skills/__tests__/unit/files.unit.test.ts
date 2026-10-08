import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { PLUGIN_PACKAGE_FILE_LIMITS } from "@jini-ai/plugins/host/node";
import { createSkillsModule } from "#src/server/runtime/composition/modules/skills";
import type { RouteDeps } from "#src/server/routes/types";

const route = "/api/admin/v1/workspaces/:workspaceId/skills/:toolId/files";
const markdown = "---\nname: example\ndescription: Example skill.\n---\nRead the reference.\n";
async function harness(work: (call: (toolId?: string, workspaceId?: string, overrides?: { locals?: object }) => Promise<{ code: number; body: any }>, directory: string, outside: string) => Promise<void>, allowed = true, expectedAuthorizations = 1) {
  const root = await mkdtemp(path.join(tmpdir(), "skill-files-"));
  const previous = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = root;
  try {
    const directory = path.join(root, "ws/workspace-local/example");
    const outside = path.join(root, "outside");
    await mkdir(path.join(directory, "references"), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(directory, "SKILL.md"), markdown);
    await writeFile(path.join(directory, "references/check.md"), "Check ownership.");
    await writeFile(path.join(directory, ".tovu-install.json"), JSON.stringify({ enabled: false, source: "uploaded" }));
    await writeFile(path.join(outside, "secret.txt"), "PRIVATE CONTENT");
    const app = express();
    const handlers = new Map<string, Function>();
    for (const method of ["get", "post", "patch", "delete"] as const) app[method] = ((url: string, handler: Function) => { handlers.set(`${method} ${url}`, handler); return app; }) as typeof app[typeof method];
    let authorizations = 0;
    const skillsModule = createSkillsModule({ workspaceId: "workspace-local", authorize: async input => {
      authorizations++;
      assert.equal(input.principalId, "owner");
      assert.equal(input.permission, "admin.assistant.use");
      assert.equal(input.workspaceId, "workspace-local");
      return { allowed, reason: "test" };
    } } as RouteDeps);
    assert.ok(skillsModule.registerRoutes, "the skills module registers routes");
    skillsModule.registerRoutes(app);
    await work(async (toolId = "skill_example", workspaceId = "workspace-local", overrides = {}) => {
      const handler = handlers.get(`get ${route}`);
      assert.equal(typeof handler, "function", "files route is composed into the skills module");
      const res = { locals: { principal: { id: "owner" } }, ...overrides, code: 200, body: undefined as any, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
      const before = authorizations;
      await handler!({ params: { workspaceId, toolId } }, res);
      assert.equal(authorizations - before, workspaceId === "workspace-local" ? expectedAuthorizations : 0);
      return res;
    }, directory, outside);
  } finally {
    if (previous === undefined) delete process.env.TOVU_SKILLS_DIR; else process.env.TOVU_SKILLS_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("lists an installed disabled skill's files using the plugin response shape and caps", () => harness(async call => {
  const res = await call();
  assert.equal(res.code, 200);
  assert.equal(res.body.toolId, "skill_example");
  assert.equal(res.body.truncated, false);
  assert.deepEqual(res.body.limits, PLUGIN_PACKAGE_FILE_LIMITS);
  assert.deepEqual(res.body.files.find((file: any) => file.relativePath === "SKILL.md"), { relativePath: "SKILL.md", sizeBytes: Buffer.byteLength(markdown), content: markdown, omitted: null });
  assert.equal(res.body.files.find((file: any) => file.relativePath === "references/check.md").content, "Check ownership.");
}));
test("hides the internal install record while retaining skill files and other dotfiles", () => harness(async (call, directory) => {
  await writeFile(path.join(directory, ".skill-config.json"), '{"mode":"review"}');
  await writeFile(path.join(directory, "references/.tovu-install.json"), "INTERNAL INSTALL RECORD");
  const res = await call();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.files.map((file: any) => file.relativePath), [".skill-config.json", "SKILL.md", "references/check.md"]);
  assert.equal(res.body.files.find((file: any) => file.relativePath === ".skill-config.json").content, '{"mode":"review"}');
  assert.equal(res.body.truncated, false);
}));
test("unknown tool ids use the existing skills 404 response", () => harness(async call => {
  const res = await call("skill_unknown");
  assert.equal(res.code, 404);
  assert.deepEqual(res.body, { error: "Skill was not found or is disabled.", code: "NOT_FOUND" });
}));
test("path traversal cannot select files outside the installed skill", () => harness(async call => {
  for (const id of ["../../outside", "%2e%2e%2foutside", "skill_example/../../outside", "/etc/passwd", "..\\outside"]) {
    const res = await call(id);
    assert.equal(res.code, 404);
    assert.equal(res.body.code, "NOT_FOUND");
  }
}));
test("symlink files and directories are listed without reading their targets", () => harness(async (call, directory, outside) => {
  await symlink(path.join(outside, "secret.txt"), path.join(directory, "references/secret.txt"));
  await symlink(outside, path.join(directory, "references/outside"));
  const res = await call();
  assert.equal(res.code, 200);
  for (const relativePath of ["references/secret.txt", "references/outside"]) {
    assert.deepEqual(res.body.files.find((file: any) => file.relativePath === relativePath), { relativePath, sizeBytes: 0, content: null, omitted: "symlink" });
  }
  assert.equal(JSON.stringify(res.body).includes("PRIVATE CONTENT"), false);
}));
test("oversized files are omitted and file count is capped", () => harness(async (call, directory) => {
  await writeFile(path.join(directory, "oversized.txt"), Buffer.alloc(PLUGIN_PACKAGE_FILE_LIMITS.maxFileBytes + 1, 65));
  await Promise.all(Array.from({ length: 205 }, (_, i) => writeFile(path.join(directory, "references", `${i}.txt`), "ref")));
  const res = await call();
  // The shared reader's count cap includes the hidden install record.
  assert.equal(res.body.files.length, PLUGIN_PACKAGE_FILE_LIMITS.maxFiles - 1);
  assert.equal(res.body.truncated, true);
  assert.equal(res.body.files.find((file: any) => file.relativePath === "oversized.txt").omitted, "too-large");
}));
test("permission denial happens before inspecting even an unknown id", () => harness(async call => {
  const res = await call("skill_unknown");
  assert.equal(res.code, 403);
  assert.deepEqual(res.body, { error: "principal 'owner' is not authorized for 'admin.assistant.use' (test)", code: "FORBIDDEN", details: { permission: "admin.assistant.use", reason: "test" } });
}, false));
test("workspace mismatch returns the same workspace 404 without authorizing", () => harness(async call => {
  const res = await call("skill_example", "other-workspace");
  assert.equal(res.code, 404);
  assert.deepEqual(res.body, { error: "workspace was not found" });
}));
test("an unexpected failure returns the generic 500 without its internal message", () => harness(async call => {
  // Mounted without the admin session middleware: the principal lookup throws inside the guarded
  // block, and the response must carry only the fixed refusal.
  const res = await call("skill_example", "workspace-local", { locals: {} });
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { error: "internal error", code: "INTERNAL_ERROR" });
}, true, 0));
