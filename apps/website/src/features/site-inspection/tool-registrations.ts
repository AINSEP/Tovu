import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalNumber,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";

import { SITE_INSPECTION_READ_PERMISSION, siteInspectionAgentToolCatalog } from "./agent-tools.js";
import { toSiteCapabilitiesDeps, toSiteProfileDeps, type SiteInspectionToolDeps } from "./deps.js";
import { fetchPublishedPage, PublishedPagePathError } from "./published-page.js";
import { buildSiteCapabilities, SITE_CAPABILITIES_SECTION_NAMES } from "./site-capabilities.js";
import { buildSiteProfile, SITE_PROFILE_SECTION_NAMES } from "./site-profile.js";

/**
 * @file Maps the Site Inspection catalog onto `buildSiteProfile()` / `buildSiteCapabilities()` /
 * `fetchPublishedPage()`, as `ToolRegistration`s. The entire catalog is wired — there is no
 * `unwiredToolIds` set here, which means any future catalog entry added without a handler is a build
 * failure.
 *
 * ---------------------------------------------------------------------------
 * Authorization shape — the one thing in this file worth reading carefully
 * ---------------------------------------------------------------------------
 *
 * `fetch_published_page` follows the ordinary pattern: the domain function carries no `authorize()`
 * of its own, so this handler performs the check inline through the kit's `requireToolPermission`,
 * exactly like `theme_list` and `plugins_list` do. One evaluator, at the handler, per ADR-021 §2.
 *
 * `site_get_profile` deliberately does NOT call `requireToolPermission` at the top of its handler,
 * and that omission is the design rather than a gap. It has FIVE authorization decisions, not one:
 * `buildSiteProfile` authorizes each section against the permission that section's own domain
 * already uses, and marks a denied section `forbidden` instead of failing the call. Adding a
 * blanket gate here would produce one of two bad outcomes:
 *
 *  - if the blanket permission were STRICTER than a section's own, a caller entitled to four of the
 *    five sections would be refused outright, and
 *  - if it were LOOSER (the realistic accident), it would read as "this tool is authorized" and
 *    invite someone to delete the per-section checks — which is precisely the privilege-escalation
 *    bypass this design exists to prevent, since Tovu's domain tools authorize inside their own
 *    handler bodies rather than through a single policy gate.
 *
 * So `site_get_profile` is still fully gated; the gate is just five gates, and it lives one layer
 * down where both this tool AND the admin HTTP route reach it. A principal with no grants at all
 * gets a well-formed response in which every section is `forbidden` — which discloses nothing it
 * could not learn by calling the five underlying tools and being refused by each.
 *
 * `site_describe_capabilities` has the same shape for the same reason: three sections, three gates
 * inside `buildSiteCapabilities`, no blanket check here.
 */

const CATALOG_BY_ID = indexCatalogById(siteInspectionAgentToolCatalog);

export type { SiteInspectionToolDeps } from "./deps.js";

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does
 * — independent of the catalog's `sideEffects` declaration, which `assertToolIsWirable` refuses to
 * let drift from this map.
 */
export const siteInspectionDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> buildSiteProfile(): five concurrent reads (posts, in-memory themes, presentation settings,
  //    plugin discovery + activations, settings, content types). No writes anywhere on the path.
  ["site_get_profile", "none"],
  // -> buildSiteCapabilities(): the composition root's in-memory tool registry list, the generated
  //    admin screen constant, and one content-type list read. No writes anywhere on the path.
  ["site_describe_capabilities", "none"],
  // -> fetchPublishedPage(): boots the site's own Express app on a loopback port and issues one
  //    GET, the same thing `export/site-exporter.ts` does per route. The handler writes nothing.
  //    See the catalog entry's own comment for the one disclosed caveat (a path matching a live
  //    redirect rule records a redirect hit, exactly as a real visit would).
  ["fetch_published_page", "none"],
]);

/** Raised for a bad `sections`/`pageLimit` input, so {@link isShapeRejection} can decorate it with
 *  the published schema. A named class rather than a bare `Error` for the same reason
 *  `features/theme/tool-registrations.ts` declares `ThemeNotFoundError`. */
class SiteInspectionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteInspectionInputError";
  }
}

/** Errors a DIFFERENT input would fix, and therefore worth publishing the tool's schema back with.
 *  A timeout or an underlying repo failure is not one of these: retrying with different arguments
 *  would not help, and appending a schema would imply otherwise. */
function isShapeRejection(error: unknown): boolean {
  return error instanceof PublishedPagePathError || error instanceof SiteInspectionInputError;
}

/**
 * Reads and validates the optional `sections` array off a tool input, against one tool's closed
 * vocabulary.
 *
 * Rejects an unknown section name rather than silently dropping it: an agent that asked for
 * `"secrets"` and got a response with no `secrets` key would have no way to tell "that section does
 * not exist" from "that section came back empty", and would likely conclude the latter.
 *
 * @param input - The already-validated tool input record.
 * @param vocabulary - The calling tool's own section names.
 * @returns The requested section names, or `undefined` when the caller did not scope the call.
 * @throws {SiteInspectionInputError} When `sections` is present but is not an array of known section
 * names. The message names every valid value so the model can correct itself in one turn.
 * @complexity O(S) in the requested-section count, bounded by the closed vocabulary.
 * @example readSections({ sections: ["theme"] }, SITE_PROFILE_SECTION_NAMES); // => ["theme"]
 */
function readSections<N extends string>(input: Record<string, unknown>, vocabulary: readonly N[]): N[] | undefined {
  const raw = input["sections"];
  if (raw === undefined || raw === null) return undefined;
  const validNames = vocabulary.join(", ");
  if (!Array.isArray(raw)) {
    throw new SiteInspectionInputError(`sections must be an array of section names — valid names are: ${validNames}`);
  }
  const known = new Set<string>(vocabulary);
  for (const candidate of raw) {
    if (typeof candidate !== "string" || !known.has(candidate)) {
      throw new SiteInspectionInputError(`unknown section '${String(candidate)}' — valid names are: ${validNames}`);
    }
  }
  return raw as N[];
}

export function buildSiteInspectionRegistrations(routeDeps: SiteInspectionToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    site_get_profile: async (ctx) => {
      const input = requireInputRecord(ctx.input ?? {});

      // NO blanket `requireToolPermission` here — see this file's header. `buildSiteProfile`
      // authorizes each section against that section's own domain permission.
      return withSchemaOnRejection({ toolId: "site_get_profile", catalog: CATALOG_BY_ID, isShapeRejection }, async () =>
        buildSiteProfile(
          toSiteProfileDeps(routeDeps),
          { principalId: ctx.principal.id },
          { sections: readSections(input, SITE_PROFILE_SECTION_NAMES), pageLimit: optionalNumber(input, "pageLimit") },
        ),
      );
    },

    site_describe_capabilities: async (ctx) => {
      const input = requireInputRecord(ctx.input ?? {});

      // NO blanket gate here either — `buildSiteCapabilities` authorizes each of its three sections
      // against that section's own permission.
      return withSchemaOnRejection(
        { toolId: "site_describe_capabilities", catalog: CATALOG_BY_ID, isShapeRejection },
        async () =>
          buildSiteCapabilities(
            toSiteCapabilitiesDeps(routeDeps),
            { principalId: ctx.principal.id },
            { sections: readSections(input, SITE_CAPABILITIES_SECTION_NAMES) },
          ),
      );
    },

    fetch_published_page: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const path = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: SITE_INSPECTION_READ_PERMISSION,
        entityType: "published-page",
      });

      return withSchemaOnRejection(
        { toolId: "fetch_published_page", catalog: CATALOG_BY_ID, isShapeRejection },
        async () => fetchPublishedPage(routeDeps, { path }, { maxBytes: optionalNumber(input, "maxBytes") }),
      );
    },
  };

  return buildDomainRegistrations({
    domain: "site-inspection",
    catalogModule: "features/site-inspection/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: siteInspectionDerivedRisk,
  });
}

/**
 * Contributes Site Inspection's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. Same seam every other converted domain uses; this module never imports `server/`, and
 * `assistant/tool-registrations.ts` reaches it only through a type-only import of
 * `SiteInspectionToolDeps`.
 */
export function contributeSiteInspectionTools(): ToolContributor {
  return {
    domain: "site-inspection",
    build: buildSiteInspectionRegistrations,
    risk: siteInspectionDerivedRisk,
  };
}
