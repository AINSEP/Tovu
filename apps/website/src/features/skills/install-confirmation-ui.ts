import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { PreparedSkillInstall } from "./install-service.js";

/**
 * @file The dialog `skills_install` raises before it writes a skill. Same held-open exchange as
 * `plugin-runtime/install-confirmation-ui.ts`, so `skills_install` must be on
 * `assistant/mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS`. The warning is the admin Skills
 * screen's own (`SkillInstallConfirmation.tsx`); unlike that dialog this one can also name the skill,
 * because the package is fetched and validated before the human is asked.
 */

export const SKILLS_INSTALL_TOOL_ID = "skills_install";

/** @complexity O(n) in the rendered field lengths. */
export function buildSkillInstallConfirmationResource(spec: { prepared: PreparedSkillInstall; exchangeId: string; expiresAtMs: number }): UIResource {
  const { prepared, exchangeId, expiresAtMs } = spec;
  const source = prepared.source === "uploaded" ? [{ label: "Source", value: "uploaded files" }]
    : [{ label: "Source", value: prepared.source.githubUrl }, { label: "Commit", value: prepared.source.commit }];
  return buildConfirmationSurface({
    uri: `ui://tovu/skills-install/${encodeURIComponent(prepared.name)}` as UIResourceUri,
    title: `Install the ${prepared.name} skill?`,
    description: prepared.description,
    details: [{ label: "Skill", value: prepared.name }, ...source, { label: "Files", value: String(prepared.files.size) }],
    warning: "Review instructions from sources you trust. Installation runs no code.",
    confirm: { label: "Confirm install", toolName: SKILLS_INSTALL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: SKILLS_INSTALL_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-skills-install", appVersion: "1" },
    preferredFrameSize: ["100%", "340px"],
    expiresAtMs,
  });
}
