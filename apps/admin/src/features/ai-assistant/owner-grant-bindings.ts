import type { AdminPermanentDeletesCopy, AdminPermanentDeletesProps } from "@jini-ai/admin/screens/assistant-settings/AdminPermanentDeletes";
import type { AdminSubagentsProps } from "@jini-ai/admin/screens/assistant-settings/AdminSubagents";
import type { AdminSubagentsCopy } from "@jini-ai/admin/screens/assistant-settings/admin-subagents.types";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { useWiredAdminSubagents } from "./hooks/use-admin-subagents.hooks";
import { useWiredAdminPermanentDeletes } from "./hooks/permanent-deletes-dependencies.hooks";

/** Product copy for the Admin tab's two owner grants; the engine screens translate it through `t`. */
export const ADMIN_SUBAGENTS_COPY: AdminSubagentsCopy = {
  info: "On by default for the local owner. Allows shell commands, file edits, subagents and workflows. Personal MCP servers are on by default; turn them off here for any agent. Forced off in production and hosted environments; visitors and other admins never receive it. Lowering access stops affected answers immediately.",
  toolSourcesHint: "Tovu and Jini tools, enabled plugin tools, and connected servers.",
  agentMcpInfo: ({ name }) => `Loads MCP servers set up in ${name} or this project. Tovu doesn't approve or log them. Applies to ${name}'s other chats on this site.`,
};

export const ADMIN_PERMANENT_DELETES_COPY: AdminPermanentDeletesCopy = {
  info: "Off by default. Only checked tools are allowed. Each delete still requires a human confirmation of the exact targets. Prefer Trash.",
  noAdminScreen: "No Tovu admin screen for this operation.",
};

/** Every `AdminSubagents` / `AdminPermanentDeletes` prop except `t`, bound to this admin's controllers, copy and ⓘ widget. */
export const adminSubagentsBindings: Omit<AdminSubagentsProps, "t"> = { InfoTip, useAdminSubagentsHook: useWiredAdminSubagents, copy: ADMIN_SUBAGENTS_COPY };
export const adminPermanentDeletesBindings: Omit<AdminPermanentDeletesProps, "t"> = {
  InfoTip, useAdminPermanentDeletesHook: useWiredAdminPermanentDeletes, copy: ADMIN_PERMANENT_DELETES_COPY,
};
