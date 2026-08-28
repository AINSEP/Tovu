import type { Express } from "express";

import {
  buildSiteProfile,
  MAX_PAGE_ITEMS,
  SITE_PROFILE_SECTION_NAMES,
  toSiteProfileDeps,
  type SiteProfileSectionName,
} from "#src/features/site-inspection/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/site/profile` — the admin frontend's door to the
 * SAME `buildSiteProfile()` the `site_get_profile` agent tool calls.
 *
 * This route exists because `apps/admin` is a browser bundle and cannot invoke an agent tool. It is
 * the reason the aggregation lives in a shared service rather than inside a tool handler: without
 * it, the frontend would need a second implementation, and this codebase has already produced
 * exactly that divergence once (two independently-maintained `settings_get_effective`
 * implementations that drifted on principal handling).
 *
 * ---------------------------------------------------------------------------
 * Why this route does NOT `authorize()` before calling the service
 * ---------------------------------------------------------------------------
 * Every other read route in `routes/admin/` opens with a single `deps.authorize(...)` and 403s on
 * denial. This one deliberately does not, and the difference is the point of the feature.
 *
 * `buildSiteProfile` makes FIVE authorization decisions — one per section, each against the
 * permission that section's own domain already enforces — and marks a denied section `forbidden`
 * rather than failing the whole response. A blanket check here would either refuse a caller who is
 * entitled to four of the five sections, or (the realistic accident) read as "this route is
 * authorized" and invite a future maintainer to drop the per-section gates, which is precisely the
 * privilege-escalation bypass this design exists to prevent.
 *
 * The route is still authenticated: `requireAdminSession` is mounted on `/api/admin`
 * (`server/modules/core.ts`), so `getAuthedPrincipal(res)` always resolves a real principal, and
 * that principal is what every section is authorized as. A principal with no grants gets a
 * well-formed 200 in which every section is `forbidden` — which discloses nothing it could not
 * learn by calling the five underlying admin routes and being refused by each.
 *
 * Response shape and secret-safety are the service's, not this file's: nothing is projected,
 * filtered or redacted here. That is what makes `check:openapi-secret-leaks`'s real-server scan
 * over this route's body meaningful evidence for the agent tool too — both adapters return the same
 * object from the same builder.
 *
 * Workspace-id 404 and the `entityType` convention follow `system/deployment-overview.ts` and
 * `system/module-status.ts` exactly.
 */

/**
 * The exact slice of `RouteDeps` this route needs. `Pick` rather than the whole bag, matching
 * `AdminDeploymentOverviewDeps`'s precedent — and notably NOT including `createSiteApp`, since this
 * route never renders a published page.
 */
export type AdminSiteProfileDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "postRepo"
  | "themes"
  | "presentationRepo"
  | "settingsRepo"
  | "getEffective"
  | "contentTypeRepo"
  | "pluginActivationRepo"
  | "discoverPlugins"
>;

/** Raised for a malformed query string, so the route can answer 400 with the offending rule named
 *  rather than silently coercing an unparseable value into a default. */
class SiteProfileQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteProfileQueryError";
  }
}

/**
 * Parses `?sections=pages,theme` into the closed section vocabulary.
 *
 * Rejects an unknown name rather than dropping it: a caller that asked for `secrets` and got a
 * response with no `secrets` key could not tell "no such section" from "that section was empty".
 * Express parses a repeated `?sections=a&sections=b` into an array, so both spellings are accepted
 * and normalized here rather than forcing the frontend to pick one.
 *
 * @param raw - `req.query.sections`, whatever Express produced for it.
 * @returns The requested names, or `undefined` when the caller did not scope the request.
 * @throws {SiteProfileQueryError} On a non-string/array value or an unknown section name.
 * @complexity O(S) in the requested-section count.
 * @example parseSections("pages,theme"); // => ["pages", "theme"]
 */
export function parseSections(raw: unknown): SiteProfileSectionName[] | undefined {
  if (raw === undefined) return undefined;
  const parts = Array.isArray(raw) ? raw : [raw];
  const names: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      throw new SiteProfileQueryError("sections must be a comma-separated string of section names");
    }
    for (const name of part.split(",")) {
      const trimmed = name.trim();
      if (trimmed !== "") names.push(trimmed);
    }
  }
  if (names.length === 0) return undefined;

  const known = new Set<string>(SITE_PROFILE_SECTION_NAMES);
  for (const name of names) {
    if (!known.has(name)) {
      throw new SiteProfileQueryError(
        `unknown section '${name}' — valid sections are: ${SITE_PROFILE_SECTION_NAMES.join(", ")}`,
      );
    }
  }
  return names as SiteProfileSectionName[];
}

/**
 * Parses `?pageLimit=25` into a positive integer.
 *
 * Out-of-range values are REJECTED here rather than silently clamped, even though
 * `buildSiteProfile` would clamp them anyway: an admin UI that sent `pageLimit=5000` and quietly
 * received 200 rows would have no signal that its request was not honored.
 *
 * @param raw - `req.query.pageLimit`.
 * @returns The parsed limit, or `undefined` when absent.
 * @throws {SiteProfileQueryError} When present but not an integer in `[1, MAX_PAGE_ITEMS]`.
 * @complexity O(1).
 * @example parsePageLimit("25"); // => 25
 */
export function parsePageLimit(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new SiteProfileQueryError("pageLimit must be a single integer value");
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_ITEMS) {
    throw new SiteProfileQueryError(`pageLimit must be an integer between 1 and ${MAX_PAGE_ITEMS}, got '${raw}'`);
  }
  return parsed;
}

export function registerAdminSiteProfileRoute(app: Express, deps: AdminSiteProfileDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/site/profile", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);

      let sections: SiteProfileSectionName[] | undefined;
      let pageLimit: number | undefined;
      try {
        sections = parseSections(req.query.sections);
        pageLimit = parsePageLimit(req.query.pageLimit);
      } catch (err) {
        if (err instanceof SiteProfileQueryError) {
          res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
          return;
        }
        throw err;
      }

      // No blanket authorize() — see this file's header. Every section is authorized inside
      // `buildSiteProfile` against its own domain's permission, as THIS principal.
      const profile = await buildSiteProfile(toSiteProfileDeps(deps), { principalId: principal.id }, { sections, pageLimit });
      res.status(200).json(profile);
    } catch (err) {
      console.error("[site/profile] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
