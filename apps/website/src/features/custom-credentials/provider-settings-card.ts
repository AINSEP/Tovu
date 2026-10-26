import { requireInputRecord, requireString, ToolInputError, type ToolExecutionContext, type ToolExecutionOptions, type ToolHandler } from "@jini-ai/core";
import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { PluginProviderSettingField } from "@jini-ai/plugins/host";
import { defineSecretCardTool, type SecretCardField, type SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";
import type { SurfaceOutcomeSpec } from "@jini-ai/ui/mcp-ui/surfaces";

import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/secret-form-cards.js";
import type { PluginCredentialCard } from "./plugin-credential-card.js";

/**
 * @file The assistant's key card for a PROVIDER plugin's settings (2026-10-25): an agent plugin
 * declares a credential card with `saveKind: "provider-settings"` and `saveTarget: <provider plugin
 * id>`, and `credential_save` (kind plugin-provider) opens it. The form's fields are the provider
 * plugin's own manifest-declared settings (public values, declared defaults and choices, masked
 * secrets); the agent plugin only supplies the copy (title, intro, help link). A submission saves
 * through the host's shared provider-settings save rule (the admin Settings card's rule and store),
 * so a key typed here lands in the same row, never in a credential row, the transcript or model input.
 * Core names no vendor: every word on the card comes from the two manifests.
 */

/** Host ports, bound by the composition root to the shared save rule and `ProviderConfigSource`. */
export interface ProviderSettingsCardPorts {
  /** The provider plugin's declared settings; undefined when it is not installed or declares none. */
  readonly fields: (required: { pluginId: string }) => Promise<readonly PluginProviderSettingField[] | undefined>;
  /** Saved public values and the NAMES of saved secrets; null when nothing is saved or it is unreadable. */
  readonly readSettings: (required: { pluginId: string }) => Promise<{ settings: Readonly<Record<string, string>>; secretNames: readonly string[] } | null>;
  /** The shared save rule: writes, or returns the refusal text without writing. */
  readonly save: (required: { pluginId: string; values: Readonly<Record<string, string>> }) => Promise<{ store: "project" | "site" } | { refusal: string }>;
  /** The admin Settings card's save permission (`admin.plugins.enable`). */
  readonly authorize: (ctx: ToolExecutionContext) => Promise<void>;
}

type SavedView = Awaited<ReturnType<ProviderSettingsCardPorts["readSettings"]>>;
type Prep = { pluginId: string; card?: PluginCredentialCard; fields: readonly PluginProviderSettingField[]; saved: SavedView };
type Saved = { store: "project" | "site" };
export type ProviderSettingsSaveResult =
  | { saved: true; pluginId: string; store: "project" | "site"; appliesAt: "next-start" }
  | { saved: false; reason: string; message?: string };

/** The select option that reveals a field's free-text twin (`allowCustom`). */
const CUSTOM = "__custom";
const customName = (name: string) => `${name}__custom`;

/** A declared public field with choices: a select (plus "Custom…" and its text field when allowed). */
function choiceFields({ field, value }: { field: PluginProviderSettingField; value?: string }): SecretCardField[] {
  const options = field.options ?? [];
  const custom = Boolean(value) && !options.some((option) => option.value === value);
  const select: SecretCardField = { kind: "enum", name: field.name, label: field.label, required: field.required === true,
    options: [...options, ...(field.allowCustom ? [{ value: CUSTOM, label: "Custom…" }] : [])], value: custom && field.allowCustom ? CUSTOM : value ?? field.default };
  if (!field.allowCustom) return [select];
  return [select, { kind: "string", name: customName(field.name), label: `Custom ${field.label.toLowerCase()}`, ...(field.hint ? { hint: field.hint } : {}), ...(custom ? { value } : {}) }];
}

/** One declared field → its form controls. A saved secret may be left blank to keep it. */
function formFieldsOf({ field, saved }: { field: PluginProviderSettingField; saved: SavedView }): SecretCardField[] {
  if (field.secret) {
    const kept = saved?.secretNames.includes(field.name) === true;
    const hint = [field.hint, kept ? "Leave blank to keep the saved one." : undefined].filter(Boolean).join(" ");
    return [{ kind: "string", name: field.name, label: field.label, secret: true, required: field.required === true && !kept,
      allowBlank: field.required !== true || kept, ...(hint ? { hint } : {}) }];
  }
  const value = saved?.settings[field.name] || undefined;
  if (field.options?.length) return choiceFields({ field, value });
  const initial = value ?? field.default;
  return [{ kind: "string", name: field.name, label: field.label, required: field.required === true, ...(field.hint ? { hint: field.hint } : {}), ...(initial ? { value: initial } : {}) }];
}

/** The card: plugin copy over the provider's declared fields. @complexity O(f) declared fields. */
export function buildProviderSettingsForm({ prep }: { prep: Prep }, _optional = {}): SecretCardForm {
  const { card } = prep;
  const help = card?.helpUrl ? [{ label: card.helpLabel ?? "Help", value: card.helpUrl }] : [];
  return {
    title: card?.title ?? "Connect provider",
    description: `${card?.intro ? `${card.intro} ` : ""}Keys are sealed on the server the moment you submit — the assistant never sees them. Takes effect the next time the site starts.`,
    details: [...help, ...(card?.keyHint ? [{ label: "Where to find it", value: card.keyHint }] : []), ...(card?.usedFor?.length ? [{ label: "Used for", value: card.usedFor.join("; ") }] : [])],
    submitLabel: "Save",
    fields: prep.fields.flatMap((field) => formFieldsOf({ field, saved: prep.saved })),
    app: { appName: "tovu-provider-settings-card", appVersion: "1" },
  };
}

/** Submitted controls → declared setting values (a "Custom…" choice takes its text field). @complexity O(f). */
export function readProviderSettingsValues({ fields, values }: { fields: readonly PluginProviderSettingField[]; values: Readonly<Record<string, unknown>> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const chosen = values[field.name] === CUSTOM ? values[customName(field.name)] : values[field.name];
    if (typeof chosen === "string") out[field.name] = chosen;
  }
  return out;
}

/** Model-facing projection: where it saved and when it applies, never a value. */
function resultOf({ run, pluginId }: { run: { status: string; saved?: Saved; safeMessage?: string }; pluginId: string }): ProviderSettingsSaveResult {
  if (run.status === "saved" && run.saved) return { saved: true, pluginId, store: run.saved.store, appliesAt: "next-start" };
  if (run.status === "failed") return { saved: false, reason: "error", message: run.safeMessage };
  if (run.status === "blank") return { saved: false, reason: "invalid", message: "A required key was left blank. Nothing was saved." };
  return { saved: false, reason: run.status };
}

function outcomeOf({ result, title }: { result: ProviderSettingsSaveResult; title: string }): SurfaceOutcomeSpec | undefined {
  if (!result.saved && result.message === undefined) return undefined;
  return { title, state: result.saved ? "success" : "failure", app: { appName: "tovu-provider-settings-outcome", appVersion: "1" },
    message: result.saved ? `Saved for ${result.store === "project" ? "every site in this project" : "this site"}. Takes effect the next time the site starts.` : result.message! };
}

/** Thrown with fixed refusal text from the shared rule (names fields, never values). */
class ProviderSettingsRefusedError extends Error {}

/**
 * The `provider-settings` save adapter for `credential_save`. Input: `{ pluginId }` (the card's
 * saveTarget), resolved by `routePluginCard`; never a value.
 * @complexity O(f) per card plus one settings read and one save.
 */
export function buildProviderSettingsCredentialHandler({ ports, surfaces, loadCards }: {
  ports: ProviderSettingsCardPorts; surfaces: AssistantSurfaceDeps; loadCards: () => Promise<readonly PluginCredentialCard[]>;
}, _optional = {}): ToolHandler {
  return async (ctx: ToolExecutionContext, options: ToolExecutionOptions = {}) => {
    const pluginId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "pluginId" });
    const card = defineSecretCardTool<Prep, Saved, ProviderSettingsSaveResult>({
      toolId: CREDENTIAL_SAVE_TOOL_ID,
      prepare: async () => {
        await ports.authorize(ctx);
        const fields = await ports.fields({ pluginId });
        if (!fields) throw new ToolInputError({ message: `The provider plugin '${pluginId}' is not installed or declares no settings. Install and enable it first (plugins_list, plugins_set_enabled).` });
        const declared = (await loadCards()).find((entry) => entry.saveKind === "provider-settings" && entry.saveTarget === pluginId);
        return { pluginId, fields, saved: await ports.readSettings({ pluginId }), ...(declared ? { card: declared } : {}) };
      },
      form: ({ prep }) => buildProviderSettingsForm({ prep }),
      save: async ({ values, prep }) => {
        const outcome = await ports.save({ pluginId, values: readProviderSettingsValues({ fields: prep.fields, values }) });
        if ("refusal" in outcome) throw new ProviderSettingsRefusedError(outcome.refusal);
        return outcome;
      },
      result: ({ run }) => resultOf({ run, pluginId }),
      outcome: ({ prep, run }) => outcomeOf({ result: resultOf({ run, pluginId }), title: prep.card?.title ?? "Provider settings" }),
    }, { uriHost: "tovu", frameSize: ["100%", "460px"],
      // The refusal names fields only (shared rule); every other failure keeps the engine's fixed text.
      safeError: (error) => error instanceof ProviderSettingsRefusedError ? error.message : "Saving failed. Nothing was saved." });
    return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, options);
  };
}
