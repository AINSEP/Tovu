import type { Express, Request, Response } from "express";
import type { PluginProviderSettingField } from "@jini-ai/plugins/host";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ProviderConfigSource } from "#src/server/runtime/composition/provider-config-source";
import { declaredProviderSettingFields, saveProviderSettings } from "#src/server/runtime/composition/provider-settings-save";
import type { PluginsRouteDeps } from "./deps.js";

/**
 * @file `PLUGIN_PROVIDER_SETTINGS` — `GET`/`PUT /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/provider-settings`
 * (provider wave 2 fix, 2026-10-26). The provider plugin's secure settings card: its manifest-declared
 * fields (`contributes.providers[].settings`), the saved public values, and for secret fields only
 * whether one is saved — a secret is write-only and never leaves the server. Saves go through
 * `ProviderConfigSource` (the project store when one is configured, else this site's vault), sealed.
 * A saved provider applies now through the same provider lifecycle as boot.
 *
 * Read needs `admin.plugins.read`; save needs `admin.plugins.enable` (configuring a provider decides
 * where this site's telemetry goes, the same trust as turning the plugin on). A blank secret keeps
 * the saved one while the public fields are unchanged; changing one (an endpoint, a host) needs the
 * saved secrets entered again, so a saved key can never be redirected to another server.
 * That save rule lives in `composition/provider-settings-save.ts`, shared with the assistant's key card.
 */

export interface ProviderSettingsRouteDeps extends Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "discoverPlugins"> {
  tracker?: import('@jini-ai/diagnostics/observability').Tracker;
  providerConfig?: ProviderConfigSource;
  projectKeys?: import("#src/features/project-keys/service").ProjectKeysPort;
  providerAppliesAt?: (input: { pluginId: string }) => "now" | "restart" | "failed";
  reapplyProvider?: (input: { pluginId: string }) => Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult>;
  /** Whether a key was saved the retired way (an API credential labelled `plugin:<id>`), read by label
   *  only, never decrypted. */
  legacyProviderCredential?: (required: { pluginId: string }) => Promise<boolean>;
}

const PATH = "/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/provider-settings";

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

function fieldPresentation({ field }: { field: PluginProviderSettingField }, _optional = {}) {
  return { ...(field.hint ? { hint: field.hint } : {}), ...(field.secret === true ? {} : choicesOf(field)) };
}

async function cardOf({ deps, config, pluginId, fields }: { deps: ProviderSettingsRouteDeps; config: ProviderConfigSource; pluginId: string; fields: readonly PluginProviderSettingField[] }) {
  const saved = await config.readSettings({ pluginId });
  return {
    pluginId, ...(await config.usage({ pluginId })), projectAvailable: config.scope === "project", appliesAt: deps.providerAppliesAt?.({ pluginId }) ?? "now",
    ...((await hasLegacyCredential({ deps, pluginId, saved })) ? { legacyCredential: true as const } : {}),
    ...(saved?.unreadable ? { unreadable: true as const } : {}),
    fields: fields.map((field) => {
      const secret = field.secret === true;
      const value = secret ? undefined : saved?.settings[field.name];
      return { name: field.name, label: field.label, ...fieldPresentation({ field }), secret, required: field.required === true,
        ...(field.requiredUnless ? { requiredUnless: field.requiredUnless } : {}),
        ...(field.requiredWhen ? { requiredWhen: field.requiredWhen } : {}),
        saved: secret ? (saved?.secretNames.includes(field.name) ?? false) : value !== undefined && value !== "", ...(value === undefined ? {} : { value }) };
    }),
  };
}

/** Shared guard: workspace, principal permission, plugin with declared settings, a configured store. */
async function resolveCard({ req, res, deps, permission }: { req: Request; res: Response; deps: ProviderSettingsRouteDeps; permission: string }) {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return undefined; }
  const principal = getAuthedPrincipal(res);
  if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission, workspaceId: deps.workspaceId }))) return undefined;
  const pluginId = String(req.params.pluginId ?? "");
  const records = await deps.discoverPlugins();
  const fields = declaredProviderSettingFields({ records, pluginId });
  if (!fields) { res.status(404).json({ error: "this plugin declares no provider settings", code: "PLUGIN_NOT_FOUND" }); return undefined; }
  if (!deps.providerConfig) { res.status(503).json({ error: "provider settings are not available here", code: "PROVIDER_SETTINGS_UNAVAILABLE" }); return undefined; }
  const contracts = providerContracts({ records, pluginId });
  return { deps, pluginId, fields, config: deps.providerConfig,
    ...(deps.tracker ? { telemetry: { tracker: deps.tracker, contracts, userId: principal.id } } : {}) };
}

function providerContracts({ records, pluginId }: { records: Awaited<ReturnType<ProviderSettingsRouteDeps["discoverPlugins"]>>; pluginId: string }, _optional = {}) {
  return (records.find(record => record.id === pluginId)?.manifest?.contributes?.providers ?? []).map(provider => provider.contract);
}

function isProjectKeyUseInput(input: Record<string, unknown> | null, _optional = {}): input is { use: boolean } {
  return !!input && typeof input.use === "boolean" && !Object.keys(input).some(key => key !== "use");
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
      const saved = await saveProviderSettings({ ...card, reapply: deps.reapplyProvider, values: (req.body as { values?: unknown } | null)?.values });
      if ("refusal" in saved) { res.status(saved.refusal.code === "PROVIDER_SETTINGS_UNAVAILABLE" ? 503 : 400).json(saved.refusal); return; }
      const attached = deps.projectKeys ? await deps.projectKeys.savedResult({ result: saved }) as typeof saved : saved;
      res.json({ ...(await cardOf(card)), appliesAt: attached.appliesAt, ...(attached.message ? { message: attached.message } : {}) });
    } catch { internalError(res); }
  });
  registerProjectKeyUseRoute(app, deps);
}

/** Admin and chat share the same attachment owner and per-kind save permission. */
function registerProjectKeyUseRoute(app: Express, deps: ProviderSettingsRouteDeps): void {
  app.put("/api/admin/v1/workspaces/:workspaceId/project-keys/:keyId/use", async (req, res) => {
    try {
      if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
      const principal = getAuthedPrincipal(res);
      if (!deps.projectKeys) { res.status(503).json({ error: "This site has no project key store." }); return; }
      const input = req.body as Record<string, unknown> | null;
      if (!isProjectKeyUseInput(input)) { res.status(400).json({ error: "use must be true or false" }); return; }
      const keyId = String(req.params.keyId);
      if (!await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "custom-credentials.read", workspaceId: deps.workspaceId })) return;
      const permission = await deps.projectKeys.permissionFor({ keyId });
      if (!await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission, workspaceId: deps.workspaceId })) return;
      res.json(await deps.projectKeys.use({ keyId, use: input.use }));
    } catch (error) {
      if (error instanceof Error && error.name === "ToolInputError") { res.status(400).json({ error: error.message }); return; }
      internalError(res);
    }
  });
}
