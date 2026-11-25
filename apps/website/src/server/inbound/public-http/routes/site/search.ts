import type { Request } from "express";
import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";
import { siteSearchRoute, type SiteSearchRouteDeps as SiteSearchSpecDeps } from "@jini-ai/search/public-http/routes/site/search";

import { readRequestCookie } from "#src/server/http/request-cookie";
import type { SiteSearchRuntime } from "#src/server/runtime/composition/modules/site-search";
import { mountPublicJsonRoute } from "../../../admin-http/admin-json-route-ports.js";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import type { VisitorAnalyticsDeps } from "@jini-ai/analytics/site/contracts";
import { MEMBER_SESSION_COOKIE } from "../members/complete-sign-in.js";

/**
 * @file `GET /api/search` (lot S4): the host binding of Jini's `siteSearchRoute` (see its file doc for
 * the wire contract). This file owns the host policy: the query limits, the member session cookie the
 * viewer audiences come from, the visitor event and its consent, and the visitor copy of the 500.
 */

/** Longest accepted `q`, in UTF-16 code units. */
export const SEARCH_QUERY_MAX_LENGTH = 256;
/** Largest page this route serves (the service's own cap is 100). */
export const SEARCH_ROUTE_MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 1024;
const MAX_COLLECTIONS = 10;
const SEARCH_LIMITS = { maxTextLength: SEARCH_QUERY_MAX_LENGTH, maxCollections: MAX_COLLECTIONS, maxLimit: SEARCH_ROUTE_MAX_LIMIT, maxCursorLength: MAX_CURSOR_LENGTH };

/** The narrow deps this route needs. Absent `siteSearch` = this composition has no search. */
export interface SiteSearchRouteDeps extends VisitorAnalyticsDeps<Request> {
  readonly siteSearch?: SiteSearchRuntime;
  readonly clock?: { nowMs(): number };
}

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/**
 * Register `GET /api/search`.
 * @complexity Per request: one member-session read, one provider query and one access check.
 */
export function registerSiteSearchRoute({ app, deps, errors }: { app: Pick<Express, "get">; deps: SiteSearchRouteDeps; errors: RouteErrorPorts }, _optional: Record<string, never> = {}): void {
  const mounted: SiteSearchSpecDeps = { siteSearch: deps.siteSearch, clock: deps.clock, limits: SEARCH_LIMITS, sessionToken: boundPerRequest, recordSearchPerformed: boundPerRequest };
  mountPublicJsonRoute({ errors,
    // `mountJsonRoute` only calls `app.get(path, handler)`, so a `Pick<Express, "get">` is enough.
    app: app as Express,
    spec: siteSearchRoute,
    deps: mounted,
    // Express 4 does not catch a rejected async handler; answer instead of hanging the caller.
    failure: { operation: "public:search", visitorError: "The site couldn’t load the search results. Reload this page and report this error ID if it keeps happening." },
  }, {
    requestDeps: ({ req, deps: base }) => ({
      ...base,
      sessionToken: () => readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }),
      recordSearchPerformed: ({ properties }) => { void captureVisitorEvent({ deps, request: req, name: "site_search_performed", properties }); },
    }),
  });
}
