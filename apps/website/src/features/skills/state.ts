import { readSkillState as read } from "@jini-ai/agentic/skills/install";
import { filesystem } from "./install-adapters.js";
export type { SkillState } from "@jini-ai/agentic/skills/install";
/** Keep the persisted state filename stable across the extraction. */
export const SKILL_STATE_FILE = ".tovu-install.json";
/** Legacy folders default to enabled. Invalid installation records fail closed. */
export const readSkillState = (directory: string) => read({ directory, stateFileName: SKILL_STATE_FILE, filesystem });
