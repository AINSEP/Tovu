import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { createSkillsApi } from "@jini-ai/agentic/react/skills/api";
import type { SkillInstallPayload } from "@jini-ai/core/contracts/site/skill-install";
import type { AdminPluginFilesEnvelope } from "@jini-ai/core/contracts/site/cms-plugins";
export const SKILLS_CHANGED_EVENT = "tovu-skills-changed";
export type SkillFiles = Pick<AdminPluginFilesEnvelope, "files" | "truncated" | "limits"> & { readonly toolId: string };
function changed() { window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT)); }

/** The bound skills client: Jini owns routes, the confirmed install and notify-after-acceptance;
 *  Tovu owns the browser change event and the draft's guidance wording. */
const skillsApi = createSkillsApi({
  request: authenticatedAdminRequest,
  workspaceId: WORKSPACE_ID,
  notifyChanged: changed,
  formatDraft: ({ skillName, guidance, bundledFiles }) => `Use and follow the "${skillName}" skill for this task.\n\n${guidance}\n\nRead bundled files with fs_read_file as needed:\n${JSON.stringify(bundledFiles)}\n\nTask: `,
  invalidGuidanceError: () => new Error("Could not load this skill. Try again."),
}, {});
export const listSkills = skillsApi.listSkills;
export const listSkillFiles: (required: { toolId: string }, optional?: Record<string, never>) => Promise<SkillFiles> = skillsApi.listSkillFiles;
export async function installSkill(payload: SkillInstallPayload) { await skillsApi.installSkill({ payload }); }
export const removeSkill = skillsApi.removeSkill;
export const enableSkill = skillsApi.enableSkill;
/** Selection fetches current enabled guidance; sending this draft puts the instructions in the run. */
export const loadSkillDraft = skillsApi.loadSkillDraft;
