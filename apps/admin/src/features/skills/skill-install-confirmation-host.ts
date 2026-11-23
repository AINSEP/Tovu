import "./skills.css";
import { useSkillInstallConfirmation } from "@jini-ai/admin/screens/skills/use-skill-confirmation.hooks";
import { SKILL_FAILURE_HOST } from "./skill-failure-host";

/**
 * @file What `@jini-ai/admin`'s `SkillInstallConfirmation` needs from this app wherever it renders
 * (the Skills page and the chat dock): its dialog-behavior hook and the Skills failure bindings.
 * Importing it also loads this feature's stylesheet, which the dock has no other route to.
 */
export const SKILL_INSTALL_CONFIRMATION_HOST = { hooks: { useSkillInstallConfirmation }, failureHost: SKILL_FAILURE_HOST } as const;
