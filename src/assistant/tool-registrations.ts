/**
 * @file ADR-049 Decision 4's assembly point: the single place that composes every domain's agent
 * tools into the list registered into the assistant's `ToolRegistry` (`kernel.ts`), so a run's tool
 * calls execute through `@jini-ai/daemon`'s `ToolExecutor`.
 *
 * This file used to hold every domain's wiring as well as the assembly. It no longer does, and that
 * is the point: each domain's handlers, model-facing projections, and risk classification now live
 * in a `tool-registrations.ts` beside that domain's own code, and the plumbing they share lives in
 * `tool-registration-kit.ts`. What stays here is exactly the part that is genuinely about the
 * assistant rather than any one domain — which domains are wired at all, and the two cross-domain
 * invariants that only a file seeing all of them can check.
 *
 * Wired domains and their catalogs (23 domains, 152 catalog entries, 137 wired tools — the 2026-08-05
 * count below the `deployments` line was measured by building the real registrations and
 * attributing each id to its declaring catalog, not carried forward from the previous edit; the
 * counts below had drifted in six places. `deployments` (5 of 5, all wired) and `static-publish`
 * were both added 2026-08-15 and are not part of that 2026-08-05 measurement pass. `static-publish`
 * itself changed again later the same day: all 3 of its catalog entries are now wired — see its own
 * slice comment below for why `deployment_execute_static_publish` moved from deliberately-unwired to
 * wired-but-human-gated. `source-control` (2 of 2) was added 2026-08-16, also not part of that
 * 2026-08-05 measurement pass — see its own slice comment below):
 *   content-types (6 of 8)   forms (6 of 6)      identity (15 of 15)  comments (7 of 7)
 *   members (4 of 4)         newsletter (14/14)  media (4 of 4)       widgets (12 of 12)
 *   menus (5 of 5)           database (7 of 9)   recovery (5 of 7)    plugins (2 of 2)
 *   workspace (2 of 4)       settings (4 of 8)   entries (5 of 5)     taxonomy (6 of 7)
 *   seo (6 of 6)             redirects (6 of 7)  integrations (5/5)   post (6 of 6)
 *   themes (4 of 4)          deployments (5 of 5) static-publish (3 of 3)
 *   source-control (2 of 2)
 * Recovery counts 5, not 6: `backup_create_restore_point` appears in both its catalog and
 * Database's, and Recovery is the one that declares it unwired (see {@link derivedRiskByToolId}
 * for why that collision has to resolve exactly this way). Counting it on both sides is what makes
 * a naive per-domain sum read 132 against a registry that holds 131.
 * The two demo domains below wire nothing unless `TOVU_ENABLE_DEMO_TOOLS` is set, so they are
 * outside every number here.
 * Each domain's own file records which of its entries are deliberately unwired and why; the kit's
 * `buildDomainRegistrations` fails the build on any catalog entry that is neither.
 *
 * 2026-08-17: this file no longer wires every domain by static import. `comments` and `newsletter`
 * were converted to `tool-contribution-registry.ts`'s explicit-call registry — see that file's
 * header for why (it existed to break the `[assistant, comments, features/plugins, newsletter]`
 * module cycle `check:architecture` flagged, which a static import here could not). `identity`,
 * `members`, `taxonomy`, and `redirects` (Stage 2 batch 1, same day) followed the same way. Stage 2
 * batch 2 (same day, run as two parallel worker groups) converted eleven more: group A did `widgets`
 * (deliberately FIRST, before `content-types`/`forms`/`entries`, which `widgets` itself imports —
 * removing the `assistant -> widgets` static edge before any of the three converted, avoiding the
 * round-trip shape `themes` hit below), then `content-types`, `forms`, `menus`, `recovery`, `plugins`,
 * `entries`; group B did `integrations`, `workspace`, `pages`, `seo`. None of these fifteen has a
 * sibling domain still statically wired through this file that reaches back into it, so nothing
 * routes back through any of them to close a new cycle. Their tools still count in the totals above;
 * they just arrive via {@link listToolContributors}/{@link allToolContributors} now, folded together
 * with {@link DOMAIN_SLICES} rather than being one of its entries. `media` joined them in a later,
 * separate pass the same day, after being retried once `widgets`'s own conversion (batch 2, group A)
 * had merged — see the `media` paragraph below for the full trace, and `media/tool-registrations.ts`'s
 * own header for the current state.
 *
 * Four more were TRIED (Stage 2 batch 1 or batch 2) and reverted the same session — each closes a
 * real cycle through a module that is itself still statically wired here, not a grep-visible direct
 * import: `themes` (batch 1) — `export/route-manifest.ts` imports `features/theme` via a `#src/*`
 * subpath import invisible to a relative-path grep, and `assistant` still reaches `export`
 * transitively through the still-static `deployments`/`source-control` entries below; `database`
 * (batch 2, group A) — closed a new 16-module SCC through the shared low-level `db` module and the
 * (at the time) still-static `deployments`/`source-control`/`recovery`/`settings`/`workspace`/
 * `entries`/`post`/`pages`/`plugin-runtime`/`seo`/`export`/`vendor-credentials` entries collectively;
 * `source-control` and `deployments`/`static-publish` (batch 2, group B — the latter two share one
 * module, `features/deployments`, at `check:architecture`'s per-directory graph granularity) all
 * close a cycle through `features/vendor-credentials` (this file's own static
 * `REAL_VENDOR_CREDENTIAL_PORT` wiring reaches `vendor-credentials`, which value-imports
 * `source-control/store.ts`, which value-imports `deployments/static-publish/index.ts`). See each
 * reverted domain's own `DOMAIN_SLICES` entry comment below, and its own `tool-registrations.ts`'s
 * trailing comment, for the full trace. `post` was ALSO tried (the night before Stage 2 existed) and
 * reverted — see its own `DOMAIN_SLICES` entry's comment below and
 * `features/post/tool-registrations.ts`'s trailing comment for why it is not a clean case: converting
 * it opened a NEW, larger cycle through `widgets`/`export`, both of which depend on `features/post`;
 * `widgets`' own subsequent conversion (batch 2, group A) closes half of that risk, but `export`
 * still depends on `features/post` and `assistant` still reaches `export` transitively through the
 * still-static `deployments`/`source-control` entries below, so `post` remains excluded and
 * unattempted this round regardless.
 *
 * `media` (batch 2, group B) was ALSO tried and reverted the same session as the four above, for the
 * same shape of reason: `widgets/resolver-service.ts` value-imports `CORE_PUBLIC_TRANSFORM_NAME` from
 * `media/bootstrap` and `getLatestTransformDefinition` from `media/index`, and — at the time group B
 * ran, in its own isolated worktree — `assistant` still statically depended on `widgets`, so a
 * `media -> assistant` registry edge closed a real 3-module cycle: `assistant, media, widgets`
 * (confirmed via `check:architecture --list`: largest strongly-connected component, runtime-only,
 * went 0 -> 3). Group A's separate, parallel conversion of `widgets` did not retroactively re-verify
 * `media` against the combined result, since the two batches were merged after both finished
 * independently. Re-checked in a later pass this session, after both batches had merged into this
 * branch: `widgets` is now converted too, which already removed the `assistant -> widgets` static
 * edge that closed the cycle above; `resolver-service.ts`'s value-imports into `media/bootstrap`/
 * `media/index` are unchanged, but with `assistant` no longer reaching `widgets` statically, they no
 * longer round-trip back to `assistant`. `check:architecture` confirmed 0 module cycles with `media`
 * converted this way — `media` is now wired via `contributeMediaTools()` (see
 * `media/tool-registrations.ts`'s own header) and is likewise absent from {@link DOMAIN_SLICES}
 * below.
 *
 * `database` (batch 2, group A) was ALSO retried in a later, separate pass the same day, for the
 * same shape of reason `media` was: most of the 16-module SCC's OTHER members (`entries`, `pages`,
 * `plugin-runtime`, `recovery`, `workspace`, `seo`) had themselves converted to the registry by the
 * time of the retry, shrinking the SCC to 10 — and root-causing what remained found exactly one
 * value import closing it: `db/sqlite/database-introspection-adapter.sqlite.ts`'s import of
 * `getDriftStatus` from `features/database/drift.ts`. `drift.ts` is pure, dependency-free
 * classification logic with only two real callers, both already `db`-side or type-only, so it
 * relocated into `db/` (see `db/drift.ts`'s own header) rather than the import being narrowed.
 * `check:architecture` confirmed 0 module cycles with `database` converted this way — see
 * `ADS-memory/reports/architecture/2026-08-17-database-cycle-investigation.md` for the full
 * empirical trace (stubbing just that one import collapsed the SCC from 10 to 0 before this
 * conversion landed). `database` is now wired via `contributeDatabaseTools()` (see
 * `features/database/tool-registrations.ts`'s own header) and is likewise absent from
 * {@link DOMAIN_SLICES} below.
 *
 * `post` (tried and reverted twice above, the night before Stage 2 existed) was retried a third time
 * in a final pass this same day, after `deployments`/`static-publish`/`themes` (see their own former
 * entries below) cleared the `export`/`features/vendor-credentials` cluster that blocked the second
 * attempt. That retry found a smaller, previously-undocumented 2-module cycle instead —
 * `[assistant, features/post]`, via `assistant/site/tools.ts`/`assistant/site/client-directives.ts`
 * value-importing `listPublishedPosts` directly — resolved by injecting that function into both
 * files' deps rather than statically importing it (Option A,
 * `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`), wired to
 * the real implementation at the one production composition root, `server/modules/site-assistant.ts`.
 * See its own {@link DOMAIN_SLICES} entry comment below and `features/post/tool-registrations.ts`'s
 * own header for the full trace. `post` is now wired via `contributePostTools()` and is likewise
 * absent from {@link DOMAIN_SLICES} below — the last of this rollout's 25 domains to convert.
 *
 * To wire a new domain: if it will stay a first-party, always-present domain and you are not
 * specifically migrating it to the registry, add its `build<Domain>Registrations` and its risk
 * slice to {@link DOMAIN_SLICES} below (the same edit as before) — that is still the only edit here
 * for that case. To wire it through the registry instead, give it its own `contribute<Domain>Tools()`
 * (see `comments/tool-registrations.ts` for the shape) and add that call to
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` — nothing in THIS file
 * changes for that path, which is the property the registry exists to buy.
 */
import type { CommentsToolDeps } from "../comments/tool-registrations";
import { buildDemoA2uiRegistrations, demoA2uiDerivedRisk } from "./demo-a2ui-tool";
import { buildDemoChoicesRegistrations, demoChoicesDerivedRisk } from "./demo-choices-tool";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "../core/tool-surface-exchanges";
import { listToolContributors, type ToolContributor } from "./tool-contribution-registry";

export type { AssistantSurfaceDeps };
import type { ContentTypesToolDeps } from "../features/content-types/tool-registrations";
import type { DatabaseToolDeps } from "../features/database/tool-registrations";
import type { DeploymentsToolDeps } from "../features/deployments/tool-registrations";
import type { StaticPublishToolDeps, VendorCredentialPort } from "../features/deployments/publish-agent-tools";
import type { EntriesToolDeps } from "../features/entries/tool-registrations";
// This file's own real wiring for `StaticPublishToolDeps.vendorCredentials` (`VendorCredentialPort`,
// `publish-agent-tools.ts`) — that file deliberately carries NO import of any kind from
// `features/vendor-credentials` (see its own header for why: doing so closed a real
// `features/deployments <-> features/vendor-credentials` module cycle). This IS the one place
// allowed to see both sides — the same reasoning {@link AssistantToolRegistryDeps}'s own doc gives
// for being the sole place that sees every domain's narrow type at once. `assistant ->
// features/vendor-credentials` is a new, one-directional edge: nothing `vendor-credentials` depends
// on (`features/deployments/publish-credentials/store.ts`, `features/source-control/store.ts`)
// reaches back into `assistant`, so this cannot itself become a cycle.
import {
  createVendorCredential,
  listVendorCredentials,
  PUBLISH_PROVIDER_TO_VENDOR,
  updateVendorCredential,
} from "../features/vendor-credentials/index";
import type { SourceControlToolDeps } from "../features/source-control/tool-registrations";
import type { PluginsToolDeps } from "../features/plugin-runtime/tool-registrations";
import type { PostToolDeps } from "../features/post/tool-registrations";
import type { PagesToolDeps } from "../features/pages/tool-registrations";
import type { RecoveryToolDeps } from "../features/recovery/tool-registrations";
import type { SettingsToolDeps } from "../features/settings/tool-registrations";
import type { TaxonomyToolDeps } from "../features/taxonomy/tool-registrations";
import type { ThemeToolDeps } from "../features/theme/tool-registrations";
import type { WorkspaceToolDeps } from "../features/workspace/tool-registrations";
import type { FormsToolDeps } from "../forms/tool-registrations";
import type { IdentityToolDeps } from "../identity/tool-registrations";
import type { IntegrationsToolDeps } from "../integrations/tool-registrations";
import type { MediaToolDeps } from "../media/tool-registrations";
import type { MembersToolDeps } from "../members/tool-registrations";
import type { MenusToolDeps } from "../navigation/tool-registrations";
import type { NewsletterToolDeps } from "../newsletter/tool-registrations";
import type { RedirectsToolDeps } from "../redirects/tool-registrations";
import type { SeoToolDeps } from "../seo/tool-registrations";
import type { WidgetsToolDeps } from "../widgets/tool-registrations";
import {
  assertToolIsWirable,
  mergeDerivedRiskMaps,
  type DerivedRiskByToolId,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";

/**
 * The union of every wired domain's own narrow tool-deps contract — never `server/routes/types`'s
 * `RouteDeps` (the god type this whole ADR-049 restructure exists to stop importing here). This is
 * the one place that genuinely needs all 24 at once: {@link buildAssistantToolRegistrations} fans
 * the SAME deps bag out to every domain's builder, so its parameter (and {@link DomainSlice.build}'s
 * field type below) must satisfy every domain's own declared shape simultaneously. Each domain still
 * only ever imports its own slice — this union is assembled here, in the one file whose whole job is
 * seeing every domain at once, not re-exported for any domain to depend on.
 *
 * `server/routes/*` composition roots satisfy this structurally by constructing an object with every
 * field every domain declares — today via `RouteDeps` plus each admin section's own additive
 * `*RouteDeps` extension (`MembersRouteDeps`, `NewsletterRouteDeps`, `UsersRouteDeps`, ...). A
 * composition root that returns a narrower type (for example `NewsletterRouteDeps` alone) will fail
 * this assignment at compile time for any field only a DIFFERENT extension declares — a real,
 * pre-existing gap this narrowing surfaces rather than introduces; see this dispatch's handoff notes.
 */
export type AssistantToolRegistryDeps = CommentsToolDeps &
  ContentTypesToolDeps &
  DatabaseToolDeps &
  DeploymentsToolDeps &
  StaticPublishToolDeps &
  SourceControlToolDeps &
  EntriesToolDeps &
  PluginsToolDeps &
  PostToolDeps &
  PagesToolDeps &
  RecoveryToolDeps &
  SettingsToolDeps &
  TaxonomyToolDeps &
  ThemeToolDeps &
  WorkspaceToolDeps &
  FormsToolDeps &
  IdentityToolDeps &
  IntegrationsToolDeps &
  MediaToolDeps &
  MembersToolDeps &
  MenusToolDeps &
  NewsletterToolDeps &
  RedirectsToolDeps &
  SeoToolDeps &
  WidgetsToolDeps;

/**
 * One wired domain: its builder and the risk classification its own wiring file maintains.
 *
 * `build`'s second parameter is optional to implement, not optional to pass — every domain builder
 * that ignores surfaces simply declares one parameter, which is assignable.
 *
 * Structurally identical to `tool-contribution-registry.ts`'s `ToolContributor` — kept as a
 * separate local alias rather than merged into one exported type, since this array is the LEGACY
 * seam (domains not yet converted to the registry) and `ToolContributor` is the seam replacing it;
 * collapsing them would blur which one a reader is looking at mid-migration.
 */
type DomainSlice = ToolContributor;

/**
 * The not-yet-converted domains, in the order their tools are registered — imported by name here
 * exactly as every domain used to be, before `tool-contribution-registry.ts` existed.
 *
 * `comments` and `newsletter` were the first two converted (2026-08-17, the registry's
 * introduction) and are deliberately ABSENT from this array now — they instead call
 * `contribute<Domain>Tools()` (see each one's own `tool-registrations.ts`), installed by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` into
 * `listToolContributors()`, which {@link buildAssistantToolRegistrations} folds in below. They were
 * chosen first because they were the actual drivers of the `[assistant, comments,
 * features/plugins, newsletter]` strongly-connected component `check:architecture` flagged, and
 * neither imports anything else nor is imported by anything else outside `assistant`, which is what
 * made converting them safe with no other edges to trace. `post` was ALSO tried (to prove the
 * pattern covers a domain whose `build` genuinely uses the `surfaces` parameter) and reverted the
 * same night — it stayed in this array below, see its own entry's comment for why: unlike
 * comments/newsletter, other modules (`widgets`, `export`) depend on `post`, so converting it opened
 * a new cycle instead of closing one. The remaining domains below migrate the same way in a later
 * pass, each needing the same "does anything else depend on me" check post's case revealed;
 * nothing about their presence here is permanent.
 *
 * The order is not load-bearing for correctness — {@link buildAssistantToolRegistrations} refuses a
 * duplicate id outright rather than letting a later entry win — but it is stable, so
 * `ToolRegistry.list()` and any snapshot of it stay readable.
 */
const DOMAIN_SLICES: readonly DomainSlice[] = [
  // `identity`, `members` converted to the tool-contribution registry 2026-08-17 (Stage 2) — see
  // `identity/tool-registrations.ts`'s/`members/tool-registrations.ts`'s own headers. No longer
  // entries here; they arrive via `contributeIdentityTools()`/`contributeMembersTools()`, installed
  // by `server/tool-catalog-manifest.ts`.
  // `media` converted to the tool-contribution registry 2026-08-17 — tried once in Stage 2 batch 2
  // and reverted (a real 3-module cycle through `widgets`, back when `assistant` still statically
  // depended on it), then retried this session after `widgets`'s own conversion (immediately below)
  // had merged and removed that static edge. See `media/tool-registrations.ts`'s own header for the
  // full before/after trace. No longer an entry here; it arrives via `contributeMediaTools()`,
  // installed by `server/tool-catalog-manifest.ts`.
  // `widgets` converted to the tool-contribution registry 2026-08-17 (Stage 2 batch 2) — see
  // `widgets/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeWidgetsTools()`, installed by `server/tool-catalog-manifest.ts`. Converted first in
  // this batch, ahead of `content-types`/`forms` (which `widgets` itself imports), specifically to
  // remove the `assistant -> widgets` static edge before either of those two convert.
  // `content-types`, `forms`, and `menus` converted next (Stage 2 batch 2) — see
  // `features/content-types/tool-registrations.ts`'s/`forms/tool-registrations.ts`'s/
  // `navigation/tool-registrations.ts`'s own headers. No longer entries here; they arrive via
  // `contributeContentTypesTools()`/`contributeFormsTools()`/`contributeMenusTools()`, installed by
  // `server/tool-catalog-manifest.ts`.
  // `database` converted to the tool-contribution registry 2026-08-17 — tried once in Stage 2 batch 2
  // and reverted (adding `database -> assistant` closed a 16-module SCC running through the shared
  // low-level `db` module and the still-static `deployments`/`source-control`/`recovery`/`settings`/
  // `workspace`/`entries`/`post`/`pages`/`plugin-runtime`/`seo`/`export`/`vendor-credentials`
  // `DOMAIN_SLICES` entries collectively), then retried in a later, separate pass the same day after
  // most of that SCC's members had themselves converted and the one remaining edge back into
  // `features/database` (`db/sqlite/database-introspection-adapter.sqlite.ts`'s value import of
  // `getDriftStatus`) was cut by relocating `drift.ts` into `db/`. See
  // `features/database/tool-registrations.ts`'s own header and
  // `ADS-memory/reports/architecture/2026-08-17-database-cycle-investigation.md` for the full
  // before/after trace. No longer an entry here; it arrives via `contributeDatabaseTools()`,
  // installed by `server/tool-catalog-manifest.ts`.
  // `recovery` converted next (same batch) — see `features/recovery/tool-registrations.ts`'s own
  // header. No longer an entry here; it arrives via `contributeRecoveryTools()`, installed by
  // `server/tool-catalog-manifest.ts`. Safe despite sharing `database`'s `db/sqlite` importer:
  // Recovery's own imports of `features/database` are both `import type`, erased from the
  // runtime-only cycle graph, so `recovery -> assistant` does not carry `database`'s round-trip risk.
  // `deployments` converted to the tool-contribution registry 2026-08-17 (2026-08-15 originally wired
  // the Deployment panel's three tabs — Static Site export, Full Site read, Dockerfile read/write —
  // see `features/deployments/agent-tools.ts`'s file header for why, unlike every domain above, none
  // of its 5 entries is excluded).
  //
  // Tried for the tool-contribution registry in Stage 2 batch 2 and reverted the same session: this
  // module (`features/deployments`, per-directory graph granularity) already sat downstream of a
  // chain `assistant` reached unconditionally — `assistant -> features/vendor-credentials -> features/
  // source-control -> features/deployments` (the last hop via `source-control/store.ts`'s value
  // import of `extractGitHubLogin` from this directory's `static-publish/index.ts`) — so adding a
  // `deployments -> assistant` registry edge closed a real 4-module cycle: `assistant,
  // features/deployments, features/source-control, features/vendor-credentials`. Retried later the
  // same session and blocked again on a second, previously-undocumented edge
  // (`vendor-credentials/store.ts`'s own `extractGitHubLogin` import). See
  // `features/deployments/tool-registrations.ts`'s own header for the full trace of both attempts.
  //
  // Retried and landed once `vendor-credentials/store.ts`'s `extractGitHubLogin` import was ALSO
  // injected instead of value-imported (same Option-B-style technique already used for
  // `dual-read.ts`) — that removed the last edge closing the cycle. No longer an entry here; it
  // arrives via `contributeDeploymentsTools()`, installed by `server/tool-catalog-manifest.ts`. Was
  // blocking `static-publish` below for the identical reason (same module) — see that entry's own
  // comment for its own retry status.
  // `static-publish` converted to the tool-contribution registry 2026-08-17 — deliberately its OWN
  // domain, not folded into `deployments` above — see `features/deployments/publish-agent-tools.ts`'s
  // file header. All 3 entries are wired as of 2026-08-15: `deployment_preview_static_publish` and
  // `deployment_get_static_publish_capabilities` are pure reads; `deployment_execute_static_publish`
  // is genuinely destructive (publishes to the public internet with a write-scoped external
  // credential) but is now reachable — gated behind a human confirmation dialog held open through the
  // same MCP-UI surface-exchange mechanism `content_post_delete` uses
  // (`assistant/surface-exchanges.ts`), not the `actorClassRule`/`ExecutionDelegate` mechanism
  // `backup_execute_restore`/`database_execute_migrate_forward` still wait on. The only OTHER execute
  // path remains the cookie-authed admin route (`server/routes/admin/system/publish-site.ts`); this
  // tool now gives the assistant an equivalent, human-approved one.
  //
  // Tried for the tool-contribution registry in Stage 2 batch 2 and reverted the same session — same
  // 4-module cycle as `deployments` above (`assistant, features/deployments, features/source-control,
  // features/vendor-credentials`), since both live in the `features/deployments` module. Retried and
  // blocked again on the same second edge (`vendor-credentials/store.ts`'s own `extractGitHubLogin`
  // import) `deployments` above hit. Retried and landed together with `deployments` once that edge
  // was ALSO injected instead of value-imported — the two convert in lockstep, not independently:
  // `check:architecture`'s per-directory module graph means either one alone, with the other still
  // value-imported from `assistant`, still closes a live 2-module `[assistant, features/deployments]`
  // cycle. See `features/deployments/publish-agent-tools.ts`'s own header for the full trace. No
  // longer an entry here; it arrives via `contributeStaticPublishTools()`, installed by
  // `server/tool-catalog-manifest.ts`.
  // `source-control` converted to the tool-contribution registry 2026-08-17 — 2026-08-16, a separate
  // identity from `static-publish` above: connects a GitHub/GitLab/Bitbucket account for committing
  // the site's OWN exported content into a connected repo (git-backed CMS content), not for hosting
  // the built site as a live URL — see `features/source-control/types.ts`'s own header for why this
  // is deliberately its own table/union, not a widened `PublishProviderId`.
  // `source_control_get_capabilities` is a pure read; `source_control_execute_commit` is genuinely
  // consequential (pushes a real commit using a write-scoped external credential) but reachable —
  // gated behind the SAME MCP-UI held-open confirmation exchange `deployment_execute_static_publish`
  // uses. GitHub-only this pass (see `features/source-control/commit-site.ts`'s header); gitlab/
  // bitbucket credentials can be saved and are honestly reported by the capabilities tool, but
  // committing to either is not implemented yet.
  //
  // Tried for the tool-contribution registry in Stage 2 batch 2 and reverted the same session: a
  // plain importer grep of `features/source-control` found nothing risky, but `assistant` already
  // reached INTO this domain transitively via `features/vendor-credentials/dual-read.ts`'s value
  // import of `resolveDefaultForSourceControl` from `../source-control/store` (this file's own
  // `vendorCredentials` wiring below already value-imports from `vendor-credentials/index`). Adding
  // a `source-control -> assistant` registry edge closed a real 3-module cycle: `assistant,
  // features/source-control, features/vendor-credentials`.
  //
  // Retried and landed once `dual-read.ts`'s two legacy-table imports were injected as deps instead
  // of value-imported (Option B, `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`)
  // — that removed the `features/vendor-credentials -> features/source-control` edge that closed the
  // cycle. See `features/source-control/tool-registrations.ts`'s own header for the full trace. No
  // longer an entry here; it arrives via `contributeSourceControlTools()`, installed by
  // `server/tool-catalog-manifest.ts`.
  // `plugins` converted to the tool-contribution registry 2026-08-17 (Stage 2 batch 2) — see
  // `features/plugin-runtime/tool-registrations.ts`'s own header. No longer an entry here; it
  // arrives via `contributePluginsTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `workspace` converted to the tool-contribution registry (Stage 2 batch 2) — see
  // `features/workspace/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeWorkspaceTools()`, installed by `server/tool-catalog-manifest.ts`.
  //
  // `settings` REMOVED from this array (2026-08-17), but NOT via the standard
  // `contribute<Domain>Tools()` shape every other removed entry above uses — see
  // `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md` for the full
  // analysis. `assistant/public-assistant-settings.ts`, `assistant/custom-instructions.ts`, and
  // `assistant/execution-mode-settings.ts` already value-import `features/settings` directly (as a
  // generic settings-ledger engine, unrelated to this array), a real pre-existing
  // `assistant -> features/settings` edge. Giving `features/settings` its own
  // `contributeSettingsTools()` (the standard shape) would add a `features/settings -> assistant`
  // edge on top of that and close a NEW 2-node `assistant <-> features/settings` cycle — unlike every
  // other converted domain above, `settings`'s reverse edge is real and unavoidable, not something
  // ordering can dodge. Instead, `server/tool-catalog-manifest.ts`'s
  // `installFirstPartyToolContributors()` calls `registerToolContributor({domain: "settings", ...})`
  // directly — see the DELIBERATE ONE-OFF EXCEPTION comment on that function for why this is safe
  // and deliberate. DO NOT "restore consistency" by giving `settings` a `contributeSettingsTools()`
  // matching the others — that reintroduces the cycle this exception exists to avoid. No longer an
  // entry here; it arrives via `listToolContributors()` like every other registry-converted domain,
  // just installed from a different call site.
  // `entries` converted to the tool-contribution registry 2026-08-17 (Stage 2 batch 2) — see
  // `features/entries/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeEntriesTools()`, installed by `server/tool-catalog-manifest.ts`. Converted LAST in
  // this batch: `widgets` (batch's own first conversion) imports `features/entries` internally, so
  // this needed `widgets` off the static array first, same reasoning as `content-types`/`forms`.
  //
  // `post` converted to the tool-contribution registry 2026-08-17 — the last of this rollout's 25
  // domains. Tried and reverted three times before landing; see `features/post/tool-registrations.ts`'s
  // own trailing comment for the full trace. Short version: attempts 1-2 (both same night) closed
  // cycles through `widgets`/`export` and then through the `export`/`features/deployments`/
  // `features/vendor-credentials` cluster, in each case via modules that were themselves still
  // statically wired here at the time. This session's later pass converted `deployments`/
  // `static-publish`/`themes` (see their own former entries above) specifically to clear that
  // cluster, and it did — but a 3rd attempt found a NEW, unrelated 2-module cycle: `[assistant,
  // features/post]`, via `assistant/site/tools.ts` and `assistant/site/client-directives.ts` (the
  // Site Assistant's own public/visitor-facing runtime) both value-importing `listPublishedPosts`
  // from `features/post` directly — `post` was the one domain in this rollout where `assistant`
  // itself (not just this file) already reached into the target domain by value. Landed by injecting
  // `listPublishedPosts` into both files' deps instead of statically importing it (Option A,
  // `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`), wired to
  // the real function at the one production composition root (`server/modules/site-assistant.ts`) —
  // the same Option-B-style technique `vendor-credentials/store.ts`'s `extractGitHubLogin` and
  // `dual-read.ts`'s legacy-table imports already used elsewhere in this rollout.
  // `buildPostRegistrations`' second parameter IS the slice contract's own `surfaces` shape (ADR-055
  // Decision 2 — `content_post_delete` holds its call open through the same exchange store every
  // other surface-raising domain uses), so `contributePostTools()` forwards it directly rather than
  // wrapping. `check:architecture` confirms 0 module cycles / largest SCC 0 with `post` wired this
  // way. No longer an entry here; it arrives via `contributePostTools()`, installed by
  // `server/tool-catalog-manifest.ts`.
  // Its own domain, not part of "post": a Page's body is bespoke HTML and a Post's is a Tiptap
  // document, and `content_post_update` cannot write the former. See `features/pages/agent-tools.ts`.
  //
  // `pages` converted to the tool-contribution registry (Stage 2 batch 2) — see
  // `features/pages/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributePagesTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `taxonomy` converted to the tool-contribution registry 2026-08-17 (Stage 2) — see
  // `features/taxonomy/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeTaxonomyTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `seo` converted to the tool-contribution registry (Stage 2 batch 2) — see
  // `seo/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeSeoTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `redirects` converted to the tool-contribution registry 2026-08-17 (Stage 2) — see
  // `redirects/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeRedirectsTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `integrations` converted to the tool-contribution registry (Stage 2 batch 2) — see
  // `integrations/tool-registrations.ts`'s own header. No longer an entry here; it arrives via
  // `contributeIntegrationsTools()`, installed by `server/tool-catalog-manifest.ts`.
  // `themes` was ALSO tried in the same Stage 2 batch and reverted — see
  // `features/theme/tool-registrations.ts`'s own header for the full trace: `export/route-manifest.ts`
  // imports `features/theme` via a `#src/*` subpath import (invisible to a relative-path importer
  // grep), and `assistant` reached `export` transitively through the then-still-static
  // `deployments`/`source-control` entries, so a `themes -> assistant` registry edge closed a NEW
  // 6-module cycle: `assistant, export, features/deployments, features/source-control,
  // features/theme, features/vendor-credentials`. Retried later the same session once
  // `source-control` converted — SCC shrank to 5 modules but did not clear (`deployments` still
  // static). Retried and landed once `deployments`/`static-publish` ALSO converted (see their own
  // entries above): `check:architecture` confirms 0 module cycles / largest SCC 0 with Themes wired
  // this way. No longer an entry here; it arrives via `contributeThemesTools()`, installed by
  // `server/tool-catalog-manifest.ts`.
  // Last, and empty unless TOVU_ENABLE_DEMO_TOOLS is set — development-only surfaces for
  // exercising a transport in a real chat pane. See each one's own module doc for why it is a tool
  // rather than a test page, and why the gate is an env var.
  { domain: "demo-choices", build: buildDemoChoicesRegistrations, risk: demoChoicesDerivedRisk },
  // A2UI's multi-turn counterpart — `demo-choices` above proves the one-shot MCP-UI return path;
  // this proves the shape A2UI exists for (`createSurface -> action -> updateComponents -> action`).
  { domain: "demo-a2ui", build: buildDemoA2uiRegistrations, risk: demoA2uiDerivedRisk },
];

/**
 * Every wired domain, static and registry-contributed together, in the order their tools are
 * registered — `DOMAIN_SLICES` first, then whatever `installFirstPartyToolContributors()` (or a
 * test) has registered into {@link listToolContributors}.
 *
 * Computed fresh on every call rather than once at module load: unlike `DOMAIN_SLICES`, contributed
 * entries are populated at COMPOSITION-ROOT-BOOT time, not at module-import time (that is the whole
 * point of the registry — see `tool-contribution-registry.ts`'s header), so a value captured at
 * module load could observe zero contributors if evaluated before the composition root's install
 * call runs. This function is cheap (one array concat) and is not on any hot request path.
 */
function allToolContributors(): readonly DomainSlice[] {
  return [...DOMAIN_SLICES, ...listToolContributors()];
}

/**
 * Every domain's risk classification folded into one map, refusing any id two domains both wire.
 *
 * Computed fresh per call (see {@link allToolContributors}) rather than once at module load — a
 * cross-domain id collision still stops the FIRST real use (the composition root's own
 * `buildAssistantToolRegistrations` call, immediately after its `installFirstPartyToolContributors()`
 * call) rather than surfacing as a mysteriously double-registered tool deep in a request handler;
 * it is simply no longer module-load time specifically, since contributed domains do not exist yet
 * at module-load time. The one real collision in the current catalogs —
 * `backup_create_restore_point`, declared by both Database and Recovery — passes because Recovery
 * declares it unwired and so contributes no risk entry, which is the resolution this check exists
 * to force.
 */
function derivedRiskByToolId(): DerivedRiskByToolId {
  return mergeDerivedRiskMaps(allToolContributors());
}

/**
 * The assistant-wide view of the kit's `assertToolIsWirable`: same gate, consulting every domain's
 * classification at once instead of one domain's.
 *
 * Exported because the contract tests assert this layer's refusals directly — that a catalog entry
 * cannot downgrade its own declared risk, that an unclassified id is refused rather than assumed
 * safe, and that no tool demanding a human-confirmation transport can be wired while none exists.
 * Those are properties of the whole tool surface, so the test needs the whole-surface map.
 *
 * @param toolId - The tool id to check.
 * @param catalogEntry - Its `agent-tools.ts` entry, the declared side of the comparison.
 * @throws {Error} If the tool is unclassified, misclassified, or needs missing confirmation support.
 * @complexity O(1).
 * @overallScore 100
 */
export function assertRiskMetadataIsWirable(toolId: string, catalogEntry: WirableToolDefinition): void {
  assertToolIsWirable({ toolId, catalogEntry, derivedRisk: derivedRiskByToolId() });
}

/**
 * Builds the complete agent-tool surface for one workspace's route-deps bag.
 *
 * @param routeDeps - The same dependency bag the admin HTTP routes are built from (structurally —
 * see {@link AssistantToolRegistryDeps}), so a tool call and the equivalent human click reach
 * identical domain code.
 * @param surfaces - Assistant-transport machinery for surface-raising tools. Defaults to a fresh,
 * unshared store, which is right for the many tests that build the registration list only to inspect
 * descriptors and never execute a handler. A caller that also mounts
 * `registerMcpUiToolCallsRoute` must pass its own instance — see {@link AssistantSurfaceDeps}.
 * `content_post_delete` (ADR-055 Decision 2) is now a shipped, non-env-gated tool that parks, so the
 * "every parking tool is demo-only" reasoning this default used to lean on no longer holds in
 * general. It stays a default rather than a required argument only because the one real production
 * caller (`agent-daemon-server.ts`) already passes its own instance explicitly, mirrored into
 * `registerMcpUiToolCallsRoute`; any test that actually EXECUTES a surface-raising handler — not
 * merely inspects its descriptor — must do the same, or its exchange is unreachable.
 * @returns Every wired domain's registrations, concatenated in {@link DOMAIN_SLICES} order.
 * @throws {Error} If two domains register the same tool id, or if any domain's own build-time gates
 * refuse (unclassified risk, missing `inputSchema`, catalog drift, an entry neither wired nor
 * declared unwired).
 * @complexity O(t) in the total wired-tool count.
 * @overallScore 100
 */
/**
 * The real `VendorCredentialPort` implementation — `publish-agent-tools.ts`'s own narrow port,
 * satisfied structurally by `vendor-credentials/store.ts`'s actual exports without either file
 * naming the other's type. Declared once, module-scope (not per-call), since these are stateless
 * functions and a plain `Record<PublishProviderId, VendorId>` — nothing here needs to be rebuilt per
 * request. See the import block above for why this is the one file allowed to construct it.
 */
const REAL_VENDOR_CREDENTIAL_PORT: VendorCredentialPort = {
  list: listVendorCredentials,
  create: createVendorCredential,
  update: updateVendorCredential,
  providerToVendor: PUBLISH_PROVIDER_TO_VENDOR,
};

export function buildAssistantToolRegistrations(
  routeDeps: AssistantToolRegistryDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  const ownerByToolId = new Map<string, string>();

  // Enriches (never mutates) the caller's own `routeDeps` with the one field `static-publish`'s
  // `StaticPublishToolDeps.vendorCredentials` needs and cannot import for itself (see the import
  // block above). `routeDeps.vendorCredentials ??` preserves a test's own injected fake — same
  // "caller's own override wins, real default otherwise" shape `buildStaticPublishRegistrations`'
  // own `credentialSource`/`historyStore` already use one layer down.
  const enrichedRouteDeps: AssistantToolRegistryDeps = {
    ...routeDeps,
    vendorCredentials: routeDeps.vendorCredentials ?? REAL_VENDOR_CREDENTIAL_PORT,
  };

  for (const slice of allToolContributors()) {
    for (const registration of slice.build(enrichedRouteDeps, surfaces)) {
      const owner = ownerByToolId.get(registration.descriptor.id);
      if (owner) {
        // Unreachable while `derivedRiskByToolId()`'s merge holds — a tool cannot be wired
        // without a risk entry, and the merge already refuses a shared id. Kept because that
        // argument is about today's code: this is the check on the actual registration list, and
        // it is what `ToolRegistry` would otherwise silently accept a second binding for.
        throw new Error(
          `tool-registrations.ts: '${registration.descriptor.id}' is registered by both the ${owner} and ${slice.domain} domains — one tool id must resolve to exactly one handler`,
        );
      }
      ownerByToolId.set(registration.descriptor.id, slice.domain);
      registrations.push(registration);
    }
  }

  return registrations;
}
