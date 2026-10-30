import { containAgentPluginStatePath } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { installAgentPlugin, removeFrozenPackageTree } from "#src/features/agent-plugins/lifecycle";
import { loadAgentPluginSearchCandidates, createAgentPluginToolGate } from "#src/features/agent-plugins/tool-registrations";
import { listInstalledAgentPluginServers } from "#src/features/agent-plugins/import-access-token";
import { defaultResolveInstalledAgentPlugin } from "#src/features/agent-plugins/connect-tool";
import { resolveAgentPluginMcpServers } from "#src/features/agent-plugins/federate-mcp";
import { setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";
import { pluginMemory } from "#src/features/agent-plugins/memory";
import { installSkill, listManagedSkills, setSkillEnabled, uninstallSkill } from "#src/features/skills/install-service";
import { loadInstalledSkillToolSources } from "#src/features/skills/tool-registrations";
import { resolveFsRoots } from "#src/features/fs-files/layout";
import { setCustomFsRoot } from "#src/features/fs-files/custom-root-store";
import { registerAgentPluginMemoryRoutes } from "#src/server/inbound/admin-http/routes/agent-plugins/memory";
import { registerAgentPluginFilesRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/files";
import { registerSkillFilesRoute } from "#src/server/inbound/admin-http/routes/skills/files";
import type { RouteDeps } from "#src/server/routes/types";

const workspaceId = "workspace-local";
const markdown = "---\nname: bound-skill\ndescription: Bound site guidance.\n---\nUse the bound site.\n";

/** Simulates an explicit serve-dir boot followed by env drift, using the real filesystem owners. */
async function withSites(work: (input: { siteA: string; siteB: string; agentPluginLayout: ReturnType<typeof resolveAgentPluginLayout>; skillLayout: ReturnType<typeof resolveSkillLayout>; siteBinding: { dir: string } }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "tovu-booted-layouts-"));
  const siteA = path.join(directory, "a");
  const siteB = path.join(directory, "b");
  await mkdir(siteA); await mkdir(siteB);
  const keys = ["TOVU_SITE_DIR", "TOVU_AGENT_PLUGINS_DIR", "TOVU_SKILLS_DIR"] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    // Binding A wins over a conflicting ambient site B; explicit root overrides still win at boot.
    process.env.TOVU_SITE_DIR = siteB;
    const agentPluginLayout = resolveAgentPluginLayout({ siteDir: siteA }, { env: { TOVU_SITE_DIR: siteB } });
    const skillLayout = resolveSkillLayout({ siteDir: siteA, env: { TOVU_SITE_DIR: siteB } });
    assert.equal(agentPluginLayout.root, path.join(siteA, "agent-plugins"));
    assert.equal(skillLayout.root, path.join(siteA, "skills"));
    process.env.TOVU_AGENT_PLUGINS_DIR = path.join(siteB, "agent-plugins");
    process.env.TOVU_SKILLS_DIR = path.join(siteB, "skills");
    await work({ siteA, siteB, agentPluginLayout, skillLayout, siteBinding: { dir: siteA } });
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    // The lifecycle owner restores write permissions before removing immutable package trees.
    await removeFrozenPackageTree({ root: directory });
  }
}

async function seedPlugin(layout: ReturnType<typeof resolveAgentPluginLayout>) {
  const archive = Buffer.from("boot-bound-plugin");
  const entries = [
    ["plugin.json", '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"bound-plugin","version":"1.0.0"}'],
    ["skills/bound-plugin/SKILL.md", "# Bound plugin guidance"],
    ["mcp.json", '{"$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json","mcpServers":{"bound":{"type":"streamable-http","url":"https://example.com/mcp"}}}'],
  ];
  return installAgentPlugin({ layout, workspaceId, archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: {
    async *entries() { for (const [entryPath, value] of entries) { const bytes = Buffer.from(value!); yield { kind: "file" as const, entryPath: entryPath!, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } }; } },
  } });
}

test("plugin discovery, MCP, activation and memory stay on A after env selects B", () => withSites(async binding => {
  const plugin = await seedPlugin(binding.agentPluginLayout);
  const input = { ...binding, workspaceId, pluginId: "bound-plugin" };
  assert.deepEqual((await loadAgentPluginSearchCandidates(input)).map(p => p.pluginId), ["bound-plugin"]);
  assert.deepEqual((await listInstalledAgentPluginServers(input)).map(p => p.pluginId), ["bound-plugin"]);
  assert.ok((await defaultResolveInstalledAgentPlugin(input))?.servers.bound);
  assert.ok((await resolveAgentPluginMcpServers(input)).bound);
  const gate = createAgentPluginToolGate(input);
  assert.equal(await gate.isCallable({ pluginId: "bound-plugin", archiveDigest: plugin.archiveDigest }), true);
  const memory = pluginMemory({ ...input, contain: containAgentPluginStatePath }, { layout: binding.agentPluginLayout });
  await memory.writeNote({ entryPath: "project.txt", text: "Site A only" });
  assert.equal((await memory.list({ kind: "notes" }))[0]?.text, "Site A only");
  await setAgentPluginEnabled({ ...input, enabled: false, actor: "owner" });
  assert.equal(await gate.isCallable({ pluginId: "bound-plugin", archiveDigest: plugin.archiveDigest }), false);
  await assert.rejects(readFile(path.join(binding.siteB, "agent-plugins/ws/workspace-local/activations.json")), { code: "ENOENT" });
}));

test("skill install, list, bundled paths, toggle and removal use the booted A layout", () => withSites(async binding => {
  const input = { ...binding, workspaceId };
  await installSkill({ ...input, files: [
    { path: "SKILL.md", contentBase64: Buffer.from(markdown).toString("base64") },
    { path: "references/check.md", contentBase64: Buffer.from("Check site A.").toString("base64") },
  ] });
  assert.deepEqual((await listManagedSkills(input)).map(s => s.toolId), ["skill_bound_skill"]);
  const [source] = await loadInstalledSkillToolSources(input);
  assert.deepEqual(source?.bundledFiles, [{ kind: "references", path: "skills/ws/workspace-local/bound-skill/references/check.md" }]);
  await setSkillEnabled({ ...input, toolId: "skill_bound_skill", enabled: false });
  assert.deepEqual(await loadInstalledSkillToolSources(input), []);
  assert.equal((await listManagedSkills(input))[0]?.enabled, false);
  await uninstallSkill({ ...input, toolId: "skill_bound_skill" });
  assert.deepEqual(await listManagedSkills(input), []);
  await assert.rejects(readFile(path.join(binding.siteB, "skills/ws/workspace-local/bound-skill/SKILL.md")), { code: "ENOENT" });
}));

test("filesystem custom root stays scoped to A and reflects live folder changes", () => withSites(async binding => {
  const input = { siteDir: binding.siteA, workspaceId };
  const folder = path.join(binding.siteA, "selected"); await mkdir(folder);
  setCustomFsRoot(workspaceId, folder, { siteDir: binding.siteA });
  assert.equal(resolveFsRoots(input).site, binding.siteA);
  assert.equal(resolveFsRoots(input).custom, await realpath(folder));
  setCustomFsRoot(workspaceId, null, { siteDir: binding.siteA });
  assert.equal(resolveFsRoots(input).custom, undefined);
  await assert.rejects(readFile(path.join(binding.siteB, ".fs-custom-root.json")), { code: "ENOENT" });
}));

test("admin memory and file handlers consume A's binding when env points at B", () => withSites(async binding => {
  await seedPlugin(binding.agentPluginLayout);
  const input = { ...binding, workspaceId };
  await pluginMemory({ contain: containAgentPluginStatePath, ...input, pluginId: "bound-plugin" }, { layout: binding.agentPluginLayout }).writeNote({ entryPath: "project.txt", text: "HTTP site A" });
  await installSkill({ ...input, files: [{ path: "SKILL.md", contentBase64: Buffer.from(markdown).toString("base64") }] });
  const handlers = new Map<string, Function>();
  const app = express();
  const getSetting = app.get.bind(app);
  app.get = ((url: string, ...routeHandlers: Function[]) => {
    // app.put initializes Express's router, which reads settings through app.get(setting).
    if (routeHandlers.length === 0) return getSetting(url);
    handlers.set(url, routeHandlers.at(-1)!);
    return app;
  }) as typeof app.get;
  const deps = { ...input, authorize: async () => ({ allowed: true, reason: "owner" }) } as unknown as RouteDeps;
  registerAgentPluginMemoryRoutes(app, deps); registerAgentPluginFilesRoute(app, deps); registerSkillFilesRoute(app, deps);
  for (const [url, handler] of handlers) {
    const res = { locals: { principal: { id: "owner" } }, code: 200, body: undefined as any, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await handler({ params: { workspaceId, pluginId: "bound-plugin", toolId: "skill_bound_skill" }, query: {} }, res);
    assert.equal(res.code, 200, url);
    assert.ok(JSON.stringify(res.body).includes(url.includes("memory") ? "HTTP site A" : url.includes("/skills/") ? "Use the bound site." : "Bound plugin guidance"), url);
  }
}));

for (const { resolve, key, folder } of [
  { resolve: resolveAgentPluginLayout, key: "TOVU_AGENT_PLUGINS_DIR", folder: "agent-plugins" },
  { resolve: resolveSkillLayout, key: "TOVU_SKILLS_DIR", folder: "skills" },
]) {
  test(`${folder}: explicit boot binding wins over ambient site while overrides stay validated`, () => {
    assert.equal(resolve({ siteDir: "/served/site-a", env: { TOVU_SITE_DIR: "/ambient/site-b" } }).root, path.join("/served/site-a", folder));
    assert.equal(resolve({ siteDir: "/served/site-a", env: { TOVU_SITE_DIR: "/ambient/site-b", [key]: "/explicit/layout" } }).root, "/explicit/layout");
    assert.throws(() => resolve({ siteDir: "/served/site-a", env: { [key]: "relative/layout" } }), { message: `${key} must be an absolute path, got 'relative/layout'` });
  });
}
