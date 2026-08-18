import { contributeCommentsTools } from "../comments/tool-registrations";
import { contributeContentTypesTools } from "../features/content-types/tool-registrations";
import { contributeDatabaseTools } from "../features/database/tool-registrations";
import { contributeDeploymentsTools } from "../features/deployments/tool-registrations";
import { contributeEntriesTools } from "../features/entries/tool-registrations";
import { contributePagesTools } from "../features/pages/tool-registrations";
import { contributePluginsTools } from "../features/plugin-runtime/tool-registrations";
import { contributeRecoveryTools } from "../features/recovery/tool-registrations";
import { contributeTaxonomyTools } from "../features/taxonomy/tool-registrations";
import { contributeThemesTools } from "../features/theme/tool-registrations";
import { contributeWorkspaceTools } from "../features/workspace/tool-registrations";
import { contributeFormsTools } from "../forms/tool-registrations";
import { contributeIdentityTools } from "../identity/tool-registrations";
import { contributeIntegrationsTools } from "../integrations/tool-registrations";
import { contributeMediaTools } from "../media/tool-registrations";
import { contributeMembersTools } from "../members/tool-registrations";
import { contributeMenusTools } from "../navigation/tool-registrations";
import { contributeNewsletterTools } from "../newsletter/tool-registrations";
import { contributeRedirectsTools } from "../redirects/tool-registrations";
import { contributeSeoTools } from "../seo/tool-registrations";
import { contributeSourceControlTools } from "../features/source-control/tool-registrations";
import { contributeStaticPublishTools } from "../features/deployments/publish-agent-tools";
import { contributeWidgetsTools } from "../widgets/tool-registrations";
import { registerToolContributor } from "../assistant";
import { buildSettingsRegistrations, settingsDerivedRisk } from "../features/settings/tool-registrations";

/**
 * @file The server composition manifest for `assistant/tool-contribution-registry.ts`: the one file
 * that decides which first-party features' AI tools are installed into the catalog, by calling each
 * one's own `contribute<Domain>Tools()` explicitly.
 *
 * Shape: `server composition manifest -> feature contribution installers -> assistant registry ->
 * final tool catalog` (2026-08-17 design, following the `mcp-federation/presets.ts` precedent
 * already in this codebase — see `tool-contribution-registry.ts`'s header for the full rationale).
 * This file plays the role `agent-daemon-server.ts` plays for MCP federation presets
 * (`registerSupabaseMcpPreset()`), just for AI-tool contributions and shared by BOTH real
 * composition roots instead of being called from one.
 *
 * `server` is the right layer for this, not `assistant`: `assistant` must not import a feature by
 * name (that is precisely the edge that used to close the `[assistant, comments, features/plugins,
 * newsletter]` module cycle), but `server` already imports most first-party features by name
 * throughout `server/deps.ts`/`server/app.ts` — this file adds no new module-level edge that did not
 * already exist, it just adds one more file-level reason for edges that were already there.
 *
 * 24 of the ~24 assistant-wired domains are listed here today (2026-08-17: `comments`/`newsletter`
 * from Stage 1 of the registry rollout; `identity`/`members`/`taxonomy`/`redirects` added in Stage 2
 * batch 1 — `themes` was also tried in that batch and reverted, see
 * `assistant/tool-registrations.ts`'s header for why; Stage 2 batch 2 (run as two parallel worker
 * groups) added the other eleven — group A did `widgets`/`content-types`/`forms`/`menus`/`recovery`/
 * `plugins`/`entries` (`widgets` converted FIRST specifically to remove the `assistant -> widgets`
 * static edge before `content-types`/`forms`/`entries` converted, since all three are imported by
 * `widgets`; `database` was ALSO tried in that group and reverted — see
 * `assistant/tool-registrations.ts`'s own `DOMAIN_SLICES` entry comment for why: a much larger
 * 16-module SCC than the `themes`/`post` near-misses in the prior batch), group B did
 * `integrations`/`workspace`/`pages`/`seo` (`source-control`/`deployments`/`static-publish`
 * were ALSO tried in that group and reverted — see `assistant/tool-registrations.ts`'s header for
 * the full per-domain trace on each; `media` was tried in that same group and reverted too, but was
 * retried in a later, separate pass this session, after `widgets`'s own conversion above had merged
 * and removed the static edge that caused its original revert — see
 * `assistant/tool-registrations.ts`'s header and `media/tool-registrations.ts`'s own header for the
 * full before/after trace; it is listed above alongside the other seventeen). `database` was ALSO
 * retried in a later pass, once the specific edge that closed its 16-module SCC (a single value
 * import, `db/sqlite/database-introspection-adapter.sqlite.ts`'s `getDriftStatus` from
 * `features/database/drift.ts`) was identified and removed by relocating `drift.ts` into `db/` — see
 * `features/database/tool-registrations.ts`'s own header and
 * `ADS-memory/reports/architecture/2026-08-17-database-cycle-investigation.md` for the full trace;
 * it is listed above alongside the other eighteen. `settings` is the 20th and is NOT wired via a
 * `contribute<Domain>Tools()` call like the other domains — see the DELIBERATE ONE-OFF EXCEPTION
 * comment directly on {@link installFirstPartyToolContributors} below for why the standard shape is
 * actively unsafe for this one domain. `source-control` is the 21st, retried once
 * `features/vendor-credentials/dual-read.ts`'s two legacy-table imports were injected instead of
 * value-imported (see `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`,
 * Option B, and `features/source-control/tool-registrations.ts`'s own header for the full trace).
 * `deployments` is the 22nd and `static-publish` the 23rd, retried together once
 * `features/vendor-credentials/store.ts`'s own `extractGitHubLogin` import was ALSO injected instead
 * of value-imported (a second, previously-undocumented edge that Option B alone did not cover — see
 * `features/deployments/tool-registrations.ts`'s own header for the full trace). The two convert in
 * lockstep, not independently: `check:architecture`'s module graph is per-directory, and both live in
 * the same `features/deployments` module, so either one alone (with the other still value-imported
 * from `assistant`) still closes a live 2-module `[assistant, features/deployments]` cycle. `themes`
 * is the 24th and last of this pass, retried once `deployments`/`static-publish` left `assistant`
 * without any transitive path into `export` (see `features/theme/tool-registrations.ts`'s own header
 * for the full trace, including the two prior reverts). `post` remains the sole holdout — see that
 * domain's own entry in `assistant/tool-registrations.ts`'s `DOMAIN_SLICES` array for its current
 * status; it is checked for the same conversion below only once its own blocker is confirmed clear,
 * not assumed clear just because `themes` shared part of the same chain. The rest still wire
 * through `assistant/tool-registrations.ts`'s own `DOMAIN_SLICES` array, unchanged — see that file's header
 * for why (its own array still names exactly which domains those are, with a comment on each
 * reverted one explaining the specific cycle it closed).
 * A later pass converts the rest the same way, checking for this same "does anything else depend on
 * me" shape per domain first — and, per Stage 2 batch 2's own finding, checking it precisely (value
 * vs. `import type`, since only value imports participate in the runtime-only cycle graph) rather
 * than by a plain importer grep alone, since a domain can look clean by a direct-importer check yet
 * still close a cycle through a VALUE-importing intermediate module that is itself still statically
 * wired here. Nothing about this file's shape changes when a later pass converts more domains, only
 * its import list and the body of `installFirstPartyToolContributors` grow.
 *
 * Idempotent: `registerToolContributor` (what each `contribute<Domain>Tools()` call ultimately
 * calls) replaces an existing entry by domain key rather than appending, so calling this function
 * more than once in the same process — a real thing both real callers below do NOT do (each calls
 * it exactly once, at boot), but that a shared test process legitimately might — is safe and leaves
 * the registry in the same state as calling it once.
 *
 * Real callers (must run this BEFORE their own `buildAssistantToolRegistrations` call, since that
 * function reads whatever is currently registered):
 * - `server/agent-daemon/agent-daemon-server.ts` (the spawned agent daemon's own boot).
 * - `server/modules/assistant-byok.ts`'s `createAssistantByokModule` (the in-process BYOK path).
 *
 * NOT third-party plugin tool contributions: those must still enter through this same
 * `registerToolContributor` seam eventually, but gated behind the SPEC-005 plugin runtime's own
 * policy checks, not auto-discovered from disk and installed unconditionally the way the calls below
 * are — plugin/data-module membership (`declareDataModule`) and AI-tool membership are deliberately
 * two different systems (see the 2026-08-17 architecture addendum this file implements).
 *
 * DELIBERATE ONE-OFF EXCEPTION — `settings`: every other domain above owns its own
 * `contribute<Domain>Tools()` function (feature module -> `registerToolContributor`, imported FROM
 * assistant), which is the uniform shape. `settings` does NOT get one, and the plain
 * `registerToolContributor({domain: "settings", ...})` call below is deliberately inline here
 * instead — see
 * `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md` for the full
 * analysis. Short version: `assistant/public-assistant-settings.ts`, `assistant/custom-instructions.ts`,
 * and `assistant/execution-mode-settings.ts` already value-import `features/settings` directly (as a
 * generic settings-ledger engine, not as an AI-tool domain) — a real, pre-existing
 * `assistant -> features/settings` edge that has nothing to do with this file. Giving `features/settings`
 * the standard `contributeSettingsTools()` shape would add a `features/settings -> assistant` edge on
 * top of that, closing a NEW 2-node `assistant <-> features/settings` cycle. `server/` already
 * imports both `registerToolContributor` (via `assistant`) and `buildSettingsRegistrations`/
 * `settingsDerivedRisk` (via `features/settings/tool-registrations`) safely as the composition root,
 * so registering here adds no edge risk — this is the SAME reasoning every other call below relies
 * on, just applied one level up instead of inside the feature module. DO NOT "fix" this by giving
 * `settings` a `contributeSettingsTools()` matching the others — that reintroduces the cycle this
 * exception exists to avoid. The 3 side-door files above are intentionally left untouched too; see
 * the investigation report for why they are a different, lower-priority concern (no cycle risk
 * today).
 */
export function installFirstPartyToolContributors(): void {
  contributeCommentsTools();
  contributeContentTypesTools();
  contributeDatabaseTools();
  contributeDeploymentsTools();
  contributeEntriesTools();
  contributeFormsTools();
  contributeIdentityTools();
  contributeIntegrationsTools();
  contributeMediaTools();
  contributeMembersTools();
  contributeMenusTools();
  contributeNewsletterTools();
  contributePagesTools();
  contributePluginsTools();
  contributeRecoveryTools();
  contributeRedirectsTools();
  contributeSeoTools();
  registerToolContributor({ domain: "settings", build: buildSettingsRegistrations, risk: settingsDerivedRisk });
  contributeSourceControlTools();
  contributeStaticPublishTools();
  contributeTaxonomyTools();
  contributeThemesTools();
  contributeWidgetsTools();
  contributeWorkspaceTools();
}
