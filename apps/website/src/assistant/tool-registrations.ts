import { applyToolApprovalPolicy } from "./tool-approval-policy.js";
import { toolApprovalPolicyFor } from "../contracts/headless/assistant-tool-approval-policy.js";
import { getEffective as getEffectiveSetting, LANGUAGE_NAMESPACE } from "@jini-ai/core/settings";
import type { Deps as SitesListToolDeps } from "../features/sites/list-tool.js";
/**
 * @file ADR-049 Decision 4's assembly point: the single place that composes every domain's agent
 * tools into the list registered into the assistant's `ToolRegistry` (`kernel.ts`), so a run's tool
 * calls execute through `@jini-ai/daemon`'s `ToolExecutor`.
 *
 * Each domain owns its handlers, model-facing projections, and risk classification in its own
 * `tool-registrations.ts`. This assembly checks cross-domain tool-id and risk invariants.
 *
 * First-party domain contributors are installed explicitly by
 * `server/runtime/composition/tool-catalog-manifest.ts`; see `tool-contribution-registry.ts`
 * for the dependency direction that prevents runtime module cycles.
 * To wire a domain through that registry, give it a `contribute<Domain>Tools()` function and
 * add the call to `installFirstPartyToolContributors()`. Assistant-owned tools use
 * {@link DOMAIN_SLICES}. Each catalog entry must be wired or explicitly declared unwired;
 * `buildDomainRegistrations` refuses gaps.
 */
import type { CommentsToolDeps } from "../features/comments/tool-registrations.js";
import { buildAdminScreenLinkRegistrations, adminScreenLinkDerivedRisk } from "./admin-screen-link-tool.js";
import { buildAskChoiceRegistrations, askChoiceDerivedRisk } from "./ask-choice-tool.js";
import { buildComponentCatalogRegistrations, componentCatalogDerivedRisk } from "./component-catalog-tool.js";
import {
  buildExternalMcpReauthRegistrations,
  externalMcpReauthDerivedRisk,
  type ExternalMcpReauthToolDeps,
} from "./external-mcp-reauth-tool.js";
import { buildDemoA2uiRegistrations, demoA2uiDerivedRisk } from "./demo-a2ui-tool.js";
import { buildDemoChoicesRegistrations, demoChoicesDerivedRisk } from "./demo-choices-tool.js";
import { buildDemoImageRegistrations, demoImageDerivedRisk } from "./demo-image-tool.js";
import { buildRenderUiRegistrations, renderUiDerivedRisk } from "./render-ui-tool.js";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { PermanentDeleteHostDeps } from "../features/permanent-delete/tool-registrations.js";
import { deriveContentReadRegistrations } from "./content-read-tool.js";
import type { AssistantToolContributions, ToolContributor } from "./tool-contribution-registry.js";

export type { AssistantSurfaceDeps };
import type { ContentTypesToolDeps } from "../features/content-types/tool-registrations.js";
import type { CustomCredentialsToolDeps } from "../features/custom-credentials/tool-registrations.js";
import type { DatabaseToolDeps } from "../features/database/tool-registrations.js";
import type { DeployOpsToolDeps } from "../features/deployments/deploy-ops/tool-registrations.js";
import type { DeploymentsToolDeps } from "../features/deployments/tool-registrations.js";
import type { StaticPublishToolDeps } from "../features/deployments/publish-agent-tools.js";
import type { EntriesToolDeps } from "../features/entries/tool-registrations.js";
import type { ExternalMcpToolDeps } from "../features/external-mcp/deps.js";
import type { SourceControlToolDeps } from "../features/source-control/tool-registrations.js";
import type { SiteBackupToolDeps } from "../features/site-backup/tool-registrations.js";
import type { PluginsToolDeps } from "../features/plugin-runtime/tool-registrations.js";
import type { AgentPluginSearchToolDeps } from "../features/agent-plugins/tool-registrations.js";
import type { PostToolDeps } from "../features/post/tool-registrations.js";
import type { PublishContentToolDeps } from "../features/publish-content/tool-registrations.js";
import type { PagesToolDeps } from "../features/pages/tool-registrations.js";
import type { RecoveryToolDeps } from "../features/recovery/tool-registrations.js";
import type { SettingsToolDeps } from "../features/settings/tool-registrations.js";
import type { SiteInspectionToolDeps } from "../features/site-inspection/index.js";
import type { SitesToolDeps } from "../features/sites/index.js";
// This file's own real wiring for `SitesToolDeps.isSiteSwitcherEnabled` — that field is deliberately
// NOT defaulted inside `features/sites/deps.ts`; this file fills it into `enrichedRouteDeps` (a
// caller's own override wins). The flag lives in
// `platform/site-dir` so the assistant never imports the server composition root.
import { isSiteSwitcherEnabled as REAL_IS_SITE_SWITCHER_ENABLED } from "../platform/site-dir/index.js";
// Same pattern for `SitesToolDeps.devRestart` (OD-S1): the `npm run dev` restart channel,
// `null` outside `dev.mjs`. Read from the env here so `features/sites` never reads `process.env` itself.
import { devRestartPortFromEnv } from "../platform/dev-supervisor/index.js";
import type { TaxonomyToolDeps } from "../features/taxonomy/tool-registrations.js";
import type { ThemeToolDeps } from "../features/theme/tool-registrations.js";
import type { SetActiveThemeToolDeps } from "../features/theme/set-active-theme-tool.js";
import type { ChangeSetToolDeps } from "../features/change-sets/tool-registrations.js";
import type { WorkspaceToolDeps } from "../features/workspace/tool-registrations.js";
import type { FormsToolDeps } from "../features/forms/tool-registrations.js";
import type { IdentityToolDeps } from "../features/identity/tool-registrations.js";
import type { IntegrationsToolDeps } from "../features/webhooks/tool-registrations.js";
import type { MediaToolDeps, MediaTrashToolDeps } from "../features/media/tool-registrations.js";
import type { TrashToolDeps } from "../features/trash/tool-registrations.js";
import type { TrashItemToolDeps } from "../features/trash/index.js";
import type { MediaGenerationToolDeps } from "../features/media-generation/tool-registrations.js";
import type { MediaImportToolDeps } from "../features/media-import/tool-registrations.js";
import type { MembersToolDeps } from "../features/members/tool-registrations.js";
import type { MenusToolDeps } from "../features/navigation/tool-registrations.js";
import type { NewsletterToolDeps } from "../features/newsletter/tool-registrations.js";
import type { NewsletterDeliveryToolDeps } from "../features/newsletter/delivery/tool-registrations.js";
import type { RedirectsToolDeps } from "../features/redirects/tool-registrations.js";
import type { SeoToolDeps } from "../features/seo/tool-registrations.js";
import type { SiteEvidenceToolDeps } from "../features/site-evidence/tool-registrations.js";
import type { WidgetsToolDeps } from "../features/widgets/tool-registrations.js";
import { assertToolIsWirable, mergeDerivedRiskMaps, type DerivedRiskByToolId, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * The union of every wired domain's own narrow tool-deps contract — never `server/routes/types`'s
 * `RouteDeps` (ADR-049 forbids that dependency here). This is
 * the one place that needs every domain at once: {@link buildAssistantToolRegistrations} fans
 * the SAME deps bag out to every domain's builder, so its parameter (and {@link DomainSlice.build}'s
 * field type below) must satisfy every domain's own declared shape simultaneously. Each domain still
 * only ever imports its own slice — this union is assembled here, in the one file whose whole job is
 * seeing every domain at once, not re-exported for any domain to depend on.
 *
 * `server/routes/*` composition roots satisfy this structurally by constructing an object with every
 * field every domain declares — today via `RouteDeps` plus each admin section's own additive
 * `*RouteDeps` extension (`MembersRouteDeps`, `NewsletterRouteDeps`, `UsersRouteDeps`, ...). A
 * composition root that returns a narrower type (for example `NewsletterRouteDeps` alone) will fail
 * this assignment at compile time for any field only a DIFFERENT extension declares.
 */
export type AssistantToolRegistryDeps = import("../features/analytics/tool-registrations.js").AnalyticsToolDeps &
  import("../features/post/tool-registrations.js").ContentStatsToolDeps &
  import("../features/mail-status/tool-registrations.js").MailStatusToolDeps &
  DeployOpsToolDeps & CommentsToolDeps &
  PermanentDeleteHostDeps &
  ContentTypesToolDeps &
  CustomCredentialsToolDeps &
  DatabaseToolDeps &
  DeploymentsToolDeps &
  StaticPublishToolDeps &
  SourceControlToolDeps &
  EntriesToolDeps &
  PluginsToolDeps &
  AgentPluginSearchToolDeps &
  PostToolDeps &
  PublishContentToolDeps &
  PagesToolDeps &
  RecoveryToolDeps &
  SettingsToolDeps &
  SiteBackupToolDeps &
  SiteInspectionToolDeps &
  SitesToolDeps &
  SitesListToolDeps &
  TaxonomyToolDeps &
  ThemeToolDeps &
  SetActiveThemeToolDeps &
  import("../features/theme/trash-theme-tool.js").TrashThemeToolDeps &
  ChangeSetToolDeps &
  WorkspaceToolDeps &
  FormsToolDeps &
  IdentityToolDeps &
  IntegrationsToolDeps &
  MediaToolDeps &
  MediaTrashToolDeps &
  MediaGenerationToolDeps &
  MediaImportToolDeps &
  MembersToolDeps &
  MenusToolDeps &
  NewsletterToolDeps &
  NewsletterDeliveryToolDeps &
  RedirectsToolDeps &
  SeoToolDeps &
  SiteEvidenceToolDeps &
  WidgetsToolDeps &
  ExternalMcpReauthToolDeps &
  ExternalMcpToolDeps &
  TrashToolDeps &
  TrashItemToolDeps &
  import("../features/identity/delete-user-service.js").TrashUserToolDeps;

/**
 * One wired domain: its builder and the risk classification its own wiring file maintains.
 *
 * `build`'s second parameter is optional to implement, not optional to pass — every domain builder
 * that ignores surfaces simply declares one parameter, which is assignable.
 *
 * Local name for the assistant-owned static contributions; the contract is {@link ToolContributor}.
 */
type DomainSlice = ToolContributor;

/**
 * Assistant-owned tools, in stable registration order. Feature-owned tools arrive through the
 * composition-owned registry; see `tool-contribution-registry.ts`.
 *
 * Ordering is not required for correctness: {@link buildAssistantToolRegistrations} refuses
 * duplicate ids rather than letting a later entry win. Stable order keeps catalog snapshots readable.
 */
const DOMAIN_SLICES: readonly DomainSlice[] = [
  // The four in-chat UI surfaces register unconditionally. Each module explains why its
  // transport demonstration belongs in a real chat pane.
  { domain: "demo-choices", build: buildDemoChoicesRegistrations, risk: demoChoicesDerivedRisk },
  // A2UI's multi-turn counterpart — `demo-choices` above proves the one-shot MCP-UI return path;
  // this proves the shape A2UI exists for (`createSurface -> action -> updateComponents -> action`).
  { domain: "demo-a2ui", build: buildDemoA2uiRegistrations, risk: demoA2uiDerivedRisk },
  // Proves the typed-media transport (`tool_result.media`, a hand-rolled real PNG) end to end in a
  // real chat pane — the counterpart to `demo-choices`/`demo-a2ui` proving MCP-UI/A2UI's own
  // transports. See `demo-image-tool.ts`'s own header for why the image is generated in-process
  // rather than fetched from a real image-generation service.
  { domain: "demo-image", build: buildDemoImageRegistrations, risk: demoImageDerivedRisk },
  // General-purpose: lets the model draw ANY component the catalog knows about (basic primitives
  // plus every shadcn/recharts registry component), not a scripted fixed shape.
  { domain: "render-ui", build: buildRenderUiRegistrations, risk: renderUiDerivedRisk },
  // Also registers the component-catalog tools for BYOK delegated execution; MCP top-level
  // registration alone does not put them in this registry. See `component-catalog-tool.ts`.
  { domain: "component-catalog", build: buildComponentCatalogRegistrations, risk: componentCatalogDerivedRisk },
  // Production choices accept the model's title/options; demo-choices uses a fixed sample.
  // See `ask-choice-tool.ts` for the separate contracts.
  { domain: "ask-choice", build: buildAskChoiceRegistrations, risk: askChoiceDerivedRisk },
  // Re-auth notices point to Settings' authorize flow; see `external-mcp-reauth-tool.ts`
  // for the cross-process and sandbox constraints against calling beginConnect here.
  { domain: "external-mcp-reauth", build: buildExternalMcpReauthRegistrations, risk: externalMcpReauthDerivedRisk },
  // Read-only fallback for actions requiring an admin screen; `admin-screen-link-tool.ts`
  // explains why neither server-route validation nor page.navigate owns that contract.
  { domain: "admin-screen-link", build: buildAdminScreenLinkRegistrations, risk: adminScreenLinkDerivedRisk },
];

/**
 * Every wired domain, static and registry-contributed together, in the order their tools are
 * registered — `DOMAIN_SLICES` first, then whatever `installFirstPartyToolContributors()` (or a
 * test) has registered into its explicit core contribution registry.
 *
 * Computed fresh on every call rather than once at module load: unlike `DOMAIN_SLICES`, contributed
 * entries are populated at COMPOSITION-ROOT-BOOT time, not at module-import time (that is the whole
 * point of the registry — see `tool-contribution-registry.ts`'s header), so a value captured at
 * module load could observe zero contributors if evaluated before the composition root's install
 * call runs. This function is cheap (one array concat) and is not on any hot request path.
 */
function allToolContributors(contributions?: AssistantToolContributions): readonly DomainSlice[] {
  return [...DOMAIN_SLICES, ...(contributions?.contributors.list({}) ?? [])];
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
function derivedRiskByToolId(contributions?: AssistantToolContributions): DerivedRiskByToolId {
  // Derived (post-processing) contributors — today `trash_item`, a tool of its own (a new id, a new
  // schema, its own `deletes-durable-state` declaration) — are classified and cross-checked like any
  // other wired tool. The `content_read.*` cards are deliberately absent: each is a relabel of member
  // tools whose risk was already checked under their original ids (see `content-read-tool.ts`).
  return mergeDerivedRiskMaps({ slices: [...allToolContributors(contributions), ...(contributions?.derivedContributors.list({}) ?? [])] });
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
export function assertRiskMetadataIsWirable(toolId: string, catalogEntry: AgentToolDefinition, contributions?: AssistantToolContributions): void {
  assertToolIsWirable({ toolId, catalogEntry, derivedRisk: derivedRiskByToolId(contributions) });
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
 * Production composition passes the same store to this builder and the callback route.
 * Tests that execute a surface-raising handler must do likewise or its exchange is unreachable.
 * @returns Every wired domain's registrations, concatenated in {@link DOMAIN_SLICES} order.
 * @throws {Error} If two domains register the same tool id, or if any domain's own build-time gates
 * refuse (unclassified risk, missing `inputSchema`, catalog drift, an entry neither wired nor
 * declared unwired).
 * @complexity O(t) in the total wired-tool count.
 * @overallScore 100
 */
export function buildAssistantToolRegistrations(
  routeDeps: AssistantToolRegistryDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  /** Test seam, mirroring `buildToolCatalogQuery`'s own `includeSearchKeywords`/`indexedDescriptionFor`'s
   *  own `includeDoc2query`. `includeContentReadCollapse: false` returns every domain's raw
   *  registrations BEFORE the `content_read` collapse below — the ONLY way to reconstruct the
   *  pre-collapse tool set now that this function performs the real collapse unconditionally by
   *  default, needed by `development/evals/tool-search-parent-tool-read.eval.ts`'s own earlier,
   *  synthetic-arm sections to keep measuring a valid "what if we had not collapsed" comparison
   *  against the now-real thing. Every real caller (the two production composition roots) leaves
   *  this at its default. */
  options: { readonly contributions?: AssistantToolContributions; readonly includeContentReadCollapse?: boolean } = {},
): ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  const ownerByToolId = new Map<string, string>();

  // Enriches (never mutates) the caller's own `routeDeps` with the site-switcher flag `sites` needs
  // and cannot import for itself. `routeDeps.isSiteSwitcherEnabled ??` preserves a test's own fake.
  const enrichedRouteDeps: AssistantToolRegistryDeps = {
    ...routeDeps,
    isSiteSwitcherEnabled: routeDeps.isSiteSwitcherEnabled ?? REAL_IS_SITE_SWITCHER_ENABLED,
    devRestart: routeDeps.devRestart === undefined ? devRestartPortFromEnv() : routeDeps.devRestart,
  };

  for (const slice of allToolContributors(options.contributions)) {
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

  // Derived contributors reuse already-built domain handlers, so run after domain assembly.
  // Each derive sees only the domain contributions, not earlier derived passes.
  // Pushed before the collapse's early return so both shapes include them.
  const contributed: readonly ToolRegistration[] = [...registrations];
  for (const derived of options.contributions?.derivedContributors.list({}) ?? []) {
    for (const registration of derived.derive({ registrations: contributed, routeDeps: enrichedRouteDeps, surfaces })) {
      const owner = ownerByToolId.get(registration.descriptor.id);
      if (owner) {
        throw new Error(
          `tool-registrations.ts: '${registration.descriptor.id}' is registered by both the ${owner} domain and ${derived.domain}'s post-processing pass — one tool id must resolve to exactly one handler`,
        );
      }
      ownerByToolId.set(registration.descriptor.id, derived.domain);
      registrations.push(registration);
    }
  }

  // `content_read` runs after domain assembly because it reuses the built registrations;
  // see `content-read-tool.ts` for its ownership and per-resource permission contract.
  // Apply after derivation: trash_item delegates to the original domain handlers, so one
  // approval covers the selected action instead of asking again inside its delegate.
  // Before collapse: content_read cards inherit the checked read registrations.
  const approvedRegistrations = registrations.map(registration => applyToolApprovalPolicy({ registration, surfaces }, {
    localeFor: async ctx => {
      if (!routeDeps.settingsRepo) return "en";
      const setting = await getEffectiveSetting({ repo: routeDeps.settingsRepo }, {
        namespace: LANGUAGE_NAMESPACE, key: "locale",
        scopeContext: { workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id },
      });
      return typeof setting?.value === "string" ? setting.value : "en";
    },
  }));
  if (options.includeContentReadCollapse === false) return approvedRegistrations;
  const finalRegistrations = deriveContentReadRegistrations(approvedRegistrations);
  // A new collapsed card is a new registered tool too: never exempt it from the guard.
  for (const registration of finalRegistrations) toolApprovalPolicyFor({ registration });
  return finalRegistrations;
}
