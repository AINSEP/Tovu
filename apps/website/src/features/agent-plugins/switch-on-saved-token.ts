import type { ClockPort } from "@jini-ai/cms/core";

import type { ExternalMcpServerRepoPort } from "#src/assistant/index";

import { enableBundledAgentPluginUnlessOperatorDisabled, readAgentPluginActivations } from "./activation.js";
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

/** Recorded as `updatedBy` when this switches the plugin on — the same actor a first sign-in's
 *  connect defaults record (`apply-connect-defaults.ts`). */
const SWITCH_ON_ACTOR = "system:connect-defaults";

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
  /** Injected for tests. Switches the plugin's activation on unless an operator turned it off; false
   *  when an operator's "off" stopped it. Defaults to {@link defaultSwitchPluginOn}. */
  readonly switchPluginOn?: (pluginId: string) => Promise<boolean>;
}

/** Whether `pluginId`'s activation record is a disabled one someone other than the seeder wrote. */
async function defaultIsPluginOffByOperator(workspaceId: string, pluginId: string): Promise<boolean> {
  const activations = await readAgentPluginActivations(resolveAgentPluginLayout().forWorkspace(workspaceId).root);
  if (!Object.hasOwn(activations.plugins, pluginId)) return false;
  const record = activations.plugins[pluginId];
  return record.enabled === false && record.updatedBy !== SEED_ACTOR;
}

/**
 * Makes sure `pluginId`'s activation is on: no record already reads as on; the seeder's own disabled
 * record is switched on (decided under the activations lock, so an operator toggle racing it wins);
 * anyone else's disabled record is an operator's "off" and stays. Needed on top of connect defaults,
 * which skip a row an operator already set up and so never reach the plugin's activation.
 */
async function defaultSwitchPluginOn(workspaceId: string, pluginId: string): Promise<boolean> {
  const workspaceRoot = resolveAgentPluginLayout().forWorkspace(workspaceId).root;
  const activations = await readAgentPluginActivations(workspaceRoot);
  if (!Object.hasOwn(activations.plugins, pluginId)) return true;
  const record = activations.plugins[pluginId];
  if (record.enabled) return true;
  if (record.updatedBy !== SEED_ACTOR) return false;
  return (await enableBundledAgentPluginUnlessOperatorDisabled({ workspaceRoot, pluginId, actor: SWITCH_ON_ACTOR })) !== "left-disabled-by-operator";
}

/**
 * Switches the plugin and its `connectionId` row on after a token was saved there, unless an
 * operator turned either off. "on" means both the row and the plugin's own activation are on.
 *
 * @throws Whatever the activation read or write, the connect-defaults write, or the row read throws.
 * @complexity Two activation reads, at most one connect-defaults apply and one activation write, one row read.
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
  if (row?.enabled !== true) return { state: "connection-off-by-operator" };

  const switchPluginOn = deps.switchPluginOn ?? ((pluginId: string) => defaultSwitchPluginOn(deps.workspaceId, pluginId));
  return (await switchPluginOn(target.pluginId)) ? { state: "on" } : { state: "plugin-off-by-operator" };
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
