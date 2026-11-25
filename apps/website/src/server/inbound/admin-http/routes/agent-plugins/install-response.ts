import { adminFailureResponse, type BoundFailurePorts } from "#src/server/inbound/shared/admin-failure";
import { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError, AgentPluginHostIncompatibleError, AgentPluginUpdateError } from "@jini-ai/agent-plugins/lifecycle";
import { AgentPluginInstallError } from "../../../../../features/agent-plugins/lifecycle.js";
import { AgentPluginUploadError } from "#src/features/agent-plugins/install-upload";
import {
  knownInstallRefusal as knownInstallRefusalFor, type InstallHostErrorClass, type InstallLifecycleErrorPredicates, type InstallRefusal,
} from "@jini-ai/cms/admin-http/routes/agent-plugins/install-response";

/**
 * @file Tovu's binding of the install upload's refusal ladder (`AGENT_PLUGIN_INSTALL_ZIP`; Jini
 * `@jini-ai/cms/admin-http/routes/agent-plugins/install-response`, mounted by
 * `composition/modules/agent-plugin-install-route.ts`): the real error classes the neutral ladder
 * asks about, and the redacted 500 for anything it does not recognise.
 */

/** Tovu's own upload/install error classes, classified for the neutral ladder. */
function classifyInstallHostError({ error }: { error: unknown }, _optional = {}): InstallHostErrorClass | undefined {
  if (error instanceof AgentPluginUploadError) return { kind: "upload", code: error.code, message: error.message };
  if (error instanceof AgentPluginInstallError) return { kind: "install", code: error.code, message: error.message };
  return undefined;
}

/** The lifecycle owner's `instanceof` checks, bound from the real classes. */
const INSTALL_LIFECYCLE_ERRORS: InstallLifecycleErrorPredicates = {
  update: (error: unknown): error is AgentPluginUpdateError => error instanceof AgentPluginUpdateError,
  hostIncompatible: (error: unknown): error is AgentPluginHostIncompatibleError => error instanceof AgentPluginHostIncompatibleError,
  activationsUnreadable: (error: unknown): error is AgentPluginActivationsUnreadableError => error instanceof AgentPluginActivationsUnreadableError,
  activationsBusy: (error: unknown): error is AgentPluginActivationsBusyError => error instanceof AgentPluginActivationsBusyError,
};

/**
 * The refusal for a recognised install error, or `undefined` for anything else (the caller's redacted
 * 500; the Jini install spec's mount answers that with this same operation).
 * @complexity O(1).
 */
export function knownInstallRefusal({ error }: { error: unknown }, _optional: Record<string, never> = {}): InstallRefusal | undefined {
  return knownInstallRefusalFor({ error, classifyHostError: classifyInstallHostError, lifecycleErrors: INSTALL_LIFECYCLE_ERRORS });
}

/**
 * Maps a thrown install error to its HTTP refusal. Anything unrecognised is a redacted 500.
 * @complexity O(1).
 */
export function installErrorResponse({ error }: { error: unknown }, options: BoundFailurePorts): InstallRefusal {
  return knownInstallRefusal({ error }) ?? adminFailureResponse({ error: error, tracker: options.tracker, reporter: options.reporter }, { operation: "routes/agent-plugins/install-response" });
}
