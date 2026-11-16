import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { WORKSPACE_ID } from "../../lib/admin-http/config";
import type { AdminPluginFiles } from "../plugins/api/plugins-api.types";
export const SKILLS_CHANGED_EVENT = "tovu-skills-changed";
const base = `/workspaces/${WORKSPACE_ID}/skills`;
export interface InstalledSkill { toolId: string; name: string; description: string; enabled: boolean; source: "uploaded" | { githubUrl: string; commit: string } }
export type SkillFiles = Pick<AdminPluginFiles, "files" | "truncated" | "limits"> & { readonly toolId: string };
export type SkillInstallPayload = { githubUrl: string } | { archiveBase64: string } | { files: { path: string; contentBase64: string }[] };
async function request<T>(_required = {}, { suffix = "", method, body }: { suffix?: string; method?: string; body?: unknown } = {}): Promise<T> {
  return authenticatedAdminRequest<T>({ path: `${base}${suffix}`, method: method ?? "GET", body });
}
function changed() { window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)); }
export async function listSkills() { return (await request<{ skills: InstalledSkill[] }>()).skills; }
export function listSkillFiles({ toolId }: { toolId: string }, _optional = {}): Promise<SkillFiles> { return request({}, { suffix: `/${encodeURIComponent(toolId)}/files` }); }
export async function installSkill(payload: SkillInstallPayload) { await request({}, { method: "POST", body: { ...payload, confirmed: true } }); changed(); }
export async function removeSkill({ toolId }: { toolId: string }, _optional = {}) { await request({}, { suffix: `/${encodeURIComponent(toolId)}`, method: "DELETE" }); changed(); }
export async function enableSkill({ toolId, enabled }: { toolId: string; enabled: boolean }, _optional = {}) { await request({}, { suffix: `/${encodeURIComponent(toolId)}`, method: "PATCH", body: { enabled } }); changed(); }

/** Selection fetches current enabled guidance; sending this draft puts the instructions in the run. */
export async function loadSkillDraft({ toolId }: { toolId: string }, _optional = {}): Promise<string> {
  const skill = await request<{ skillName: string; guidance: string; bundledFiles: { kind: string; root: string; path: string }[] }>({}, { suffix: `/${encodeURIComponent(toolId)}/guidance` });
  if (typeof skill.skillName !== "string" || typeof skill.guidance !== "string" || !Array.isArray(skill.bundledFiles)) throw new Error("Could not load this skill. Try again.");
  return `Use and follow the "${skill.skillName}" skill for this task.\n\n${skill.guidance}\n\nRead bundled files with fs_read_file as needed:\n${JSON.stringify(skill.bundledFiles)}\n\nTask: `;
}
