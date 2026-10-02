import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { GitHubSkillSource } from "./github.js";
export interface SkillState { readonly enabled: boolean; readonly source: "uploaded" | GitHubSkillSource }
export const SKILL_STATE_FILE = ".tovu-install.json";

/** Legacy folders default to enabled. Invalid installation records fail closed. */
export async function readSkillState(directory: string): Promise<SkillState> {
  const statePath = path.join(directory, SKILL_STATE_FILE);
  try {
    const info = await lstat(statePath);
    if (!info.isFile() || info.size > 8192) throw new Error("Invalid skill installation record.");
    const state: SkillState = JSON.parse(await readFile(statePath, "utf8"));
    if (typeof state.enabled !== "boolean" || (state.source !== "uploaded" && (!state.source || typeof state.source.githubUrl !== "string" || !/^[a-f0-9]{40}$/.test(state.source.commit)))) throw new Error("Invalid skill installation record.");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { enabled: true, source: "uploaded" };
    throw error;
  }
}
