import type { Express, Request, Response } from "express";
import type { PluginProviderSettingField } from "@jini-ai/plugins/host";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ProviderConfigSource } from "#src/server/runtime/composition/provider-config-source";
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
 * the saved one, so re-saving the public fields never requires re-entering a key.
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

async function cardOf({ deps, config, pluginId, fields }: { deps: ProviderSettingsRouteDeps; config: ProviderConfigSource; pluginId: string; fields: readonly PluginProviderSettingField[] }) {
  const saved = await config.readSettings({ pluginId });
  return {
    pluginId, store: config.scope, appliesAt: "next-start" as const,
    ...((await hasLegacyCredential({ deps, pluginId, saved })) ? { legacyCredential: true as const } : {}),
    fields: fields.map((field) => {
      const secret = field.secret === true;
      const value = secret ? undefined : saved?.settings[field.name];
      return { name: field.name, label: field.label, ...(field.hint ? { hint: field.hint } : {}), secret, required: field.required === true,
        saved: secret ? (saved?.secretNames.includes(field.name) ?? false) : value !== undefined && value !== "", ...(value === undefined ? {} : { value }) };
    }),
  };
}

/** Request values → the next saved config; blank secrets keep the saved one. Undefined on a malformed body. */
function nextConfig({ body, fields, current }: { body: unknown; fields: readonly PluginProviderSettingField[]; current: { settings: Readonly<Record<string, string>>; secrets: Readonly<Record<string, string>> } | null }) {
  const values = (body as { values?: unknown } | null)?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return undefined;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const entries = Object.entries(values as Record<string, unknown>);
  if (entries.some(([name, value]) => !byName.has(name) || typeof value !== "string")) return undefined;
  const settings: Record<string, string> = { ...current?.settings };
  const secrets: Record<string, string> = { ...current?.secrets };
  for (const [name, value] of entries as [string, string][]) {
    if (!byName.get(name)!.secret) settings[name] = value.trim();
    else if (value.trim() !== "") secrets[name] = value.trim();
  }
  return { settings, secrets };
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
      const config = nextConfig({ body: req.body, fields: card.fields, current: await card.config.read({ pluginId: card.pluginId }) });
      if (!config) { res.status(400).json({ error: "values must map declared setting names to text", code: "PROVIDER_SETTINGS_INVALID" }); return; }
      await card.config.write({ pluginId: card.pluginId, config });
      res.json(await cardOf(card));
    } catch { internalError(res); }
  });
}
