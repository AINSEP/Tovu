import type { ClockPort } from "@jini-ai/cms/core";

import type { ExternalMcpServerRepoPort } from "#src/assistant/index";

import { readAgentPluginActivations } from "./activation.js";
import { createApplyConnectDefaults } from "./apply-connect-defaults.js";
import { resolveAgentPluginLayout } from "./layout.js";

/**
 * @file After an access token is saved onto a plugin's token-auth row, switches the plugin on the
 * same way a first sign-in does (`apply-connect-defaults.ts`), so saving a token is the only step —
 * unless an operator deliberately turned it off, in which case it stays off and the caller names the
 * screen that turns it back on.
 *
 * Two callers: `agent_plugin_set_access_token` (`access-token-tool.ts`) and the token import
 * (`import-access-token.ts`, boot env import and create-site onboarding). Added 2026-09-29: the
 * tool used to end with "ask the operator to enable it in Settings", a manual step nothing required.
 *
 * "Deliberately off" is either:
 * - a disabled Agent Plugins activation record that anyone other than the boot seeder wrote (the
 *   seeder's own disabled record is the default, not a decision — `activation.ts`'s same exception);
 * - a row the operator already edited (tool lists filled) and left disabled — `apply-connect-defaults`
 *   never touches an edited row.
 */

/** `activation.ts`'s seeder actor: its disabled record is the default, not an operator decision. */
const SEED_ACTOR = "system:seed";

/** Where each "off" is switched back on in the admin (`apps/admin/src/panels.tsx` nav labels). */
export const AGENT_PLUGINS_SCREEN = "Add-Ons → Agent Plugins";
export const EXTERNAL_MCP_SCREEN = "Add-Ons → Integrations → External MCP";

export type SavedTokenSwitchOutcome =
  | { readonly state: "on" }
  | { readonly state: "plugin-off-by-operator" }
  | { readonly state: "connection-off-by-operator" };

export interface SwitchOnSavedTokenDeps {
  readonly workspaceId: string;
  readonly externalMcpServerRepo: ExternalMcpServerRepoPort;
  readonly clock: ClockPort;
  /** Injected for tests. Defaults to `createApplyConnectDefaults`, the sign-in's own `onConnected`. */
  readonly onConnected?: (serverId: string) => Promise<void>;
  /** Injected for tests. Defaults to reading this workspace's activations file. */
  readonly isPluginOffByOperator?: (pluginId: string) => Promise<boolean>;
}

/** Whether `pluginId`'s activation record is a disabled one someone other than the seeder wrote. */
async function defaultIsPluginOffByOperator(workspaceId: string, pluginId: string): Promise<boolean> {
  const activations = await readAgentPluginActivations(resolveAgentPluginLayout().forWorkspace(workspaceId).root);
  if (!Object.hasOwn(activations.plugins, pluginId)) return false;
  const record = activations.plugins[pluginId];
  return record.enabled === false && record.updatedBy !== SEED_ACTOR;
}

/**
 * Switches the plugin and its `connectionId` row on after a token was saved there, unless an
 * operator turned either off.
 *
 * @throws Whatever the activation read, the connect-defaults write, or the row read throws.
 * @complexity One activation read, at most one connect-defaults apply, one row read.
 */
export async function switchOnSavedTokenConnection(
  deps: SwitchOnSavedTokenDeps,
  target: { readonly pluginId: string; readonly connectionId: string },
): Promise<SavedTokenSwitchOutcome> {
  const isOff = deps.isPluginOffByOperator ?? ((pluginId: string) => defaultIsPluginOffByOperator(deps.workspaceId, pluginId));
  if (await isOff(target.pluginId)) return { state: "plugin-off-by-operator" };

  const onConnected = deps.onConnected ?? createApplyConnectDefaults({ workspaceId: deps.workspaceId, repo: deps.externalMcpServerRepo, clock: deps.clock });
  await onConnected(target.connectionId);

  const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: target.connectionId });
  return row?.enabled === true ? { state: "on" } : { state: "connection-off-by-operator" };
}

/** The plain next-step line for each outcome. Never carries a token. */
export function describeSavedTokenSwitch(outcome: SavedTokenSwitchOutcome, names: { readonly displayName: string; readonly connectionId: string }): string {
  switch (outcome.state) {
    case "on":
      return `${names.displayName} is connected and switched on. Its tools are ready to use.`;
    case "plugin-off-by-operator":
      return `Token saved. ${names.displayName} stays off because an operator turned it off. To use it, switch '${names.displayName}' on in ${AGENT_PLUGINS_SCREEN}.`;
    case "connection-off-by-operator":
      return `Token saved. The '${names.connectionId}' connection stays off because an operator changed its settings. To use it, switch it on in ${EXTERNAL_MCP_SCREEN}.`;
  }
}
