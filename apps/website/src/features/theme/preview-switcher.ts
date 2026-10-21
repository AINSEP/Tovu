import { ensureSettingDefinitions, getEffective, SCOPE_BIT, ForbiddenError, ValueValidationFailedError,
  type EnsureSettingDefinitionsDeps, type SettingsRepoPort, type SetValueRequired } from "@jini-ai/core/settings";
import type { DiscoveredTheme } from "./theme.js";

/** Theme ids are also the public preview keys; no separate per-theme alias registry. */
export const PREVIEW_SWITCHER_NAMESPACE = "core.theme";
export const PREVIEW_SWITCHER_KEY = "previewSwitcher";
export interface PreviewTheme { themeId: string; label: string }
export interface PreviewSwitcher { enabled: boolean; themes: PreviewTheme[]; position: "top" }
export interface PreviewThemeRoster { themes: readonly DiscoveredTheme[]; activeThemeId: string }
const DISABLED: PreviewSwitcher = { enabled: false, themes: [], position: "top" };

/** Register on the existing ledger; preserves owner values and needs no migration. */
export function ensurePreviewSwitcherSetting({ deps, systemPrincipalId }: {
  deps: EnsureSettingDefinitionsDeps; systemPrincipalId: string;
}, _options = {}): Promise<void> {
  return ensureSettingDefinitions(deps, { namespace: PREVIEW_SWITCHER_NAMESPACE, systemPrincipalId,
    definitions: [{ key: PREVIEW_SWITCHER_KEY, schema: { type: "json" }, defaultValue: { enabled: false, themes: [], position: "top" }, scopes: SCOPE_BIT.workspace }] });
}

function invalid(_required = {}, _options = {}): ValueValidationFailedError {
  return new ValueValidationFailedError("Theme preview requires enabled (boolean), position 'top', and 2..8 unique installed themes with themeId and a non-empty label (max 80 characters), including the active theme. Disabled defaults may have an empty theme list.");
}

/** Narrow JSON objects once; arrays and null cannot be preview configurations or entries. */
function previewRecord({ value }: { value: unknown }, _options = {}): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid({});
  return value as Record<string, unknown>;
}

function parseTheme({ value }: { value: unknown }, _options = {}): PreviewTheme {
  const entry = previewRecord({ value });
  if (Object.keys(entry).some(key => !["themeId", "label"].includes(key))) throw invalid({});
  if (typeof entry.themeId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(entry.themeId) || entry.themeId === "reset") throw invalid({});
  if (typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 80) throw invalid({});
  return { themeId: entry.themeId, label: entry.label.trim() };
}

/** Reject unknown fields and wrong scalar/container types before inspecting entries. */
function parseConfigShape({ value }: { value: unknown }, _options = {}): { enabled: boolean; themes: unknown[]; position: "top" } {
  const config = previewRecord({ value });
  if (Object.keys(config).some(key => !["enabled", "themes", "position"].includes(key))) throw invalid({});
  if (typeof config.enabled !== "boolean" || config.position !== "top" || !Array.isArray(config.themes)) throw invalid({});
  return { enabled: config.enabled, themes: config.themes, position: "top" };
}

/** Parse the stored shape. Cross-theme constraints are checked by the write policy below.
 * @throws ValueValidationFailedError for malformed or duplicate entries. O(themes), capped at 8. */
export function parsePreviewSwitcher({ value }: { value: unknown }, _options = {}): PreviewSwitcher {
  const config = parseConfigShape({ value });
  const count = config.themes.length;
  if (count > 8 || (count < 2 && (config.enabled || count !== 0))) throw invalid({});
  const themes = config.themes.map(value => parseTheme({ value }));
  if (new Set(themes.map(theme => theme.themeId)).size !== count) throw invalid({});
  return { enabled: config.enabled, position: "top", themes };
}

/** Validate against this site's installed roster, never the platform's theme catalog. */
export function validatePreviewSwitcher({ value, themes, activeThemeId }: PreviewThemeRoster & { value: unknown }, _options = {}): PreviewSwitcher {
  const config = parsePreviewSwitcher({ value });
  const installed = new Set(themes.filter(theme => theme.status === "valid").map(theme => theme.manifest.id));
  if (config.themes.some(theme => !installed.has(theme.themeId))) throw invalid({});
  if (config.enabled && !config.themes.some(theme => theme.themeId === activeThemeId)) throw invalid({});
  return config;
}

/** Fresh workspace read. A later activation is always included; removed themes stop being offered.
 * O(installed themes + 8), one effective setting lookup; no writes during rendering. */
export async function readPreviewSwitcher({ settingsRepo, workspaceId, themes, activeThemeId }: PreviewThemeRoster & {
  settingsRepo: SettingsRepoPort; workspaceId: string;
}, _options = {}): Promise<PreviewSwitcher> {
  const found = await getEffective({ repo: settingsRepo }, { namespace: PREVIEW_SWITCHER_NAMESPACE, key: PREVIEW_SWITCHER_KEY, scopeContext: { workspaceId } });
  const config = parsePreviewSwitcher({ value: found?.value ?? DISABLED });
  if (!config.enabled) return config;
  const installed = new Map(themes.filter(theme => theme.status === "valid").map(theme => [theme.manifest.id, theme]));
  const active = installed.get(activeThemeId);
  if (!active) return { ...DISABLED };
  const choices = config.themes.filter(theme => installed.has(theme.themeId) && theme.themeId !== activeThemeId).slice(0, 7);
  choices.unshift(config.themes.find(theme => theme.themeId === activeThemeId) ?? { themeId: activeThemeId, label: active.manifest.name });
  return { ...config, enabled: choices.length >= 2, themes: choices };
}

/** Host write policy for canonical coordinates (aliases resolve in the settings chokepoint).
 * Uses exactly the active-theme permission. Reuses ledger validation, transactions and revisions.
 * @throws ForbiddenError or ValueValidationFailedError before any durable effect. */
export async function preparePreviewSwitcherWrite({ write, themes, activeThemeId, workspaceId }: PreviewThemeRoster & {
  write: SetValueRequired; workspaceId: string;
}, _options = {}): Promise<SetValueRequired> {
  const { input, deps } = write;
  if (input.scope !== "workspace" || input.workspaceId !== workspaceId) throw invalid({});
  const permission = await deps.authorize({ principalId: input.callerPrincipalId, workspaceId, permission: "theme.set", entityType: "presentation" });
  if (!permission.allowed) throw new ForbiddenError("Theme preview changes require theme.set");
  const value = validatePreviewSwitcher({ value: input.value, themes, activeThemeId });
  return { deps, input: { ...input, value: { ...value, themes: value.themes.map(theme => ({ ...theme })) }, requiredPermissionOverride: "theme.set" } };
}

/** Query wins over cookie, including invalid queries and reset. Unknown keys use the active theme. */
export function choosePreviewTheme({ config, activeThemeId, query, cookie }: {
  config: PreviewSwitcher; activeThemeId: string; query?: string; cookie?: string;
}, _options = {}): { themeId: string; cookie?: string; reset: boolean; preview: boolean } {
  if (!config.enabled) return { themeId: activeThemeId, reset: false, preview: false };
  if (query === "reset") return { themeId: activeThemeId, reset: true, preview: true };
  const key = query ?? cookie;
  const choice = config.themes.find(theme => theme.themeId === key);
  if (!choice) return { themeId: activeThemeId, reset: false, preview: false };
  return { themeId: choice.themeId, cookie: query, reset: false, preview: true };
}
