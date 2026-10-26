import type { Express, Request, Response } from "express";
import type { PluginProviderSettingField } from "@jini-ai/plugins/host";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { ProviderConfigUnreadableError, type ProviderConfigSource } from "#src/server/runtime/composition/provider-config-source";
import type { PluginsRouteDeps } from "./deps.js";

/**
 * @file `PLUGIN_PROVIDER_SETTINGS` — `GET`/`PUT /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/provider-settings`
 * (provider wave 2 fix, 2026-10-26). The provider plugin's secure settings card: its manifest-declared
 * fields (`contributes.providers[].settings`), the saved public values, and for secret fields only
 * whether one is saved — a secret is write-only and never leaves the server. Saves go through
 * `ProviderConfigSource` (the project store when one is configured, else this site's vault), sealed.
 * A saved provider takes effect at the next start (providers initialize before application work).
 *
 * Read needs `admin.plugins.read`; save needs `admin.plugins.enable` (configuring a provider decides
 * where this site's telemetry goes, the same trust as turning the plugin on). A blank secret keeps
 * the saved one while the public fields are unchanged; changing one (an endpoint, a host) needs the
 * saved secrets entered again, so a saved key can never be redirected to another server.
 */

export interface ProviderSettingsRouteDeps extends Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "discoverPlugins"> {
  providerConfig?: ProviderConfigSource;
  /** Whether a key was saved the retired way (an API credential labelled `plugin:<id>`), read by label
   *  only, never decrypted. */
  legacyProviderCredential?: (required: { pluginId: string }) => Promise<boolean>;
}

const PATH = "/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/provider-settings";

/** The plugin's declared settings fields (all its providers, first declaration of a name wins). */
async function declaredFields({ deps, pluginId }: { deps: ProviderSettingsRouteDeps; pluginId: string }): Promise<PluginProviderSettingField[] | undefined> {
  const record = (await deps.discoverPlugins()).find((candidate) => candidate.id === pluginId);
  const fields = new Map<string, PluginProviderSettingField>();
  for (const provider of record?.manifest?.contributes?.providers ?? []) for (const field of provider.settings ?? []) if (!fields.has(field.name)) fields.set(field.name, field);
  return fields.size === 0 ? undefined : [...fields.values()];
}

/**
 * Wave 2 saved provider keys as API credentials labelled `plugin:<id>`; boot no longer reads them
 * (Codex fix-lane MED). Mapping them into the declared fields would need per-vendor knowledge in Tovu,
 * which the manifest-driven boot removed, so the card asks for the key again instead: shown while
 * nothing is saved the new way, gone after the first save. A failing check never breaks the card.
 */
async function hasLegacyCredential({ deps, pluginId, saved }: { deps: ProviderSettingsRouteDeps; pluginId: string; saved: unknown }): Promise<boolean> {
  if (saved || !deps.legacyProviderCredential) return false;
  return deps.legacyProviderCredential({ pluginId }).catch(() => false);
}

/** A public field's declared choices (`default`, `options`, `allowCustom`), passed to the card as declared. */
const choicesOf = ({ default: fallback, options, allowCustom }: PluginProviderSettingField) => ({
  ...(fallback === undefined ? {} : { default: fallback }), ...(options ? { options } : {}), ...(allowCustom ? { allowCustom: true as const } : {}),
});

async function cardOf({ deps, config, pluginId, fields }: { deps: ProviderSettingsRouteDeps; config: ProviderConfigSource; pluginId: string; fields: readonly PluginProviderSettingField[] }) {
  const saved = await config.readSettings({ pluginId });
  return {
    pluginId, store: config.scope, appliesAt: "next-start" as const,
    ...((await hasLegacyCredential({ deps, pluginId, saved })) ? { legacyCredential: true as const } : {}),
    ...(saved?.unreadable ? { unreadable: true as const } : {}),
    fields: fields.map((field) => {
      const secret = field.secret === true;
      const value = secret ? undefined : saved?.settings[field.name];
      return { name: field.name, label: field.label, ...(field.hint ? { hint: field.hint } : {}), ...(secret ? {} : choicesOf(field)), secret, required: field.required === true,
        saved: secret ? (saved?.secretNames.includes(field.name) ?? false) : value !== undefined && value !== "", ...(value === undefined ? {} : { value }) };
    }),
  };
}

type SavedConfig = { settings: Readonly<Record<string, string>>; secrets: Readonly<Record<string, string>> };
type NextConfig = { config: SavedConfig } | { refusal: { code: string; error: string } };

const INVALID = { refusal: { code: "PROVIDER_SETTINGS_INVALID", error: "values must map declared setting names to text" } };

/** The body's `values` as `[declared name, text]` pairs; undefined when malformed or naming an undeclared field. */
function requestValues({ body, fields }: { body: unknown; fields: ReadonlyMap<string, PluginProviderSettingField> }): [string, string][] | undefined {
  const values = (body as { values?: unknown } | null)?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return undefined;
  const entries = Object.entries(values as Record<string, unknown>);
  return entries.every(([name, value]) => fields.has(name) && typeof value === "string") ? (entries as [string, string][]) : undefined;
}

/** Labels of the fields `pick` selects, joined for a message. */
const labelsOf = (fields: readonly PluginProviderSettingField[], pick: (field: PluginProviderSettingField) => boolean) =>
  fields.filter(pick).map((field) => field.label).join(", ");

/**
 * Request values → the next saved config. A blank secret keeps the saved one, but only while every
 * public field is unchanged: an endpoint or host decides where the secret is sent, so changing one
 * with a kept secret would let an admin redirect a key they never saw to their own server. Then the
 * kept secrets must be entered again, and the save is refused with a message naming them.
 */
function nextConfig({ body, fields, current }: { body: unknown; fields: readonly PluginProviderSettingField[]; current: SavedConfig | null }): NextConfig {
  const entries = requestValues({ body, fields: new Map(fields.map((field) => [field.name, field])) });
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
async function currentConfig({ config, pluginId }: { config: ProviderConfigSource; pluginId: string }): Promise<SavedConfig | null> {
  return config.read({ pluginId }).catch((error: unknown) => {
    if (error instanceof ProviderConfigUnreadableError) return null;
    throw error;
  });
}

/** Shared guard: workspace, principal permission, plugin with declared settings, a configured store. */
async function resolveCard({ req, res, deps, permission }: { req: Request; res: Response; deps: ProviderSettingsRouteDeps; permission: string }) {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return undefined; }
  const principal = getAuthedPrincipal(res);
  if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission, workspaceId: deps.workspaceId }))) return undefined;
  const pluginId = String(req.params.pluginId ?? "");
  const fields = await declaredFields({ deps, pluginId });
  if (!fields) { res.status(404).json({ error: "this plugin declares no provider settings", code: "PLUGIN_NOT_FOUND" }); return undefined; }
  if (!deps.providerConfig) { res.status(503).json({ error: "provider settings are not available here", code: "PROVIDER_SETTINGS_UNAVAILABLE" }); return undefined; }
  return { deps, pluginId, fields, config: deps.providerConfig };
}

const internalError = (res: Response) => res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });

export function registerPluginProviderSettingsRoutes(app: Express, deps: ProviderSettingsRouteDeps): void {
  app.get(PATH, async (req, res) => {
    try {
      const card = await resolveCard({ req, res, deps, permission: "admin.plugins.read" });
      if (card) res.json(await cardOf(card));
    } catch { internalError(res); }
  });
  app.put(PATH, async (req, res) => {
    try {
      const card = await resolveCard({ req, res, deps, permission: "admin.plugins.enable" });
      if (!card) return;
      const next = nextConfig({ body: req.body, fields: card.fields, current: await currentConfig(card) });
      if ("refusal" in next) { res.status(400).json(next.refusal); return; }
      await card.config.write({ pluginId: card.pluginId, config: next.config });
      res.json(await cardOf(card));
    } catch { internalError(res); }
  });
}
