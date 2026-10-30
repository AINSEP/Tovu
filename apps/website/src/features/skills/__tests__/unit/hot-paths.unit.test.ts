import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { installSkill, uninstallSkill, setSkillEnabled } from "../../install-service.js";
import { registerInstalledSkillTools } from "../../tool-registrations.js";
import { createSkillRefreshMiddleware } from "../../live-registration.js";
import { createByokToolSurface, type ByokToolSurfaceDeps } from "#src/assistant/byok-tool-surface";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
const ctx = testSiteLayoutContext({ workspaceId: "ws-hot-test" });
const MD = "---\nname: incident-response\ndescription: Use for outages and incident response.\n---\nAlways check ownership before rollback.\n";
const principal = { id: "owner" }, run = { id: "run-hot" };
async function fixture(fn: () => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "t14-hot-"));
  const prev = process.env.TOVU_SKILLS_DIR;
  process.env.TOVU_SKILLS_DIR = dir;
  try { await fn(); } finally { if (prev === undefined) delete process.env.TOVU_SKILLS_DIR; else process.env.TOVU_SKILLS_DIR = prev; await rm(dir, { recursive: true, force: true }); }
}
const upload = () => installSkill(testSiteLayoutContext({ ...ctx, files: [{ path: "SKILL.md", contentBase64: Buffer.from(MD).toString("base64") }] }));

test("daemon skill middleware refreshes discovery and refuses removed tools on the same real executor", () => fixture(async () => {
  const registry = createToolRegistry({});
  await registerInstalledSkillTools(registry, { ...ctx, withExtensionApprovalPolicy });
  const executor = createToolExecutor({ registry });
  let catalog = buildToolCatalogQuery(registry);
  const middleware = createSkillRefreshMiddleware({ registry, onChanged: () => { catalog = buildToolCatalogQuery(registry); } });
  async function request() { let called = false; await middleware(undefined, undefined, error => { if (error) throw error; called = true; }); assert.equal(called, true); }
  await upload();
  await request();
  assert.equal((await catalog.describe({ id: "skill_incident_response" }))?.id, "skill_incident_response");
  assert.equal((await executor.execute({ principal, run, toolId: "skill_incident_response", input: {} })).status, "completed");
  await uninstallSkill(testSiteLayoutContext({ ...ctx, toolId: "skill_incident_response" }));
  await request();
  assert.equal(await catalog.describe({ id: "skill_incident_response" }), null);
  await assert.rejects(() => executor.execute({ principal, run, toolId: "skill_incident_response", input: {} }), { message: 'ToolExecutor: unknown tool "skill_incident_response"' });
  await upload(); await request();
  const result = await executor.execute({ principal, run, toolId: "skill_incident_response", input: {} });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, { skillName: "incident-response", guidance: MD, files: [".tovu-install.json"], bundledFiles: [] });
}));

test("BYOK meta-tools discover and execute a post-boot installation, then drop a disabled skill", () => fixture(async () => {
  const deps = { ...ctx, getEffective: async () => null, clock: { nowMs: () => Date.parse("2026-10-01T00:00:00Z") }, idGen: { newId: () => "id-hot" }, authorize: async () => ({ allowed: true, reason: "owner" }) } as unknown as ByokToolSurfaceDeps;
  const surface = createByokToolSurface(deps, {
    registerInstalledExtensions: (registry, extensionDeps) => registerInstalledSkillTools(registry, { ...extensionDeps, withExtensionApprovalPolicy }),
  });
  await surface.ready;
  await upload();
  const describe = await surface.executeMetaTool(principal, run, { name: "describe_tool", input: { id: "skill_incident_response" } });
  assert.equal(describe.isError, undefined);
  assert.equal(JSON.parse(String(describe.content)).id, "skill_incident_response");
  const execute = await surface.executeMetaTool(principal, run, { name: "execute_delegated_tool", input: { toolId: "skill_incident_response", input: {} } });
  assert.deepEqual(JSON.parse(String(execute.content)), { skillName: "incident-response", guidance: MD, files: [".tovu-install.json"], bundledFiles: [] });
  await setSkillEnabled(testSiteLayoutContext({ ...ctx, toolId: "skill_incident_response", enabled: false }));
  const disabled = await surface.executeMetaTool(principal, run, { name: "describe_tool", input: { id: "skill_incident_response" } });
  assert.equal(disabled.isError, true);
  assert.equal(surface.registry.has({ toolId: "skill_incident_response" }), false);
  assert.equal((await surface.executeMetaTool(principal, run, { name: "execute_delegated_tool", input: { toolId: "skill_incident_response", input: {} } })).isError, true);
}));
