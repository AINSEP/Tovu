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
 * Database's, and Recovery is the one that declares it unwired (see {@link DERIVED_RISK_BY_TOOL_ID}
 * for why that collision has to resolve exactly this way). Counting it on both sides is what makes
 * a naive per-domain sum read 132 against a registry that holds 131.
 * The two demo domains below wire nothing unless `TOVU_ENABLE_DEMO_TOOLS` is set, so they are
 * outside every number here.
 * Each domain's own file records which of its entries are deliberately unwired and why; the kit's
 * `buildDomainRegistrations` fails the build on any catalog entry that is neither.
 *
 * To wire a new domain: add its `build<Domain>Registrations` and its risk slice to
 * {@link DOMAIN_SLICES} below. That is the only edit here — a new domain never adds handler code to
 * this file, which is what makes two domains developable in parallel without colliding.
 */
import {
  buildCommentsRegistrations,
  commentsDerivedRisk,
  type CommentsToolDeps,
} from "../comments/tool-registrations";
import { buildDemoA2uiRegistrations, demoA2uiDerivedRisk } from "./demo-a2ui-tool";
import { buildDemoChoicesRegistrations, demoChoicesDerivedRisk } from "./demo-choices-tool";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "./surface-exchanges";

export type { AssistantSurfaceDeps };
import {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "../features/content-types/tool-registrations";
import {
  buildDatabaseRegistrations,
  databaseDerivedRisk,
  type DatabaseToolDeps,
} from "../features/database/tool-registrations";
import {
  buildDeploymentsRegistrations,
  deploymentsDerivedRisk,
  type DeploymentsToolDeps,
} from "../features/deployments/tool-registrations";
import {
  buildStaticPublishRegistrations,
  staticPublishDerivedRisk,
  type StaticPublishToolDeps,
} from "../features/deployments/publish-agent-tools";
import {
  buildEntriesRegistrations,
  entriesDerivedRisk,
  type EntriesToolDeps,
} from "../features/entries/tool-registrations";
import {
  buildSourceControlRegistrations,
  sourceControlDerivedRisk,
  type SourceControlToolDeps,
} from "../features/source-control/tool-registrations";
import {
  buildPluginsRegistrations,
  pluginsDerivedRisk,
  type PluginsToolDeps,
} from "../features/plugin-runtime/tool-registrations";
import {
  buildPostRegistrations,
  postDerivedRisk,
  type PostToolDeps,
} from "../features/post/tool-registrations";
import {
  buildPagesRegistrations,
  pagesDerivedRisk,
  type PagesToolDeps,
} from "../features/pages/tool-registrations";
import {
  buildRecoveryRegistrations,
  recoveryDerivedRisk,
  type RecoveryToolDeps,
} from "../features/recovery/tool-registrations";
import {
  buildSettingsRegistrations,
  settingsDerivedRisk,
  type SettingsToolDeps,
} from "../features/settings/tool-registrations";
import {
  buildTaxonomyRegistrations,
  taxonomyDerivedRisk,
  type TaxonomyToolDeps,
} from "../features/taxonomy/tool-registrations";
import {
  buildThemesRegistrations,
  themesDerivedRisk,
  type ThemeToolDeps,
} from "../features/theme/tool-registrations";
import {
  buildWorkspaceRegistrations,
  workspaceDerivedRisk,
  type WorkspaceToolDeps,
} from "../features/workspace/tool-registrations";
import {
  buildFormsRegistrations,
  formsDerivedRisk,
  type FormsToolDeps,
} from "../forms/tool-registrations";
import {
  buildIdentityRegistrations,
  identityDerivedRisk,
  type IdentityToolDeps,
} from "../identity/tool-registrations";
import {
  buildIntegrationsRegistrations,
  integrationsDerivedRisk,
  type IntegrationsToolDeps,
} from "../integrations/tool-registrations";
import {
  buildMediaRegistrations,
  mediaDerivedRisk,
  type MediaToolDeps,
} from "../media/tool-registrations";
import {
  buildMembersRegistrations,
  membersDerivedRisk,
  type MembersToolDeps,
} from "../members/tool-registrations";
import {
  buildMenusRegistrations,
  menusDerivedRisk,
  type MenusToolDeps,
} from "../navigation/tool-registrations";
import {
  buildNewsletterRegistrations,
  newsletterDerivedRisk,
  type NewsletterToolDeps,
} from "../newsletter/tool-registrations";
import {
  buildRedirectsRegistrations,
  redirectsDerivedRisk,
  type RedirectsToolDeps,
} from "../redirects/tool-registrations";
import { buildSeoRegistrations, seoDerivedRisk, type SeoToolDeps } from "../seo/tool-registrations";
import {
  buildWidgetsRegistrations,
  widgetsDerivedRisk,
  type WidgetsToolDeps,
} from "../widgets/tool-registrations";
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
 */
interface DomainSlice {
  domain: string;
  build: (routeDeps: AssistantToolRegistryDeps, surfaces: AssistantSurfaceDeps) => ToolRegistration[];
  risk: DerivedRiskByToolId;
}

/**
 * Every wired domain, in the order their tools are registered.
 *
 * The order is not load-bearing for correctness — {@link buildAssistantToolRegistrations} refuses a
 * duplicate id outright rather than letting a later entry win — but it is stable, so
 * `ToolRegistry.list()` and any snapshot of it stay readable.
 */
const DOMAIN_SLICES: readonly DomainSlice[] = [
  { domain: "content-types", build: buildContentTypesRegistrations, risk: contentTypesDerivedRisk },
  { domain: "forms", build: buildFormsRegistrations, risk: formsDerivedRisk },
  { domain: "identity", build: buildIdentityRegistrations, risk: identityDerivedRisk },
  { domain: "comments", build: buildCommentsRegistrations, risk: commentsDerivedRisk },
  { domain: "members", build: buildMembersRegistrations, risk: membersDerivedRisk },
  { domain: "newsletter", build: buildNewsletterRegistrations, risk: newsletterDerivedRisk },
  { domain: "media", build: buildMediaRegistrations, risk: mediaDerivedRisk },
  { domain: "widgets", build: buildWidgetsRegistrations, risk: widgetsDerivedRisk },
  { domain: "menus", build: buildMenusRegistrations, risk: menusDerivedRisk },
  { domain: "database", build: buildDatabaseRegistrations, risk: databaseDerivedRisk },
  { domain: "recovery", build: buildRecoveryRegistrations, risk: recoveryDerivedRisk },
  // 2026-08-15 — the Deployment panel's three tabs (Static Site export, Full Site read, Dockerfile
  // read/write). See `features/deployments/agent-tools.ts`'s file header for why, unlike every
  // domain above, none of its 5 entries is excluded.
  { domain: "deployments", build: buildDeploymentsRegistrations, risk: deploymentsDerivedRisk },
  // Static publish is deliberately its OWN slice, not folded into `deployments` above — see
  // `features/deployments/publish-agent-tools.ts`'s file header. All 3 entries are wired as of
  // 2026-08-15: `deployment_preview_static_publish` and `deployment_get_static_publish_capabilities`
  // are pure reads; `deployment_execute_static_publish` is genuinely destructive (publishes to the
  // public internet with a write-scoped external credential) but is now reachable — gated behind a
  // human confirmation dialog held open through the same MCP-UI surface-exchange mechanism
  // `content_post_delete` uses (`assistant/surface-exchanges.ts`), not the
  // `actorClassRule`/`ExecutionDelegate` mechanism `backup_execute_restore`/
  // `database_execute_migrate_forward` still wait on. The only OTHER execute path remains the
  // cookie-authed admin route (`server/routes/admin/system/publish-site.ts`); this tool now gives the
  // assistant an equivalent, human-approved one.
  { domain: "static-publish", build: buildStaticPublishRegistrations, risk: staticPublishDerivedRisk },
  // 2026-08-16 — a separate identity from `static-publish` above: connects a GitHub/GitLab/Bitbucket
  // account for committing the site's OWN exported content into a connected repo (git-backed CMS
  // content), not for hosting the built site as a live URL — see `features/source-control/types.ts`'s
  // own header for why this is deliberately its own table/union, not a widened `PublishProviderId`.
  // `source_control_get_capabilities` is a pure read; `source_control_execute_commit` is genuinely
  // consequential (pushes a real commit using a write-scoped external credential) but reachable —
  // gated behind the SAME MCP-UI held-open confirmation exchange `deployment_execute_static_publish`
  // uses. GitHub-only this pass (see `features/source-control/commit-site.ts`'s header); gitlab/
  // bitbucket credentials can be saved and are honestly reported by the capabilities tool, but
  // committing to either is not implemented yet.
  { domain: "source-control", build: buildSourceControlRegistrations, risk: sourceControlDerivedRisk },
  { domain: "plugins", build: buildPluginsRegistrations, risk: pluginsDerivedRisk },
  { domain: "workspace", build: buildWorkspaceRegistrations, risk: workspaceDerivedRisk },
  { domain: "settings", build: buildSettingsRegistrations, risk: settingsDerivedRisk },
  { domain: "entries", build: buildEntriesRegistrations, risk: entriesDerivedRisk },
  // `buildPostRegistrations`' second parameter now IS the slice contract's own `surfaces` shape
  // (ADR-055 Decision 2 — `content_post_delete` holds its call open through the same exchange store
  // every other surface-raising domain uses), so this forwards directly rather than wrapping.
  { domain: "post", build: buildPostRegistrations, risk: postDerivedRisk },
  // Its own domain, not part of "post": a Page's body is bespoke HTML and a Post's is a Tiptap
  // document, and `content_post_update` cannot write the former. See `features/pages/agent-tools.ts`.
  { domain: "pages", build: buildPagesRegistrations, risk: pagesDerivedRisk },
  { domain: "taxonomy", build: buildTaxonomyRegistrations, risk: taxonomyDerivedRisk },
  { domain: "seo", build: buildSeoRegistrations, risk: seoDerivedRisk },
  { domain: "redirects", build: buildRedirectsRegistrations, risk: redirectsDerivedRisk },
  { domain: "integrations", build: buildIntegrationsRegistrations, risk: integrationsDerivedRisk },
  { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk },
  // Last, and empty unless TOVU_ENABLE_DEMO_TOOLS is set — development-only surfaces for
  // exercising a transport in a real chat pane. See each one's own module doc for why it is a tool
  // rather than a test page, and why the gate is an env var.
  { domain: "demo-choices", build: buildDemoChoicesRegistrations, risk: demoChoicesDerivedRisk },
  // A2UI's multi-turn counterpart — `demo-choices` above proves the one-shot MCP-UI return path;
  // this proves the shape A2UI exists for (`createSurface -> action -> updateComponents -> action`).
  { domain: "demo-a2ui", build: buildDemoA2uiRegistrations, risk: demoA2uiDerivedRisk },
];

/**
 * Every domain's risk classification folded into one map, refusing any id two domains both wire.
 *
 * Evaluated at module load, so a cross-domain id collision stops the daemon booting rather than
 * surfacing as a mysteriously double-registered tool at runtime. The one real collision in the
 * current catalogs — `backup_create_restore_point`, declared by both Database and Recovery — passes
 * because Recovery declares it unwired and so contributes no risk entry, which is the resolution
 * this check exists to force.
 */
const DERIVED_RISK_BY_TOOL_ID: DerivedRiskByToolId = mergeDerivedRiskMaps(DOMAIN_SLICES);

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
  assertToolIsWirable({ toolId, catalogEntry, derivedRisk: DERIVED_RISK_BY_TOOL_ID });
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
export function buildAssistantToolRegistrations(
  routeDeps: AssistantToolRegistryDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  const ownerByToolId = new Map<string, string>();

  for (const slice of DOMAIN_SLICES) {
    for (const registration of slice.build(routeDeps, surfaces)) {
      const owner = ownerByToolId.get(registration.descriptor.id);
      if (owner) {
        // Unreachable while `DERIVED_RISK_BY_TOOL_ID`'s merge holds — a tool cannot be wired
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
