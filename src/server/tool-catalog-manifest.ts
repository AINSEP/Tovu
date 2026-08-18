import { contributeCommentsTools } from "../comments/tool-registrations";
import { contributeContentTypesTools } from "../features/content-types/tool-registrations";
import { contributeDatabaseTools } from "../features/database/tool-registrations";
import { contributeDeploymentsTools } from "../features/deployments/tool-registrations";
import { contributeEntriesTools } from "../features/entries/tool-registrations";
import { contributePagesTools } from "../features/pages/tool-registrations";
import { contributePluginsTools } from "../features/plugin-runtime/tool-registrations";
import { contributePostTools } from "../features/post/tool-registrations";
import { contributeRecoveryTools } from "../features/recovery/tool-registrations";
import { contributeTaxonomyTools } from "../features/taxonomy/tool-registrations";
import { contributeThemesTools } from "../features/theme/tool-registrations";
import { contributeWorkspaceTools } from "../features/workspace/tool-registrations";
import { contributeFormsTools } from "../forms/tool-registrations";
import { contributeIdentityTools } from "../identity/tool-registrations";
import { contributeWebhooksTools } from "../webhooks/tool-registrations";
import { contributeMediaTools } from "../media/tool-registrations";
import { contributeMembersTools } from "../members/tool-registrations";
import { contributeMenusTools } from "../navigation/tool-registrations";
import { contributeNewsletterTools } from "../newsletter/tool-registrations";
import { contributeRedirectsTools } from "../redirects/tool-registrations";
import { contributeSeoTools } from "../seo/tool-registrations";
import { contributeSettingsTools } from "../features/settings/tool-registrations";
import { contributeSourceControlTools } from "../features/source-control/tool-registrations";
import { contributeStaticPublishTools } from "../features/deployments/publish-agent-tools";
import { contributeWidgetsTools } from "../widgets/tool-registrations";

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
 * All 25 assistant-wired domains are listed here today (2026-08-17: `comments`/`newsletter`
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
 * it is listed above alongside the other eighteen. `source-control` is the 21st, retried once
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
 * is the 24th of this pass, retried once `deployments`/`static-publish` left `assistant`
 * without any transitive path into `export` (see `features/theme/tool-registrations.ts`'s own header
 * for the full trace, including the two prior reverts). `post` was the 25th and, at the time,
 * believed to be the last domain of this entire rollout, retried a third time once `themes` cleared
 * the `export`/`vendor-credentials` cluster and landing on a smaller, previously-undocumented
 * `[assistant, features/post]` cycle caused by `assistant/site/tools.ts`/
 * `assistant/site/client-directives.ts` value-importing `listPublishedPosts` directly — resolved by
 * injecting that function into both files' deps instead (see
 * `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md` and
 * `features/post/tool-registrations.ts`'s own header for the full trace).
 *
 * `settings` is genuinely the last, converted in a follow-up pass the same day. It had been left
 * wired via a one-off inline `registerToolContributor({domain: "settings", ...})` call right here
 * (removed, see below) because 3 files inside `assistant/` (`public-assistant-settings.ts`,
 * `custom-instructions.ts`, `execution-mode-settings.ts`) value-imported `features/settings`'s engine
 * functions directly — a real `assistant -> features/settings` edge that giving `features/settings`
 * its own `contributeSettingsTools()` would have closed into a NEW 2-node cycle (see
 * `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md` for that analysis).
 * The owner reversed that "leave it as a permanent exception" recommendation the same day (see
 * `ADS-memory/reports/architecture/2026-08-17-settings-exception-removal-scoping.md`): those 3 files'
 * functions were switched to injected deps fields instead of static imports — the same technique
 * `post` above and `deployments`/`source-control` before it used — wired to the real
 * `features/settings` implementations at the composition root
 * (`server/routes/types.ts`'s `RouteDeps.getEffective`/`.set`/`.instructionsNamespace`, populated in
 * both `server/app.ts`/`server/deps.ts`). That removed the real edge entirely, so `settings` now has
 * its own `contributeSettingsTools()` below like every other domain, and the inline
 * `registerToolContributor` call plus its explanatory comment are gone.
 *
 * `check:architecture` confirms 0 module cycles / largest SCC 0 with all 25 domains converted this
 * way — no domain still wires through `assistant/tool-registrations.ts`'s own `DOMAIN_SLICES` array
 * (that file's array is now empty of first-party domains save the two env-gated demo stubs; see its
 * own header).
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
 */
export function installFirstPartyToolContributors(): void {
  contributeCommentsTools();
  contributeContentTypesTools();
  contributeDatabaseTools();
  contributeDeploymentsTools();
  contributeEntriesTools();
  contributeFormsTools();
  contributeIdentityTools();
  contributeWebhooksTools();
  contributeMediaTools();
  contributeMembersTools();
  contributeMenusTools();
  contributeNewsletterTools();
  contributePagesTools();
  contributePluginsTools();
  contributePostTools();
  contributeRecoveryTools();
  contributeRedirectsTools();
  contributeSeoTools();
  contributeSettingsTools();
  contributeSourceControlTools();
  contributeStaticPublishTools();
  contributeTaxonomyTools();
  contributeThemesTools();
  contributeWidgetsTools();
  contributeWorkspaceTools();
}
