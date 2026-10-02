import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { resolveSkillLayout } from "./layout.js";
import { loadInstalledSkillToolSources } from "./tool-registrations.js";
import { SkillInputError, validateSkillFiles, type SkillUploadFile } from "./validation.js";
import { readSkillArchive } from "./archive.js";
import { fetchGitHubSkill, type GitHubSkillSource } from "./github.js";
import { readSkillState, SKILL_STATE_FILE } from "./state.js";
export { SkillInputError } from "./validation.js";

export interface ManagedSkill { readonly toolId: string; readonly name: string; readonly description: string; readonly enabled: boolean; readonly source: "uploaded" | GitHubSkillSource }
export type SkillInstallInput = { readonly workspaceId: string } & ({ readonly githubUrl: string } | { readonly files: readonly SkillUploadFile[] } | { readonly archiveBase64: string });

/** All entry points feed this service. Validate completely, then atomically publish a data-only tree.
 * @complexity O(total files + bytes), bounded by the package validator.
 */
export async function installSkill(input: SkillInstallInput, options: { fetchImpl?: typeof fetch } = {}): Promise<ManagedSkill> {
  let upload: readonly SkillUploadFile[];
  let source: ManagedSkill["source"] = "uploaded";
  if ("githubUrl" in input) ({ files: upload, source } = await fetchGitHubSkill(input.githubUrl, options.fetchImpl ?? fetch));
  else if ("archiveBase64" in input) upload = await readSkillArchive(input.archiveBase64);
  else upload = input.files;
  const validated = validateSkillFiles(upload);
  const toolId = `skill_${validated.name.replace(/-/g, "_")}`;
  const layout = resolveSkillLayout();
  const workspace = layout.forWorkspace(input.workspaceId).root;
  return withWorkspaceLock(input.workspaceId, async () => {
    const installed = await listManagedSkills({ workspaceId: input.workspaceId });
    if (installed.some(s => s.toolId === toolId)) throw new SkillInputError(`Skill '${validated.name}' is already installed. Remove it before installing another version.`);
    await mkdir(workspace, { recursive: true });
    const stagingRoot = path.join(layout.root, ".staging");
    await mkdir(stagingRoot, { recursive: true });
    const staging = await mkdtemp(path.join(stagingRoot, "skill-"));
    try {
      for (const [relative, bytes] of validated.files) {
        const target = path.join(staging, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
      }
      await writeFile(path.join(staging, SKILL_STATE_FILE), JSON.stringify({ enabled: true, source }), { flag: "wx", mode: 0o600 });
      await rename(staging, path.join(workspace, validated.name));
      console.info("[skills] installed", { workspaceId: input.workspaceId, toolId });
      return { toolId, name: validated.name, description: validated.description, enabled: true, source };
    } finally { await rm(staging, { recursive: true, force: true }); }
  });
}

export async function listManagedSkills(input: { workspaceId: string }): Promise<ManagedSkill[]> {
  const sources = await loadInstalledSkillToolSources({ ...input, includeDisabled: true });
  const root = resolveSkillLayout().forWorkspace(input.workspaceId).root;
  return Promise.all(sources.map(async skill => ({ toolId: skill.id, name: skill.skillName, description: skill.description, ...await readSkillState(path.join(root, skill.directory!)) })));
}

async function managedDirectory(input: { workspaceId: string; toolId: string }) {
  const skill = (await loadInstalledSkillToolSources({ workspaceId: input.workspaceId, includeDisabled: true })).find(s => s.id === input.toolId);
  if (!skill) throw new SkillInputError("Skill was not found.");
  const directory = path.join(resolveSkillLayout().forWorkspace(input.workspaceId).root, skill.directory!);
  if (!(await lstat(directory)).isDirectory()) throw new SkillInputError("Skill directory must be a regular directory.");
  return directory;
}

export async function setSkillEnabled(input: { workspaceId: string; toolId: string; enabled: boolean }): Promise<void> {
  if (typeof input.enabled !== "boolean") throw new SkillInputError("enabled must be a boolean.");
  await withWorkspaceLock(input.workspaceId, async () => {
    const directory = await managedDirectory(input);
    const state = await readSkillState(directory);
    const temporary = path.join(directory, `.tovu-install-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ ...state, enabled: input.enabled }), { flag: "wx", mode: 0o600 });
      await rename(temporary, path.join(directory, SKILL_STATE_FILE));
    } finally { await rm(temporary, { force: true }); }
    console.info("[skills] enabled changed", { workspaceId: input.workspaceId, toolId: input.toolId, enabled: input.enabled });
  });
}

export async function uninstallSkill(input: { workspaceId: string; toolId: string }): Promise<void> {
  await withWorkspaceLock(input.workspaceId, async () => {
    const directory = await managedDirectory(input);
    await rm(directory, { recursive: true });
    console.info("[skills] removed", { workspaceId: input.workspaceId, toolId: input.toolId });
  });
}

const mutationQueues = new Map<string, Promise<unknown>>();

/** Serializes mutations in this server without leaving persistent locks after a crash. */
async function withWorkspaceLock<T>(workspaceId: string, work: () => Promise<T>): Promise<T> {
  const key = resolveSkillLayout().forWorkspace(workspaceId).root;
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(work);
  mutationQueues.set(key, result);
  try { return await result; }
  finally { if (mutationQueues.get(key) === result) mutationQueues.delete(key); }
}
