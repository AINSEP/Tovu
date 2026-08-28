/**
 * @file Settings' agent-tool registrations — re-exported from `@jini-ai/cms/settings`.
 *
 * A shim rather than a rewrite of the one importer, deliberately: `buildSettingsRegistrations`/
 * `settingsDerivedRisk`/`SettingsToolDeps` live in the package, this file only re-exports them and
 * (below) contributes them to the assistant's tool catalog.
 *
 * Converted to the standard `registerToolContributor` pattern 2026-08-17, the last domain to do so —
 * see `assistant/tool-registrations.ts`'s own former `settings` `DOMAIN_SLICES` entry (now removed)
 * for the full trace of why this was a genuinely different shape of blocker than every other
 * conversion in this rollout, not just a later-scheduled one. Short version: `settings` itself had NO
 * edge into `assistant` before this file's `contributeSettingsTools()` below — the blocker was that 3
 * OTHER files inside `assistant/` (`public-assistant-settings.ts`, `custom-instructions.ts`,
 * `execution-mode-settings.ts`) value-imported `features/settings`'s engine functions directly
 * (`getEffective`/`resolveDefinitionRaw`/`registerDefinitions`/`set`/`ensureSettingDefinitions`),
 * which would have closed a 2-node `[assistant, features/settings]` cycle the moment this file added
 * the reverse `features/settings -> assistant` edge below. Those 3 files now take those 5 functions
 * (plus the `SCOPE_BIT`/`INSTRUCTIONS_NAMESPACE` constants, injected for uniformity with the rest of
 * each file's deps surface) as injected deps fields instead of static imports — the same Option-B-style
 * technique `vendor-credentials/store.ts`'s `extractGitHubLogin`, `dual-read.ts`'s legacy-table
 * imports, and `assistant/site/*`'s `listPublishedPosts` already use elsewhere in this rollout —
 * wired to the real `features/settings` implementations at the composition root
 * (`RouteDeps.getEffective`/`.set`/`.instructionsNamespace` in `server/routes/types.ts`, populated
 * once in both `server/app.ts`/`server/deps.ts`; the boot-time `ensure*` registrars' own
 * `resolveDefinitionRaw`/`registerDefinitions`/`scopeBit`/`ensureSettingDefinitions` fields populated
 * at each of their 2+2 call sites in the same 2 files). `check:architecture` confirms 0 module cycles
 * / largest SCC 0 with `settings` wired this way.
 */
import type { ToolContributor } from "#src/assistant/index";
import { buildSettingsRegistrations, settingsDerivedRisk } from "@jini-ai/cms/settings";

export { buildSettingsRegistrations, settingsDerivedRisk, type SettingsToolDeps } from "@jini-ai/cms/settings";

/**
 * Contributes Settings' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildSettingsRegistrations`/
 * `settingsDerivedRisk` by name, and `server/tool-catalog-manifest.ts` no longer inlines this
 * `registerToolContributor` call itself — this is the seam that replaced both, the same shape every
 * other domain in this rollout uses (see this file's header for why `settings` needed the 3 side-door
 * files fixed first rather than converting directly).
 */
export function contributeSettingsTools(): ToolContributor {
  return { domain: "settings", build: buildSettingsRegistrations, risk: settingsDerivedRisk };
}
