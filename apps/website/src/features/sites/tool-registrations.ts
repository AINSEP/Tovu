import path from "node:path";

import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
import {
  InitDirNotEmptyError,
  SiteDirInvalidError,
  ValidationError,
  SITE_NAME_PATTERN,
} from "#src/platform/site-dir/index";

import { SITES_WRITE_PERMISSION, sitesAgentToolCatalog } from "./agent-tools.js";
import { resolveSitesDeps, type SitesToolDeps } from "./deps.js";
import { activateSite, createSiteForOwner, resolveSiteSwitchBase, type SiteAdminRefusal, type SiteAdminRefusalCode } from "./site-admin.js";

/**
 * @file Maps the Sites catalog onto `duplicateSite()` and `site-admin.ts`'s `createSiteForOwner` /
 * `activateSite`, as `ToolRegistration`s. The entire catalog
 * is wired — there is no `unwiredToolIds` set here, which means any future catalog entry added
 * without a handler is a build failure.
 *
 * ---------------------------------------------------------------------------
 * Authorization AND capability-flag shape
 * ---------------------------------------------------------------------------
 * Two independent gates, in the SAME order `server/inbound/admin-http/routes/system/sites.ts`
 * checks them for Create/Activate, and for the same reason that route gives: the capability flag
 * is a deployment-wide switch independent of the caller's own permissions, so it is checked BEFORE
 * spending a `requireToolPermission` call on an operation that will be refused either way.
 *
 * `sourceName`/`targetName` are folder names, never filesystem paths — validated here against the
 * SAME `SITE_NAME_PATTERN` `site-registry.ts`'s own `createSite` uses (lowercase/digits/dashes
 * only), which is what makes a caller-supplied name safe to `path.join` under `sites/` at all (no
 * `.`/`/` is even expressible in that character class, so nothing can resolve outside `sitesRoot`).
 * This validation happens here, not inside `duplicateSite` itself, because `duplicateSite` takes
 * already-resolved absolute directories (the same trust model `initSite` uses) — turning a
 * caller-supplied NAME into a safe PATH is this tool layer's own job, exactly like `createSite`'s
 * HTTP route already does for the identical reason.
 */

const CATALOG_BY_ID = indexCatalogById({ catalog: sitesAgentToolCatalog });

export type { SitesToolDeps } from "./deps.js";

/**
 * This wiring layer's OWN risk classification, authored from what the handler below actually does
 * — independent of the catalog's `sideEffects` declaration, which `assertToolIsWirable` refuses to
 * let drift from this map.
 */
export const sitesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> duplicateSite(): creates a new sites/<targetName>/ directory, copies uploads/themes/etc.,
  //    and writes a new content.db + config.json + .site-meta.json. A real, disk-affecting write.
  ["sites_duplicate_site", "mutates-durable-state"],
  // -> createSiteForOwner(): initSite writes a new sites/<name>/ directory, database and config.
  ["sites_create_site", "mutates-durable-state"],
  // -> activateSite(): rewrites TOVU_SITE in the switcher tree's .env (the next boot's site).
  ["sites_switch_site", "mutates-durable-state"],
]);

/** Raised for a bad `sourceName`/`targetName`/`displayName` shape, so `isShapeRejection` can
 *  decorate the rejection with the published schema — a named class rather than a bare `Error`,
 *  the same convention `features/site-inspection/tool-registrations.ts`'s own
 *  `SiteInspectionInputError` and `features/theme/tool-registrations.ts`'s `ThemeNotFoundError`
 *  already use. */
class SitesInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitesInputError";
  }
}

/** Raised when `sourceName` names no real, registered site — a DIFFERENT `sourceName` argument
 *  would fix this, so it is classified as a shape rejection alongside `SitesInputError`. */
class SourceSiteNotFoundError extends Error {
  constructor(sourceName: string) {
    super(`sourceName '${sourceName}' does not name a real site under sites/`);
    this.name = "SourceSiteNotFoundError";
  }
}

/** Raised when this deployment has site switching disabled. NOT a shape rejection — retrying with
 *  a different `sourceName`/`targetName` cannot fix it, so `isShapeRejection` deliberately excludes
 *  it (mirrors `PublishedPageTimeoutError`'s own "a real fault; do not retry" classification). */
class SiteSwitchingDisabledError extends Error {
  constructor() {
    super("site switching is disabled on this deployment — sites_duplicate_site is unavailable");
    this.name = "SiteSwitchingDisabledError";
  }
}

/**
 * Raised when this boot's `siteBinding.switcherCompatible` is `false` (an install-dir boot, `tovu
 * serve <dir>` — 2026-09-06 composition-root fix). NOT a shape rejection for the same reason
 * {@link SiteSwitchingDisabledError} isn't: no `sourceName`/`targetName` retry can fix a structural
 * fact about which `sites/` root this process was even started against. Same HTTP-layer
 * classification `sites.ts`'s `sendSiteBindingNotSwitchable` gives the identical case.
 */
class SiteBindingNotSwitchableError extends Error {
  constructor() {
    super(
      "this server was started against a specific site directory (tovu serve <dir>) with no related sites/ folder to manage — sites_duplicate_site is unavailable"
    );
    this.name = "SiteBindingNotSwitchableError";
  }
}

/** A refusal from `site-admin.ts`, carried to the model with its machine-readable `code`. */
class SiteAdminRefusalError extends Error {
  readonly code: SiteAdminRefusalCode;
  constructor(refusal: SiteAdminRefusal) {
    super(refusal.error);
    this.name = "SiteAdminRefusalError";
    this.code = refusal.code;
  }
}

/** The `site-admin.ts` refusals a different `name` would fix — worth publishing the schema back. */
const SHAPE_REFUSAL_CODES: ReadonlySet<SiteAdminRefusalCode> = new Set(["VALIDATION_ERROR", "SITE_ALREADY_EXISTS", "SITE_NOT_FOUND"]);

/** Every error class a DIFFERENT input would fix — the three domain errors `duplicateSite()`
 *  itself can throw for a bad name or an occupied target all name exactly the argument a retry
 *  should change, same as this file's own two local input errors. */
const SHAPE_REJECTION_CLASSES = [
  SitesInputError,
  SourceSiteNotFoundError,
  ValidationError,
  InitDirNotEmptyError,
  SiteDirInvalidError,
] as const;

/** Worth publishing the tool's schema back with — see {@link SHAPE_REJECTION_CLASSES}'s own doc. */
function isShapeRejection(error: unknown): boolean {
  if (error instanceof SiteAdminRefusalError) return SHAPE_REFUSAL_CODES.has(error.code);
  return SHAPE_REJECTION_CLASSES.some((errorClass) => error instanceof errorClass);
}

/** Runs the shared flag + binding gate, then the permission check — the same order the admin
 *  routes use — and returns the served tree's base. Throws the gate's refusal as-is. */
async function gateSiteSwitchWrite(routeDeps: SitesToolDeps, switcherEnabled: boolean, principalId: string): Promise<string> {
  const gate = resolveSiteSwitchBase({ binding: routeDeps.siteBinding, switchingEnabled: switcherEnabled });
  if (!gate.ok) throw new SiteAdminRefusalError(gate);
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId, permission: SITES_WRITE_PERMISSION }, { entityType: "site-registry" });
  return gate.switcherBase;
}

/** Unwraps a `site-admin.ts` outcome: the success value, or its refusal thrown. */
function orThrowRefusal<T extends { ok: true }>(outcome: T | SiteAdminRefusal): T {
  if (!outcome.ok) throw new SiteAdminRefusalError(outcome);
  return outcome;
}

/** Validates one folder-name argument against `SITE_NAME_PATTERN` — the one check that makes it
 *  safe to `path.join` under `sites/` at all. @complexity O(1); cyclomatic 2. */
function requireSiteFolderName(input: Record<string, unknown>, field: string): string {
  const value = requireString({ input: input, key: field });
  if (!SITE_NAME_PATTERN.test(value)) {
    throw new SitesInputError(`${field} must be 1..100 lowercase letters, digits, and dashes (got '${value}')`);
  }
  return value;
}

export function buildSitesRegistrations(routeDeps: SitesToolDeps): ToolRegistration[] {
  // Falls back to `false` (disabled) rather than assuming enabled — matches
  // `isSiteSwitcherEnabled`'s own documented default-OFF safety posture. See `deps.ts`'s own
  // header for why this field is read directly off `routeDeps` rather than resolved in `deps.ts`.
  const switcherEnabled = routeDeps.isSiteSwitcherEnabled?.() ?? false;

  const handlers: Record<string, ToolHandler> = {
    sites_duplicate_site: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const sourceName = requireSiteFolderName(input, "sourceName");
      const targetName = requireSiteFolderName(input, "targetName");
      const displayName = optionalString({ input: input, key: "displayName" });

      if (!switcherEnabled) {
        throw new SiteSwitchingDisabledError();
      }
      // Same "deployment-wide, independent of the caller's own permissions" ordering the flag check
      // immediately above already follows — checked before spending a requireToolPermission call on
      // an operation this boot cannot fulfill regardless of who is asking.
      // Resolved per call, not at build time: `siteBinding` is read only when the tool actually runs,
      // the same way `list-tool.ts` reads it, so assembling the catalog never depends on it.
      const resolved = resolveSitesDeps(routeDeps);
      const switcherBase = resolved.switcherBase;
      if (switcherBase === null) {
        throw new SiteBindingNotSwitchableError();
      }

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: SITES_WRITE_PERMISSION }, { entityType: "site-registry" });

      return withSchemaOnRejection({ toolId: "sites_duplicate_site", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
        // Both the source lookup and the target are rooted at the SERVED tree (`switcherBase`), never
        // `process.cwd()` — see `deps.ts`'s header for the wrong-tree copy the cwd default caused.
        const source = resolved.listSites({ cwd: switcherBase }).find((site) => site.name === sourceName);
        if (!source) {
          throw new SourceSiteNotFoundError(sourceName);
        }

        const targetDir = path.join(switcherBase, "sites", targetName);
        const result = await resolved.duplicateSite({ sourceDir: source.dir, targetDir, name: displayName });
        return { name: targetName, dir: result.dir, siteId: result.siteId, sourceName };
      } });
    },
    sites_create_site: async (ctx) => {
      const name = requireSiteFolderName(requireInputRecord({ input: ctx.input }), "name");
      const switcherBase = await gateSiteSwitchWrite(routeDeps, switcherEnabled, ctx.principal.id);
      return withSchemaOnRejection({ toolId: "sites_create_site", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
        // No access tokens from chat: a pasted token would sit in the transcript. The admin Create form takes them.
        const created = orThrowRefusal(await createSiteForOwner({ workspaceId: routeDeps.workspaceId, switcherBase, name }, { createSite: routeDeps.createSite }));
        return created.site;
      } });
    },

    sites_switch_site: async (ctx) => {
      const name = requireSiteFolderName(requireInputRecord({ input: ctx.input }), "name");
      const switcherBase = await gateSiteSwitchWrite(routeDeps, switcherEnabled, ctx.principal.id);
      return withSchemaOnRejection({ toolId: "sites_switch_site", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
        const { ok: _ok, ...activated } = orThrowRefusal(activateSite({ switcherBase, name }, { listSites: routeDeps.listSites, persistActiveSite: routeDeps.persistActiveSite }));
        return activated;
      } });
    },
  };

  return buildDomainRegistrations({
    domain: "sites",
    catalogModule: "features/sites/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: sitesDerivedRisk,
  });
}

/**
 * Contributes the Sites domain's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. Same seam every other converted domain uses; this module never imports `server/` (see
 * `deps.ts`'s own header for the one field that would have required it, and how that is avoided).
 */
export function contributeSitesTools(): ToolContributor {
  return {
    domain: "sites",
    build: buildSitesRegistrations,
    risk: sitesDerivedRisk,
  };
}
