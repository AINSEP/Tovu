import type { HumanConfirmSpec } from "../../contracts/core/human-confirm.js";


/**
 * @file The dialog `plugins_set_enabled` raises before it turns a plugin ON, for either plugin
 * family.
 *
 * ---------------------------------------------------------------------------
 * Why enabling is confirmed at all, when it is "just a flag"
 * ---------------------------------------------------------------------------
 * Enabling changes what the ASSISTANT can do next, which makes it a privilege escalation the model
 * would otherwise be granting itself:
 *
 * - An Agent Plugin's `SKILL.md` is injected into a run's prompt (`resolve-agent-plugin-refs.ts`),
 *   and its `agent_plugin_<id>` tool is registered for the model to call
 *   (`agent-plugins/tool-registrations.ts`). A disabled plugin gets neither; enabling grants both.
 * - A `.tovu-plugin` runtime plugin's enable hook can run ADR-023 schema DDL against the LIVE
 *   database (`server/runtime/composition/plugin-runtime.ts`'s `onPluginEnabled`), and its
 *   capability tools become registrable (`capability-tool-registrations.ts`).
 *
 * `plugin-runtime/agent-tools.ts`'s own catalog header left this question open in so many words —
 * "whether that is sufficient, or this needs the stronger actor-class/confirmation gating ... is
 * flagged as open in the audit and not decided here". This answers it: enabling, in either family,
 * asks a human first. DISABLING does not, and that asymmetry is deliberate rather than an
 * oversight — disabling only ever REMOVES capability, so there is no escalation to consent to, and
 * a confirmation dialog in front of the off switch is a dialog people learn to click through.
 *
 * ---------------------------------------------------------------------------
 * The mechanism is the held-open exchange, not a token
 * ---------------------------------------------------------------------------
 * Same shape as `features/post/delete-confirmation-ui.ts` (ADR-055 Decision 2), for the same
 * reasons — see that file's header for the full chain. The model's one call PARKS; the only way to
 * resolve it is a browser POST to `mcp-ui-tool-calls-route.ts`, a channel the model cannot reach.
 * The `exchangeId` interpolated below is a correlation handle, not a secret, and still belongs in
 * this surface and nowhere else: a copy in the tool's `modelText` or an error message would
 * misleadingly suggest a second, independent path back to the parked call, and there is none.
 *
 * `plugins_set_enabled` must therefore also be on `assistant/mcp-ui-tool-calls.ts`'s
 * `MCP_UI_REDEEMABLE_TOOL_IDS` — without it the human's click is refused at the endpoint and the
 * call parks until it expires. That is asserted, not assumed
 * (`tool-registrations.plugins-set-enabled-families.test.ts`).
 */

/** The tool id the dialog asks the Host to call back. Single source of truth for both halves. */
export const PLUGINS_SET_ENABLED_TOOL_ID = "plugins_set_enabled";

/** Which plugin system a `plugins_set_enabled` call is about. Explicit, never inferred — the two
 *  systems share the word "plugin" and nothing else, and guessing between them has already produced
 *  real work in the wrong directory. */
export type PluginFamily = "site-runtime" | "agent-plugin";

/** What the dialog needs to describe truthfully what is about to be switched on. */
export interface EnableConfirmationSubject {
  readonly family: PluginFamily;
  readonly pluginId: string;
  /** The human-readable name, when the family's read model has one distinct from the id. */
  readonly label?: string;
  readonly version?: string;
  /** Site plugins: capability entries beyond the owner's last approval (all of them the first time). */
  readonly adds?: readonly string[];
}

/** Per-family wording. Kept as data rather than branches inside the builder so the two families'
 *  copy can be read side by side and neither can silently inherit the other's claims. */
const FAMILY_COPY: Record<PluginFamily, { readonly noun: string; readonly warning: string }> = {
  "agent-plugin": {
    noun: "Agent Plugin",
    warning:
      "This lets the assistant use this plugin's guidance and tools. Each action still follows your access settings.",
  },
  "site-runtime": {
    noun: "site plugin",
    warning:
      "It gets full server access: it can run code on your site and change its database. Enable it only if you trust it.",
  },
};

/**
 * Describes the enable-confirmation dialog for the shared approval transport.
 *
 * @param spec.subject - What the human is being asked about. The plugin is NAMED, because a dialog
 * that says "enable this plugin?" without saying which one is not consent.
 * @complexity O(n) in the rendered field lengths.
 */
export function describeEnableApproval({ subject }: { subject: EnableConfirmationSubject }, _optional = {}): HumanConfirmSpec {
  const copy = FAMILY_COPY[subject.family];
  return {
    toolId: PLUGINS_SET_ENABLED_TOOL_ID, errorCode: "PLUGINS",
    title: `Enable ${subject.label ?? subject.pluginId}?`,
    description: `This turns on the ${copy.noun} "${subject.pluginId}" for this workspace.`,
    details: [{ label: "Plugin", value: subject.pluginId }, { label: "Kind", value: copy.noun },
      ...(subject.version === undefined ? [] : [{ label: "Version", value: subject.version }]),
      ...(subject.adds?.length ? [{ label: "Adds", value: subject.adds.join(", ") }] : [])],
    warning: copy.warning + " Your approval is remembered for this version. It also permits changes to the assistant's access and the service receiving your requests, within your access limits.", confirmLabel: "Enable",
    // Cancelling posts back and resolves the parked call immediately, rather than stranding it.
    cancelLabel: "Cancel",
  };
}
