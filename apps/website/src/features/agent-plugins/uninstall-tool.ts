import { requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  resolveConfirmationDecision,
  type AssistantSurfaceDeps,
  type ConfirmationOutcome,
} from "../../contracts/core/tool-surface-exchanges.js";

import {
  AgentPluginActivationsBusyError,
  AgentPluginActivationsUnreadableError,
} from "./activation.js";
import { resolveAgentPluginLayout } from "./layout.js";
import {
  AgentPluginChangedSincePreviewError,
  AgentPluginNotFoundError,
  AgentPluginNotUninstallableError,
  previewAgentPluginUninstall,
  uninstallAgentPlugin,
  type AgentPluginUninstallPreview,
  type UninstallAgentPluginRequired,
} from "./uninstall.js";
import { buildUninstallConfirmationResource, PLUGINS_UNINSTALL_TOOL_ID } from "./uninstall-confirmation-ui.js";

/**
 * @file The Agent Plugin family's half of `plugins_uninstall` (S4, 2026-09-24).
 *
 * Before this file existed, this was its own standalone tool, `agent_plugins_uninstall`
 * (`features/agent-plugins/tool-registrations.ts`). `features/plugin-runtime/tool-registrations.ts`
 * already has `plugins_uninstall` for the OTHER plugin system (`.tovu-plugin` site/runtime plugins),
 * and a model choosing between two near-identically-named uninstall tools is the exact confusion
 * `plugins_set_enabled`'s own family merge (2026-09-09) already fixed for enable/disable — uninstall
 * had the identical problem and got the identical fix: ONE tool, a required `family` argument, this
 * module supplying the Agent Plugin branch.
 *
 * `runAgentPluginUninstall` below is everything `plugins_uninstall`'s handler
 * (`plugin-runtime/tool-registrations.ts`) needs to run the Agent Plugin branch: permission check,
 * preview-or-refusal, the confirmation dialog, and the confirmed write. Behavior is UNCHANGED from the
 * deleted standalone tool — same permanent removal, same dialog, same refusals — only the id it is
 * reached through changed. See that file's own header for the full design this mirrors (no
 * cross-workspace "enabled somewhere else" precondition; bundled is refused for permanence, not mere
 * absence).
 *
 * Deliberately does NOT import `agent-plugins/tool-registrations.ts` — that file's own header states
 * "no plugin-runtime -> agent-plugins/tool-registrations edge", and this module is `plugin-runtime`'s
 * new entry point into this family, so it must not create the edge from the other side either.
 *
 * Risk classification: `deletes-durable-state`, same as the deleted standalone tool. See
 * `plugin-runtime/tool-registrations.ts`'s `pluginsDerivedRisk` for where that is now declared for the
 * merged `plugins_uninstall` id — one id, one risk band, covering the worse of the two families' blast
 * radii (site plugins go to the Trash; Agent Plugins do not).
 */

/** The narrow slice of the route-deps bag this branch's handler reads. Structurally satisfied by
 *  `PluginsToolDeps` (`plugin-runtime/tool-registrations.ts`), which carries both fields among many
 *  others — this interface stays narrow so this module does not have to import that wider type. */
export interface AgentPluginUninstallToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
}

/**
 * Re-classifies `uninstallAgentPlugin`'s own domain errors into `ToolInputError` on their way to the
 * model, and passes every other rejection through untouched.
 *
 * Same reasoning as `features/post/tool-registrations.ts`'s `toModelFacingUpdateError`: an unknown
 * `pluginId` and a bundled-plugin refusal are both exactly "the CALLER's input was the problem, and a
 * different input (a real installed id; a different tool call to disable instead) resolves it" — the
 * honest classification, not a trick to defeat `@jini-ai/daemon`'s redaction. Neither message carries
 * anything beyond the plugin id the caller already sent and, for the bundled case, the name of the
 * tool to call instead — nothing internal leaks.
 */
function toModelFacingUninstallError(error: unknown): unknown {
  if (error instanceof AgentPluginNotFoundError || error instanceof AgentPluginNotUninstallableError) {
    return new ToolInputError(error.message);
  }
  return error;
}

/**
 * The model-facing outcome of an `uninstall.ts` rejection: a RESULT when this workspace's activation record could
 * not be read, or could not be locked, otherwise `toModelFacingUninstallError`'s classification, thrown.
 *
 * An unreadable or busy activations.json is not the caller's input and not an internal bug the model should see
 * redacted (t91 §7.1/R2): nothing was removed, and there is a concrete next step, so this is the ADR-055 Decision 6
 * not-removed result `plugins_set_enabled`'s `activationsUnreadableResult`/`activationsBusyResult` already return
 * for the sibling family. The error's message names the host path (and, for Busy, the lock file), so it goes to the
 * server log only; `note` is fixed, path-free text.
 *
 * @throws The re-classified error for every other rejection.
 * @complexity O(1).
 */
function uninstallRefusedResult(pluginId: string, error: unknown): unknown {
  if (error instanceof AgentPluginActivationsBusyError) {
    console.warn(`[agent-plugins] '${pluginId}': plugins_uninstall (family agent-plugin) refused — ${error.message}`);
    return {
      uninstalled: false,
      cancelled: false,
      pluginId,
      restartRequired: false,
      reason: "activations-busy",
      note:
        `Nothing was removed: another Tovu process was writing this workspace's Agent Plugin activation record at the ` +
        `same moment, so '${pluginId}' was NOT uninstalled. Tell the user nothing was changed and to try again in a ` +
        "moment; if it keeps happening, the server log names the lock file.",
    };
  }
  if (!(error instanceof AgentPluginActivationsUnreadableError)) throw toModelFacingUninstallError(error);
  console.warn(`[agent-plugins] '${pluginId}': plugins_uninstall (family agent-plugin) refused — ${error.message}`);
  return {
    uninstalled: false,
    cancelled: false,
    pluginId,
    restartRequired: false,
    reason: "activations-unreadable",
    note:
      `Nothing was removed: this workspace's Agent Plugin activation record could not be read, so whether '${pluginId}' is ` +
      "bundled with Tovu cannot be established and it was NOT uninstalled. Tell the user an operator has to repair " +
      "activations.json first (the server log names the file and the fault); until then every Agent Plugin tool call in " +
      "this workspace is refused.",
  };
}

/** The preview a dialog may show, or the not-removed result to return instead of raising one.
 *  @complexity O(1) beyond `previewAgentPluginUninstall`. */
async function previewOrRefusal(
  request: UninstallAgentPluginRequired,
): Promise<{ readonly preview: AgentPluginUninstallPreview } | { readonly refusal: unknown }> {
  try {
    return { preview: await previewAgentPluginUninstall(request) };
  } catch (error) {
    return { refusal: uninstallRefusedResult(request.pluginId, error) };
  }
}

/**
 * Raises the uninstall-confirmation dialog and parks on the human's answer.
 *
 * Fails CLOSED when the execution context cannot hold a call open, exactly like
 * `content_post_delete`/`plugins_set_enabled`: degrading to "remove it and mention we could not ask"
 * would make the confirmation decorative in precisely the contexts that most need it.
 *
 * The exchange's `toolId` is `PLUGINS_UNINSTALL_TOOL_ID` — the ONE id both plugin families redeem
 * through (S4) — not a family-specific id, so the dialog's confirm/cancel click resolves through
 * `plugins_uninstall` regardless of which family raised it.
 *
 * @throws {Error} When there is no `emitSurface` to raise a dialog through.
 * @complexity O(1) plus the human's own latency, bounded by the exchange store's TTLs.
 */
async function confirmUninstall(
  surfaces: AssistantSurfaceDeps,
  ctx: Pick<ToolExecutionContext, "principal" | "signal"> & Partial<Pick<ToolExecutionContext, "emitSurface">>,
  preview: AgentPluginUninstallPreview,
): Promise<ConfirmationOutcome> {
  const emitSurface = ctx.emitSurface;
  if (!emitSurface) {
    throw new Error(
      "plugins_uninstall: this execution context has no interactive confirmation channel (no emitSurface), so a " +
        "permanent uninstall cannot be gated here. Nothing was removed.",
    );
  }

  const exchange = surfaces.surfaceExchanges.open({ toolId: PLUGINS_UNINSTALL_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui = buildUninstallConfirmationResource({ preview, exchangeId: exchange.id });

  // A cancelled run must not leave a dialog holding a call nobody is listening to.
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** ADR-055 Decision 6: a no-answer is a RESULT, not an exception — nothing was removed either way,
 *  and the model is still alive to say so. @complexity O(1). */
function notConfirmedUninstallResult(outcome: Exclude<ConfirmationOutcome, { confirmed: true }>, pluginId: string): unknown {
  const base = { uninstalled: false, pluginId, restartRequired: false };
  if (outcome.reason === "declined") {
    return { ...base, cancelled: true, note: `The user declined. '${pluginId}' was NOT uninstalled and nothing changed.` };
  }
  return {
    ...base,
    cancelled: false,
    reason: outcome.reason,
    note:
      outcome.reason === "expired"
        ? `The user did not answer the confirmation before it expired. '${pluginId}' was NOT uninstalled.`
        : `The confirmation was closed because the run ended. '${pluginId}' was NOT uninstalled.`,
  };
}

/**
 * The post-confirmation half: uninstalls exactly what the human was shown. If the installed archives changed while
 * the dialog was open, that is a not-removed RESULT — the same union member `expired`/`abandoned` use — not a
 * `ToolInputError`: the caller's input was fine, what is installed moved. Every other refusal goes through
 * `uninstallRefusedResult`, like the preview's.
 * @complexity O(1) beyond `uninstallAgentPlugin`.
 */
async function uninstallConfirmedAgentPlugin(request: UninstallAgentPluginRequired, preview: AgentPluginUninstallPreview): Promise<unknown> {
  try {
    const result = await uninstallAgentPlugin(request, { confirmedPreview: preview });
    return {
      uninstalled: true,
      cancelled: false,
      pluginId: result.pluginId,
      removedDigests: result.removedDigests,
      restartRequired: true,
      note:
        "Uninstalled. Its files and activation record are gone, new runs no longer load it, and its own agent_plugin_<id> " +
        "tool stops running immediately — every call is refused from now on, with no restart needed. That tool does stay " +
        "LISTED in this already-running daemon until Tovu restarts, so tell the user it may still appear in tool listings " +
        "until then, and that calling it will simply be denied. Uninstalling does NOT remove any external MCP server " +
        "connection the plugin set up: if an operator turned one on, its mcp__<server>__* tools keep working until that " +
        "connection is disabled or deleted under Integrations → External MCP.",
    };
  } catch (error) {
    if (error instanceof AgentPluginChangedSincePreviewError) {
      return {
        uninstalled: false,
        cancelled: false,
        pluginId: request.pluginId,
        restartRequired: false,
        reason: "changed-since-confirmation",
        note:
          `'${request.pluginId}' changed after the user was asked: the installed archives are no longer the ones the confirmation showed. ` +
          "Nothing was removed. Call plugins_uninstall again so the user can review and confirm what is installed now.",
      };
    }
    return uninstallRefusedResult(request.pluginId, error);
  }
}

/**
 * Runs the Agent Plugin branch of `plugins_uninstall` end to end: permission, preview-or-refusal,
 * confirm, write. `plugin-runtime/tool-registrations.ts`'s handler calls this directly when
 * `family === "agent-plugin"` — see this file's header for why the permission check lives here rather
 * than being hoisted above the family branch (unlike `plugins_set_enabled`'s single pre-branch check):
 * this mirrors the deleted standalone tool's own order exactly, permission then preview then confirm
 * then write, with nothing shared between the two families' checks to hoist.
 *
 * Order is load-bearing, same as the site-runtime branch: parse -> authorize -> preview (so an unknown
 * or bundled id, or an unreadable/busy activations.json, is refused or returned as a not-removed
 * result before any human is asked anything) -> confirm -> re-check and write only if the plugin is
 * still what the dialog showed (t91 F2.2).
 *
 * @complexity O(1) beyond `previewAgentPluginUninstall`/`uninstallAgentPlugin`.
 */
export async function runAgentPluginUninstall(
  routeDeps: AgentPluginUninstallToolDeps,
  surfaces: AssistantSurfaceDeps,
  ctx: ToolExecutionContext,
  pluginId: string,
): Promise<unknown> {
  await requireToolPermission(routeDeps, {
    principalId: ctx.principal.id,
    permission: "admin.plugins.enable",
    entityType: "agent-plugin",
    entityId: pluginId,
  });

  const request = { layout: resolveAgentPluginLayout(), workspaceId: routeDeps.workspaceId, pluginId };
  const previewed = await previewOrRefusal(request);
  if ("refusal" in previewed) return previewed.refusal;

  const outcome = await confirmUninstall(surfaces, ctx, previewed.preview);
  if (!outcome.confirmed) return notConfirmedUninstallResult(outcome, pluginId);

  return uninstallConfirmedAgentPlugin(request, previewed.preview);
}
