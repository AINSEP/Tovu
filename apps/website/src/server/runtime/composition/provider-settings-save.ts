import type { PluginProviderSettingField } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

import { ProviderConfigUnreadableError, ProviderStoreUnavailableError, type ProviderConfigSource } from "./provider-config-source.js";
import { providerInputOf } from "./provider-plugins.js";

/**
 * @file The one save rule for a provider plugin's settings (2026-10-25), shared by the admin settings
 * card (`routes/plugins/provider-settings.ts`) and the assistant's key card (a `provider-settings`
 * credential card an agent plugin declares, `features/custom-credentials/provider-settings-card.ts`).
 * Same declared fields, same validation, same secret re-entry rule, same `ProviderConfigSource`
 * (project store first), so a key saved from chat and one saved from Settings are the same row.
 */

type SavedConfig = { settings: Readonly<Record<string, string>>; secrets: Readonly<Record<string, string>> };
export type ProviderSettingsRefusal = { code: string; error: string };
type NextConfig = { config: SavedConfig } | { refusal: ProviderSettingsRefusal };

const INVALID = { refusal: { code: "PROVIDER_SETTINGS_INVALID", error: "values must map declared setting names to text" } };

/** The plugin's declared settings fields (all its providers, first declaration of a name wins).
 *  Undefined when the plugin is not discovered or declares none. @complexity O(p + f). */
export function declaredProviderSettingFields({ records, pluginId }: { records: readonly PluginDiscoveryRecord[]; pluginId: string }): PluginProviderSettingField[] | undefined {
  const record = records.find((candidate) => candidate.id === pluginId);
  const fields = new Map<string, PluginProviderSettingField>();
  for (const provider of record?.manifest?.contributes?.providers ?? []) for (const field of provider.settings ?? []) if (!fields.has(field.name)) fields.set(field.name, field);
  return fields.size === 0 ? undefined : [...fields.values()];
}

/** `values` as `[declared name, text]` pairs; undefined when malformed or naming an undeclared field. */
function requestValues({ values, fields }: { values: unknown; fields: ReadonlyMap<string, PluginProviderSettingField> }): [string, string][] | undefined {
  if (!values || typeof values !== "object" || Array.isArray(values)) return undefined;
  const entries = Object.entries(values as Record<string, unknown>);
  return entries.every(([name, value]) => fields.has(name) && typeof value === "string") ? (entries as [string, string][]) : undefined;
}

/** Labels of the fields `pick` selects, joined for a message. */
const labelsOf = (fields: readonly PluginProviderSettingField[], pick: (field: PluginProviderSettingField) => boolean) =>
  fields.filter(pick).map((field) => field.label).join(", ");

/**
 * Submitted values → the next saved config. A blank secret keeps the saved one, but only while every
 * public field is unchanged: an endpoint or host decides where the secret is sent, so changing one
 * with a kept secret would let an admin redirect a key they never saw to their own server. Then the
 * kept secrets must be entered again, and the save is refused with a message naming them.
 */
export function nextProviderConfig({ values, fields, current }: { values: unknown; fields: readonly PluginProviderSettingField[]; current: SavedConfig | null }): NextConfig {
  const entries = requestValues({ values, fields: new Map(fields.map((field) => [field.name, field])) });
  if (!entries) return INVALID;
  const secretNames = new Set(fields.filter((field) => field.secret).map((field) => field.name));
  const settings: Record<string, string> = { ...current?.settings };
  const entered: Record<string, string> = {};
  for (const [name, value] of entries) (secretNames.has(name) ? entered : settings)[name] = value.trim();
  const secrets: Record<string, string> = { ...current?.secrets };
  for (const [name, value] of Object.entries(entered)) if (value !== "") secrets[name] = value;
  // A blank public field means the plugin's declared default, so filling in that default is no change.
  const effective = (field: PluginProviderSettingField, value: string | undefined) => value || field.default || "";
  const changed = labelsOf(fields, (field) => !field.secret && effective(field, settings[field.name]) !== effective(field, current?.settings[field.name]));
  const kept = labelsOf(fields, (field) => !entered[field.name] && Boolean(current?.secrets[field.name]));
  if (changed && kept) return { refusal: { code: "PROVIDER_SETTINGS_SECRET_REENTRY", error: `Changing ${changed} needs ${kept} entered again.` } };
  return { config: { settings, secrets } };
}

/** The saved config a save builds on. One this machine cannot open counts as nothing saved, so the save
 *  overwrites it (the card has already asked for the settings again); any other failure surfaces. */
export async function currentProviderConfig({ config, pluginId }: { config: ProviderConfigSource; pluginId: string }): Promise<SavedConfig | null> {
  return config.read({ pluginId }).catch((error: unknown) => {
    if (error instanceof ProviderConfigUnreadableError) return null;
    throw error;
  });
}

/**
 * Validates and writes one save through `config`. Returns the refusal instead of writing when the
 * values are malformed or a kept secret would follow a changed public field, and as a refusal when the
 * project store could not open this run (`ProviderStoreUnavailableError`), so both cards show why.
 * @complexity O(f) plus one read and one write of the config row.
 */
export async function saveProviderSettings({ config, pluginId, fields, values }: {
  config: ProviderConfigSource; pluginId: string; fields: readonly PluginProviderSettingField[]; values: unknown;
}): Promise<{ saved: true } | { refusal: ProviderSettingsRefusal }> {
  const next = nextProviderConfig({ values, fields, current: await currentProviderConfig({ config, pluginId }) });
  if ("refusal" in next) return next;
  try {
    await config.write({ pluginId, config: next.config });
  } catch (error) {
    if (error instanceof ProviderStoreUnavailableError) return { refusal: { code: error.code, error: error.message } };
    throw error;
  }
  return { saved: true };
}

/** What the assistant may know about a provider plugin's settings: presence only, never a value. */
export interface ProviderSettingsStatus {
  readonly configured: boolean;
  readonly store: ProviderConfigSource["scope"];
  readonly appliesAt: "next-start";
  /** Labels of required fields still without a value (a declared default counts as a value). */
  readonly missing: readonly string[];
  readonly unreadable?: true;
}

/**
 * Configured means boot would start the provider: every required declared field has a value
 * (`providerInputOf`, the boot rule). Reads names and presence only; no secret value is returned.
 * @complexity O(f) plus one config read.
 */
export async function providerSettingsStatus({ config, pluginId, fields }: { config: ProviderConfigSource; pluginId: string; fields: readonly PluginProviderSettingField[] }): Promise<ProviderSettingsStatus> {
  const view = await config.readSettings({ pluginId });
  const saved = view && !view.unreadable ? { settings: view.settings, secrets: Object.fromEntries(view.secretNames.map((name) => [name, "saved"])) } : null;
  // Nothing saved still counts declared defaults, so `missing` names only what the person must enter.
  const input = providerInputOf({ declaration: { contract: "", id: pluginId, contractVersion: 1, settings: fields.map((field) => ({ ...field, required: false })) }, saved: saved ?? { settings: {}, secrets: {} } }) ?? {};
  const missing = fields.filter((field) => field.required && !input[field.name]).map((field) => field.label);
  return { configured: missing.length === 0 && saved !== null, store: config.scope, appliesAt: "next-start", missing, ...(view?.unreadable ? { unreadable: true as const } : {}) };
}

/**
 * The assistant key card's host ports (`features/custom-credentials/provider-settings-card.ts`), bound
 * to this module's rule and the same `ProviderConfigSource` the admin route uses.
 * @complexity O(p + f) per call: one discovery read plus one config read/write.
 */
export function bindProviderSettingsCardPorts({ config, discoverPlugins }: { config: ProviderConfigSource; discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]> }) {
  const fields = async ({ pluginId }: { pluginId: string }) => declaredProviderSettingFields({ records: await discoverPlugins(), pluginId });
  return {
    fields,
    readSettings: async ({ pluginId }: { pluginId: string }) => {
      const view = await config.readSettings({ pluginId });
      return view && !view.unreadable ? view : null;
    },
    save: async ({ pluginId, values }: { pluginId: string; values: Readonly<Record<string, string>> }) => {
      const declared = await fields({ pluginId });
      if (!declared) return { refusal: "This plugin declares no provider settings." };
      const saved = await saveProviderSettings({ config, pluginId, fields: declared, values });
      return "refusal" in saved ? { refusal: saved.refusal.error } : { store: config.scope };
    },
  };
}

/**
 * `provider_status` rows: every discovered plugin that declares provider settings, with its enabled
 * flag and quarantine reason (activation record) and `providerSettingsStatus`. Presence only.
 * @complexity O(p) plugins, one activation read and one settings read per provider plugin.
 */
export async function listProviderStatuses({ config, discoverPlugins, activation }: {
  config: ProviderConfigSource; discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  activation: (required: { pluginId: string }) => Promise<{ enabled: boolean; quarantineReason?: string } | null>;
}) {
  const records = await discoverPlugins();
  const rows = [];
  for (const { id: pluginId } of records) {
    const fields = declaredProviderSettingFields({ records, pluginId });
    if (!fields) continue;
    const state = await activation({ pluginId });
    rows.push({ pluginId, enabled: state?.enabled === true, ...(await providerSettingsStatus({ config, pluginId, fields })),
      ...(state?.quarantineReason ? { quarantine: state.quarantineReason } : {}) });
  }
  return rows;
}
