import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSkillInstaller, prepareSkillInstall as prepare, createSkillFetchAdapter, type SkillInstaller, type SkillInstallInput as JiniSkillInstallInput, type PreparedSkillInstall, type SkillInstallDeps } from "@jini-ai/agentic/skills/install";
import type { SkillLayout } from "./layout.js";
import { loadInstalledSkillToolSources } from "./tool-registrations.js";
import { SKILL_STATE_FILE } from "./state.js";
import { filesystem, archiveReader, yamlReader } from "./install-adapters.js";
export { SkillInputError } from "@jini-ai/agentic/skills/install";
export type { ManagedSkill, PreparedSkillInstall } from "@jini-ai/agentic/skills/install";
export interface SkillSiteContext { readonly skillLayout: SkillLayout; readonly siteBinding: { readonly dir: string } }
export type SkillInstallInput = JiniSkillInstallInput & SkillSiteContext;
// One shared installer per resolved root keeps concurrent host entry points on the same queue.
const installers = new Map<string, SkillInstaller>();
/** Preparation has no filesystem root; Jini only needs the decoding, fetch and validation ports. */
function preparationDependencies(_input: Record<string, never>, optional: { fetchImpl?: typeof fetch } = {}) {
  return { archiveReader, yamlReader, fetch: createSkillFetchAdapter({ fetch: optional.fetchImpl ?? fetch }),
    toolId: ({ name }: { name: string }) => `skill_${name.replace(/-/g, "_")}` };
}
/** Bind the Jini installer to the same layout and site used by request-time skill discovery. */
function dependencies(input: SkillSiteContext, optional: { fetchImpl?: typeof fetch } = {}): SkillInstallDeps {
  const layout = input.skillLayout;
  const binding = input.siteBinding;
  return { filesystem, ...preparationDependencies({}, optional),
    ids: { next: () => randomUUID() },
    layout: { resolve: ({ workspaceId }) => ({ workspaceRoot: layout.forWorkspace(workspaceId).root, stagingRoot: path.join(layout.root, ".staging"), stateFileName: SKILL_STATE_FILE }) },
    toolSourceLoader: { load: async (input, optional) => (await loadInstalledSkillToolSources({ ...input, ...optional, skillLayout: layout, siteBinding: binding })).map(source => ({ ...source, directory: source.directory! })) },
  };
}
/** Reuses the existing per-root installer queue; resolving a root never reads process state. */
function installer(input: SkillSiteContext, _optional = {}): SkillInstaller {
  const root = input.skillLayout.root;
  let instance = installers.get(root);
  if (!instance) { instance = createSkillInstaller(dependencies(input)); installers.set(root, instance); }
  return instance;
}
/** Fetch/validate before approval; committing uses these exact bytes without a second fetch. */
export const prepareSkillInstall = (input: JiniSkillInstallInput, optional: { fetchImpl?: typeof fetch } = {}) => prepare({ input, deps: preparationDependencies({}, optional) });
export async function commitSkillInstall(input: SkillSiteContext & { workspaceId: string; prepared: PreparedSkillInstall }, _optional = {}) {
  const skill = await installer(input).commitSkillInstall(input);
  console.info("[skills] installed", { workspaceId: input.workspaceId, toolId: skill.toolId });
  return skill;
}
export const installSkill = async (input: SkillInstallInput, optional: { fetchImpl?: typeof fetch } = {}) => commitSkillInstall({ ...input, workspaceId: input.workspaceId, prepared: await prepareSkillInstall(input, optional) });
export const listManagedSkills = (input: SkillSiteContext & { workspaceId: string }, _optional = {}) => installer(input).listManagedSkills(input);
export async function setSkillEnabled(input: SkillSiteContext & { workspaceId: string; toolId: string; enabled: boolean }, _optional = {}): Promise<void> {
  await installer(input).setSkillEnabled(input);
  console.info("[skills] enabled changed", { workspaceId: input.workspaceId, toolId: input.toolId, enabled: input.enabled });
}
export async function uninstallSkill(input: SkillSiteContext & { workspaceId: string; toolId: string }, _optional = {}): Promise<void> {
  await installer(input).uninstallSkill(input);
  console.info("[skills] removed", { workspaceId: input.workspaceId, toolId: input.toolId });
}
