/** Host policy: Full CLI access defaults ON locally; only the owner's admin action may change this grant. */
export const ASSISTANT_SUBAGENTS_NAMESPACE = "core.assistant-full-cli";
export const ASSISTANT_SUBAGENTS_KEY = "enabled";
/** Per owner and site; the legacy workspace boolean remains the fallback for existing installs. */
export const ASSISTANT_CLI_PERMISSIONS_KEY = "permissions";
export const ASSISTANT_CLI_CAPABILITIES = [
  { key: "shell", label: "Bash/shell", description: "Run terminal commands such as git, npm or scripts." },
  { key: "fileWrite", label: "File edit/write", description: "Create and edit files with the CLI's file tools." },
  { key: "userMcp", label: "Your MCP servers", description: "Use the MCP servers set up in your own CLI. Off may not block servers added by your organization's policy." },
  { key: "subagents", label: "Subagents/Task", description: "Hand parts of a task to other agents." },
  { key: "userSettings", label: "Your skills and settings", description: "Load your own CLI skills, settings, hooks and plugins." },
  { key: "web", label: "Web fetch/search", description: "Use the CLI's web fetch and web search." },
  { key: "workflows", label: "Workflows", description: "Use scheduled tasks, worktrees and remote workflows." },
  { key: "loginEnvironment", label: "Your shell environment", description: "Start runs with your login shell's PATH and environment." },
] as const;
export type AssistantCliCapability = typeof ASSISTANT_CLI_CAPABILITIES[number]["key"];
export interface AssistantCliPermissions { enabled: boolean; capabilities: Record<AssistantCliCapability, boolean> }

/** The master supplies defaults except personal MCP, which requires an explicit owner grant
 * (2026-10-23). Inherited MCP configuration stays excluded by default, even with CLI parity;
 * Tovu's staged MCP catalog remains available.
 * @param required - The master default and any explicit per-capability owner choices.
 * @returns A fresh, fixed-size permissions snapshot; pure, with no I/O or errors.
 * @complexity O(1) time/space for the fixed capability list.
 * @example assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }); */
export function assistantCliPermissions(required: { enabled: boolean; capabilities?: Partial<Record<AssistantCliCapability, boolean>> }, _optional = {}): AssistantCliPermissions {
  return { enabled: required.enabled, capabilities: Object.fromEntries(ASSISTANT_CLI_CAPABILITIES.map(({ key }) =>
    [key, required.capabilities?.[key] ?? (key === "userMcp" ? false : required.enabled)])) as Record<AssistantCliCapability, boolean> };
}
export const ASSISTANT_SUBAGENTS_WRITE_REASON = "Only the owner can change Full CLI access through Admin AI Assistant settings.";
