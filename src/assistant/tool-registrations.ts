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
 * Wired domains and their catalogs (20 domains, 130 catalog entries, 112 wired tools):
 *   content-types (5 of 7)   forms (3)         identity (10)      comments (7)
 *   members (4)              newsletter (14)   media (4)          widgets (12)
 *   menus (5)                database (4 of 9) recovery (5 of 7)  plugins (2)
 *   workspace (2 of 4)       settings (3 of 7) entries (5 of 5)   taxonomy (6 of 7)
 *   seo (6)                  redirects (6 of 7) integrations (5)  post (4 of 4)
 * Each domain's own file records which of its entries are deliberately unwired and why; the kit's
 * `buildDomainRegistrations` fails the build on any catalog entry that is neither.
 *
 * To wire a new domain: add its `build<Domain>Registrations` and its risk slice to
 * {@link DOMAIN_SLICES} below. That is the only edit here — a new domain never adds handler code to
 * this file, which is what makes two domains developable in parallel without colliding.
 */
import type { RouteDeps } from "../server/routes/types";
import { buildCommentsRegistrations, commentsDerivedRisk } from "../comments/tool-registrations";
import { buildContentTypesRegistrations, contentTypesDerivedRisk } from "../features/content-types/tool-registrations";
import { buildDatabaseRegistrations, databaseDerivedRisk } from "../features/database/tool-registrations";
import { buildEntriesRegistrations, entriesDerivedRisk } from "../features/entries/tool-registrations";
import { buildPluginsRegistrations, pluginsDerivedRisk } from "../features/plugin-runtime/tool-registrations";
import { buildPostRegistrations, postDerivedRisk } from "../features/post/tool-registrations";
import { buildRecoveryRegistrations, recoveryDerivedRisk } from "../features/recovery/tool-registrations";
import { buildSettingsRegistrations, settingsDerivedRisk } from "../features/settings/tool-registrations";
import { buildTaxonomyRegistrations, taxonomyDerivedRisk } from "../features/taxonomy/tool-registrations";
import { buildWorkspaceRegistrations, workspaceDerivedRisk } from "../features/workspace/tool-registrations";
import { buildFormsRegistrations, formsDerivedRisk } from "../forms/tool-registrations";
import { buildIdentityRegistrations, identityDerivedRisk } from "../identity/tool-registrations";
import { buildIntegrationsRegistrations, integrationsDerivedRisk } from "../integrations/tool-registrations";
import { buildMediaRegistrations, mediaDerivedRisk } from "../media/tool-registrations";
import { buildMembersRegistrations, membersDerivedRisk } from "../members/tool-registrations";
import { buildMenusRegistrations, menusDerivedRisk } from "../navigation/tool-registrations";
import { buildNewsletterRegistrations, newsletterDerivedRisk } from "../newsletter/tool-registrations";
import { buildRedirectsRegistrations, redirectsDerivedRisk } from "../redirects/tool-registrations";
import { buildSeoRegistrations, seoDerivedRisk } from "../seo/tool-registrations";
import { buildWidgetsRegistrations, widgetsDerivedRisk } from "../widgets/tool-registrations";
import {
  assertToolIsWirable,
  mergeDerivedRiskMaps,
  type DerivedRiskByToolId,
  type ToolRegistration,
  type WirableToolDefinition,
} from "./tool-registration-kit";

/** One wired domain: its builder and the risk classification its own wiring file maintains. */
interface DomainSlice {
  domain: string;
  build: (routeDeps: RouteDeps) => ToolRegistration[];
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
  { domain: "plugins", build: buildPluginsRegistrations, risk: pluginsDerivedRisk },
  { domain: "workspace", build: buildWorkspaceRegistrations, risk: workspaceDerivedRisk },
  { domain: "settings", build: buildSettingsRegistrations, risk: settingsDerivedRisk },
  { domain: "entries", build: buildEntriesRegistrations, risk: entriesDerivedRisk },
  { domain: "post", build: buildPostRegistrations, risk: postDerivedRisk },
  { domain: "taxonomy", build: buildTaxonomyRegistrations, risk: taxonomyDerivedRisk },
  { domain: "seo", build: buildSeoRegistrations, risk: seoDerivedRisk },
  { domain: "redirects", build: buildRedirectsRegistrations, risk: redirectsDerivedRisk },
  { domain: "integrations", build: buildIntegrationsRegistrations, risk: integrationsDerivedRisk },
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
 * Builds the complete agent-tool surface for one workspace's `RouteDeps`.
 *
 * @param routeDeps - The same dependency bag the admin HTTP routes are built from, so a tool call
 * and the equivalent human click reach identical domain code.
 * @returns Every wired domain's registrations, concatenated in {@link DOMAIN_SLICES} order.
 * @throws {Error} If two domains register the same tool id, or if any domain's own build-time gates
 * refuse (unclassified risk, missing `inputSchema`, catalog drift, an entry neither wired nor
 * declared unwired).
 * @complexity O(t) in the total wired-tool count.
 * @overallScore 100
 */
export function buildAssistantToolRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const registrations: ToolRegistration[] = [];
  const ownerByToolId = new Map<string, string>();

  for (const slice of DOMAIN_SLICES) {
    for (const registration of slice.build(routeDeps)) {
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
