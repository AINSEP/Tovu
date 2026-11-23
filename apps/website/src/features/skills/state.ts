import { readSkillState as read } from "@jini-ai/agentic/skills/install";
import { filesystem } from "./install-adapters.js";
/** Keep the persisted state filename stable across the extraction. */
export const SKILL_STATE_FILE = ".tovu-install.json";
/** Legacy folders default to enabled. Invalid installation records fail closed. */
export const readSkillState = ({ directory }: { directory: string }, _optional = {}) => read({ directory, stateFileName: SKILL_STATE_FILE, filesystem });
