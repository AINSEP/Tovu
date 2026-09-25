import {
  registerToolContributor,
  registerDuplicateResourceHandler,
  listDuplicateResourceHandlers,
} from "#src/assistant/index";
import { contributeAgentPluginSearchTools } from "#src/features/agent-plugins/tool-registrations";
import { contributeCommentsTools } from "#src/features/comments/tool-registrations";
import { contributeContentDuplicationTools } from "#src/features/content-duplication/tool-registrations";
import { contributeContentTypesTools } from "#src/features/content-types/tool-registrations";
import { contributeCustomCredentialsTools } from "#src/features/custom-credentials/tool-registrations";
import { contributeDatabaseTools } from "#src/features/database/tool-registrations";
import { contributeDeploymentsTools } from "#src/features/deployments/tool-registrations";
import { contributeEntriesTools } from "#src/features/entries/tool-registrations";
import { contributeExternalMcpTools } from "#src/features/external-mcp/tool-registrations";
import { contributeFsFilesTools } from "#src/features/fs-files/tool-registrations";
import { contributePagesTools } from "#src/features/pages/tool-registrations";
import { contributePluginsTools } from "#src/features/plugin-runtime/tool-registrations";
import { contributePublishContentTools } from "#src/features/publish-content/tool-registrations";
import { installFirstPartyPublishContentTypes } from "./publish-content-manifest.js";
import { contributePostTools, contributePostDuplicateHandlers } from "#src/features/post/tool-registrations";
import { contributeRecoveryTools } from "#src/features/recovery/tool-registrations";
import { contributeTaxonomyTools } from "#src/features/taxonomy/tool-registrations";
import { contributeThemesTools } from "#src/features/theme/tool-registrations";
import { contributeWorkspaceTools } from "#src/features/workspace/tool-registrations";
import { contributeFormsTools, contributeFormsDuplicateHandlers } from "#src/features/forms/tool-registrations";
import { contributeIdentityTools } from "#src/features/identity/tool-registrations";
import { contributeWebhooksTools } from "#src/features/webhooks/tool-registrations";
import { contributeMediaTools } from "#src/features/media/tool-registrations";
import { contributeMediaDuplicateHandlers } from "#src/features/media/duplicate-asset";
import { contributeMediaGenerationTools } from "#src/features/media-generation/tool-registrations";
import { contributeMediaImportTools } from "#src/features/media-import/tool-registrations";
import { contributeMembersTools } from "#src/features/members/tool-registrations";
import { contributeMenusTools } from "#src/features/navigation/tool-registrations";
import { contributeNewsletterTools } from "#src/features/newsletter/tool-registrations";
import { contributeRedirectsTools } from "#src/features/redirects/tool-registrations";
import { contributeSeoTools } from "#src/features/seo/tool-registrations";
import { contributeSettingsTools } from "#src/features/settings/tool-registrations";
import { contributeSiteBackupTools } from "#src/features/site-backup/tool-registrations";
import { contributeSiteEvidenceTools } from "#src/features/site-evidence/tool-registrations";
import { contributeSiteInspectionTools } from "#src/features/site-inspection/index";
import { contributeSitesTools } from "#src/features/sites/index";
import { contributeSourceControlTools } from "#src/features/source-control/tool-registrations";
import { contributeTrashTools } from "#src/features/trash/tool-registrations";
import { contributeSupabaseConnectTools } from "#src/features/supabase-connect/tool-registrations";
import { contributeStaticPublishTools } from "#src/features/deployments/publish-agent-tools";
import { contributeWidgetsTools } from "#src/features/widgets/tool-registrations";

/**
 * @file The server composition manifest for `assistant/tool-contribution-registry.ts`: the one file
 * that decides which first-party features' AI tools are installed into the catalog, by calling each
 * one's own `contribute<Domain>Tools()` explicitly.
 *
 * Shape: `server composition manifest -> feature contribution installers -> assistant registry ->
 * final tool catalog` (2026-08-17 design, following the `assistant/mcp-federation/presets.ts` precedent
 * already in this codebase — see `tool-contribution-registry.ts`'s header for the full rationale).
 * This file plays the role `agent-daemon-server.ts` plays for MCP federation presets
 * (`registerSupabaseMcpPreset()`), just for AI-tool contributions and shared by BOTH real
 * composition roots instead of being called from one.
 *
 * `server` is the right layer for this, not `assistant`: `assistant` must not import a feature by
 * name (that is precisely the edge that used to close the `[assistant, comments, features/plugins,
 * newsletter]` module cycle), but `server` already imports most first-party features by name
 * throughout `server/runtime/composition/deps.ts`/`server/runtime/composition/app.ts` — this file adds no new module-level edge that did not
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
 * `assistant/tool-registrations.ts`'s header and `features/media/tool-registrations.ts`'s own header for the
 * full before/after trace; it is listed above alongside the other seventeen). `database` was ALSO
 * retried in a later pass, once the specific edge that closed its 16-module SCC (a single value
 * import, `platform/db/sqlite/database-introspection-adapter.sqlite.ts`'s `getDriftStatus` from
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
 * both `server/runtime/composition/app.ts`/`server/runtime/composition/deps.ts`). That removed the real edge entirely, so `settings` now has
 * its own `contributeSettingsTools()` below like every other domain, and the inline
 * `registerToolContributor` call plus its explanatory comment are gone.
 *
 * `check:architecture` confirms 0 module cycles / largest SCC 0 with all 25 domains converted this
 * way — no domain still wires through `assistant/tool-registrations.ts`'s own `DOMAIN_SLICES` array
 * (that file's array is now empty of first-party domains save the two env-gated demo stubs; see its
 * own header).
 *
 * `site-inspection` (2026-08-26) is a NEW domain rather than a 26th entry in that rollout's count:
 * it did not exist before, so nothing about it was ever wired through `DOMAIN_SLICES`. It ships three
 * tools — `site_get_profile` (a config snapshot aggregated by `features/site-inspection/
 * site-profile.ts`, the same function `server/inbound/admin-http/routes/site/profile.ts` serves to `apps/admin`),
 * `fetch_published_page` (one same-origin render of this site's own public surface) and
 * `site_describe_capabilities` (next paragraph). It imports
 * no other feature by name: every read is an injected port bound in `features/site-inspection/
 * deps.ts` from the composition root's own bag, which is both what keeps this domain off the module
 * graph and what makes its "cannot reach a credential store" claim checkable from one interface.
 *
 * `site_describe_capabilities` (2026-09-15) is that domain's third tool, not a new domain: one call
 * answering "what can this site do?" with the registered tools grouped by domain, the admin app's
 * screens, and the content types. Its tools section reads the live `ToolRegistry` through the
 * `listCatalogTools` dep, which this function cannot supply: it installs contributors process-wide,
 * while each registry belongs to one composition root. So each registry owner
 * (`server/inbound/assistant/agent-daemon-server.ts`, `assistant/byok-tool-surface.ts`) binds
 * `listToolCatalogEntries(registry)` to its OWN registry in the deps it hands
 * `buildAssistantToolRegistrations`; a caller that binds none gets the tools section reported
 * `unavailable`/`not-wired`, never an empty list. The screens come from
 * `features/site-inspection/admin-screens.generated.ts`, a checked-in copy of `apps/admin`'s
 * `listAdminAgentScreens()` (the server cannot import the admin bundle), which
 * `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts` fails on when the two drift
 * (regenerate with `UPDATE_ADMIN_SCREENS_MANIFEST=1`, see that test's header). It is a list read at
 * call time, not a second index: nothing is seeded, cached or ranked, so it cannot disagree with
 * `search_tools` the way the removed `capability_search` below could.
 *
 * Idempotent: `registerToolContributor` — called here, once per domain, on the `ToolContributor`
 * each `contribute<Domain>Tools()` returns (Phase 0 restructure, 2026-08-27: contributors used to
 * call `registerToolContributor` themselves, which meant a domain/feature file importing the
 * assistant runtime by value just to register itself; inverted so only this composition root does,
 * enforced by the `domain-no-direct-assistant-tool-registration` dependency-cruiser rule) — replaces
 * an existing entry by domain key rather than appending, so calling this function more than once in
 * the same process — a real thing both real callers below do NOT do (each calls it exactly once, at
 * boot), but that a shared test process legitimately might — is safe and leaves the registry in the
 * same state as calling it once.
 *
 * Real callers (must run this BEFORE their own `buildAssistantToolRegistrations` call, since that
 * function reads whatever is currently registered):
 * - `server/inbound/assistant/agent-daemon-server.ts` (the spawned agent daemon's own boot).
 * - `server/runtime/composition/modules/assistant-byok.ts`'s `createAssistantByokModule` (the in-process BYOK path).
 *
 * NOT third-party plugin tool contributions: those must still enter through this same
 * `registerToolContributor` seam eventually, but gated behind the SPEC-005 plugin runtime's own
 * policy checks, not auto-discovered from disk and installed unconditionally the way the calls below
 * are — plugin/data-module membership (`declareDataModule`) and AI-tool membership are deliberately
 * two different systems (see the 2026-08-17 architecture addendum this file implements).
 *
 * `capability_search`/`capability_get` (2026-08-22 through 2026-08-26) used to be registered here —
 * a discovery-only tool PAIR backed by a second, parallel content-source registry
 * (`assistant/capability-source-registry.ts`), fed by Agent Plugins' Skills. REMOVED 2026-08-26
 * (owner call): every installed Agent Plugin now gets its own real tool, `agent_plugin_<pluginId>`
 * (`features/agent-plugins/tool-registrations.ts`, wired at boot by
 * `server/inbound/assistant/agent-daemon-server.ts`), whose description already folds in every one of
 * that plugin's skills' vocabulary — so `search_tools` alone finds what `capability_search` used to,
 * with no second index for the agent to guess between. See
 * `ADS-memory/knowledge/2026-08-26-removed-capability-search.md` for the full design that was
 * removed and how to restore it if this trade is ever revisited.
 *
 * `contributeSiteEvidenceTools()` (2026-08-26) is likewise not a 26th domain in that rollout: it is
 * one new native tool (`site_collect_page_evidence`) in its own `features/site-evidence` module,
 * added because a configuration snapshot cannot prove what a published page actually renders. It
 * follows the same contributor shape as the 25 above and adds no new module edge — `server` already
 * imports `features/*` by name throughout this file.
 *
 * `contributeCustomCredentialsTools()` (2026-08-31) is a NEW domain, same category as
 * `site-inspection`/`site-evidence` above rather than a member of the 25-domain rollout: it closes
 * the "the assistant can save a custom provider credential — Access Tokens page's 'Add custom
 * provider' rows, e.g. name.com, fly.io — but can never USE one" gap with two tools,
 * `custom_credential_verify` and `custom_credential_make_request` (GET-only in this slice — see
 * `features/custom-credentials/credentialed-request.ts`'s own header for why write methods are a
 * disclosed omission). Adds no new module edge for the identical reason `site-evidence` above does
 * not.
 *
 * `contributeMediaGenerationTools()` (2026-09-02) is likewise a NEW domain, not a 5th entry on
 * `media`'s existing catalog: it closes the "the assistant can upload an image but cannot GENERATE
 * one" gap with one tool, `media_generate_asset` — wiring `@jini-ai/integrations/media-providers`'s
 * multi-vendor dispatch engine (previously imported nowhere under `apps/`) to the workspace's saved
 * OpenAI media-provider credential (`features/media/provider-credential-store.ts`) and uploading the
 * result through the same `uploadMedia` service `media_upload_asset` uses. OpenAI-only in this slice
 * — see `features/media-generation/agent-tools.ts`'s own header for why every other vendor the
 * engine supports is a disclosed, separately-scoped omission, not a hidden default. Kept as its own
 * domain rather than a `media` catalog addition specifically because `media`'s 4-tool catalog is
 * `@jini-ai/cms`-owned (shared across every host of that package, with its own "wire the ENTIRE
 * catalog" tripwire test), while this tool's whole pipeline is host-specific glue — the same
 * reasoning that already justified `custom-credentials`/`site-inspection`/`site-evidence` as their
 * own standalone domains.
 *
 * `contributeSitesTools()` (2026-09-05) is likewise a NEW domain: one tool, `sites_duplicate_site`,
 * wiring `platform/site-dir/duplicate-site.ts`'s `duplicateSite` to the assistant, for the "a
 * designer/developer wants one site per client" workflow the admin Sites screen's own
 * `listSites`/`createSite` already serve. `features/sites/deps.ts`'s `SitesToolDeps` deliberately
 * does not default `isSiteSwitcherEnabled` itself (its real implementation lives under
 * `server/runtime/composition/`, off limits to `features/**` per `.dependency-cruiser.mjs`'s
 * `feature-no-server-or-framework-imports`) — `assistant/tool-registrations.ts`'s
 * `buildAssistantToolRegistrations` fills it into `enrichedRouteDeps`, the same seam that already
 * supplies `StaticPublishToolDeps.vendorCredentials` for the identical shape of problem.
 *
 * `contributeExternalMcpTools()` (2026-09-07) is likewise a NEW domain: `features/external-mcp/
 * agent-tools.ts`'s 5-tool catalog (list/save/test_connection/oauth_connect/oauth_poll_device) was
 * fully designed and reviewed but never registered anywhere — no `tool-registrations.ts`, no
 * manifest entry, confirmed by `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`
 * (Gap #1). Only the narrower `external_mcp_reauth_prompt` (for an already-broken connection)
 * reached the assistant before this. See `features/external-mcp/tool-registrations.ts`'s own header
 * for the wiring detail.
 *
 * `contributeFsFilesTools()` (2026-09-10) is a NEW domain, two tools: `fs_list_files`/`fs_read_file`,
 * closing the "the assistant has no filesystem access at all" gap — concretely, an Agent Plugin's own
 * bundled `references/*.template.*` files were unreachable. Read-only, and scoped to a fixed, named
 * five-directory allowlist (`features/fs-files/layout.ts`) resolved off `platform/site-dir`'s own
 * `resolveSiteRoot`/`resolveProductRoot` — never the site directory itself (which holds `chat.db`) and
 * never anything server-internal. See `features/fs-files/agent-tools.ts`'s own header for the full
 * allowlist argument and why no write/edit/delete tool exists in this domain. Adds no new module edge
 * for the identical reason `site-evidence`/`custom-credentials` above do not.
 *
 * `contributeContentDuplicationTools()` (2026-09-07) is a NEW domain, one tool: `content_duplicate`,
 * generic over a `resource` parameter rather than one bespoke `*_duplicate` tool per resource (owner
 * correction to the original per-resource `content_post_duplicate` design — see
 * `ADS-memory/reports/2026-09-07-page-duplicate-tool.md`'s follow-up section). This function ALSO
 * populates a second, sibling registry those `ToolContributor` calls above do not touch:
 * `assistant/duplicate-resource-registry.ts`'s per-resource duplicate-handler contributions (today:
 * `contributePostDuplicateHandlers()` covering `post` and `page`, `contributeFormsDuplicateHandlers()`
 * covering `form`, and `contributeMediaDuplicateHandlers()` covering `media`) — see that registry's
 * own header for why it is a separate seam from `ToolContributor`. Those three resources resolve to
 * THREE different permissions (`content.write` / `admin.forms.manage` / `media.upload`), which is
 * what makes the tool's per-resource permission resolution load-bearing rather than decorative.
 */
export function installFirstPartyToolContributors(): void {
  // `search_agent_plugin_local` — a STATIC tool (id/schema known at module load); the DYNAMIC
  // `agent_plugin_<pluginId>` tools this same domain also owns are registered separately, directly
  // onto the `ToolRegistry`, by `agent-daemon-server.ts`'s own `registerInstalledAgentPluginTools`
  // call — see `features/agent-plugins/tool-registrations.ts`'s "search_agent_plugin_local" section
  // header for why the two halves use different wiring seams.
  registerToolContributor(contributeAgentPluginSearchTools());
  // The standalone `agent_plugins_uninstall` tool that used to be contributed here (static, same seam
  // as `search_agent_plugin_local` above) was deleted (S4, 2026-09-24): its Agent Plugin branch is now
  // reached through `plugins_uninstall` (`contributePluginsTools()` below, family: "agent-plugin") —
  // one uninstall id for both plugin families instead of two near-identically-named tools. See
  // `features/agent-plugins/uninstall-tool.ts`'s header for the merge.
  registerToolContributor(contributeCommentsTools());
  // `listDuplicateResourceHandlers` is injected rather than imported by
  // `features/content-duplication/tool-registrations.ts` itself: `.dependency-cruiser.mjs`'s
  // `domain-no-direct-assistant-tool-registration` rule bans ANY non-type-only `features/** ->
  // assistant/**` import, and reading the registry from inside that feature was a real
  // `check:boundaries` error until this seam replaced it. Passed as the reader FUNCTION, not a
  // pre-read array — the per-resource handlers below are registered after this line.
  registerToolContributor(contributeContentDuplicationTools({ listResourceHandlers: listDuplicateResourceHandlers }));
  registerToolContributor(contributeContentTypesTools());
  registerToolContributor(contributeCustomCredentialsTools());
  registerToolContributor(contributeDatabaseTools());
  registerToolContributor(contributeDeploymentsTools());
  registerToolContributor(contributeEntriesTools());
  registerToolContributor(contributeExternalMcpTools());
  registerToolContributor(contributeFsFilesTools());
  registerToolContributor(contributeFormsTools());
  registerToolContributor(contributeIdentityTools());
  registerToolContributor(contributeWebhooksTools());
  registerToolContributor(contributeMediaTools());
  registerToolContributor(contributeMediaGenerationTools());
  registerToolContributor(contributeMediaImportTools());
  registerToolContributor(contributeMembersTools());
  registerToolContributor(contributeMenusTools());
  registerToolContributor(contributeNewsletterTools());
  registerToolContributor(contributePagesTools());
  registerToolContributor(contributePluginsTools());
  registerToolContributor(contributePostTools());
  // The two publishing tools (2026-09-19; narrowed from three on 2026-09-24 — see
  // `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S4):
  // 'is publishing set up' and 'set it up'. Publishing itself now happens only through the admin
  // Publish dialog — see that feature's `tool-registrations.ts` header.
  registerToolContributor(contributePublishContentTools());
  // Those tools count and publish whatever the publish-content TYPE registry holds, and the agent
  // daemon never runs `createApp()` (whose publish-content module is the other caller). Without
  // this line the daemon's registry is empty and every publish answer is "nothing to publish".
  // Idempotent: re-registering replaces by entity type.
  installFirstPartyPublishContentTypes();
  registerToolContributor(contributeRecoveryTools());
  registerToolContributor(contributeRedirectsTools());
  registerToolContributor(contributeSeoTools());
  registerToolContributor(contributeSettingsTools());
  // Site backup (2026-09-21): `site_backup_plan` (read-only) and `site_backup_push`, which holds its
  // own call open for the human's confirm before one commit lands in a private GitHub repository.
  registerToolContributor(contributeSiteBackupTools());
  registerToolContributor(contributeSiteEvidenceTools());
  registerToolContributor(contributeSiteInspectionTools());
  registerToolContributor(contributeSitesTools());
  registerToolContributor(contributeSourceControlTools());
  registerToolContributor(contributeStaticPublishTools());
  // SPEC-052 — the `supabase` agent plugin's two in-chat forms (access-token fallback, project scope).
  registerToolContributor(contributeSupabaseConnectTools());
  registerToolContributor(contributeTaxonomyTools());
  registerToolContributor(contributeThemesTools());
  // Trash: `trash_list_items` and `trash_restore_item` ONLY. There is no purge tool and there must
  // never be one — `features/trash/__tests__/tool-registrations.purge-ban.test.ts` walks every
  // registration this function installs and fails if any handler can reach `purgeSelected`.
  // (`trash_item` is not a contributor: `buildAssistantToolRegistrations` derives it afterwards from
  // the four per-domain delete tools — see `features/trash/trash-item-tool.ts`.)
  registerToolContributor(contributeTrashTools());
  registerToolContributor(contributeWidgetsTools());
  registerToolContributor(contributeWorkspaceTools());

  // `content_duplicate`'s per-resource handler registry (`assistant/duplicate-resource-registry.ts`)
  // — a SEPARATE registration from the ToolContributor calls above (see that file's own header for
  // why): each resource's "how do I copy myself" contribution, resolved into the cross-resource
  // `content_duplicate` tool `contributeContentDuplicationTools()` registered above already exposes.
  for (const contributor of [
    ...contributePostDuplicateHandlers(),
    ...contributeFormsDuplicateHandlers(),
    ...contributeMediaDuplicateHandlers(),
  ]) {
    registerDuplicateResourceHandler(contributor);
  }
}
