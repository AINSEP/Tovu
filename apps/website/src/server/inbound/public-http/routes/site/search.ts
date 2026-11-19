import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { VisitorAnalyticsDeps } from "../../visitor-analytics.js";
import type { Express, Response } from "express";
import type { SearchServiceResult } from "@jini-ai/search";
import { parseSearchRequest, type SearchQueryIssue } from "@jini-ai/search/http-query";

import { readRequestCookie } from "#src/server/http/request-cookie";
import type { SiteSearchRuntime } from "#src/server/runtime/composition/modules/site-search";
import { MEMBER_SESSION_COOKIE } from "../members/complete-sign-in.js";

/**
 * @file `GET /api/search?q=&collection=&limit=&cursor=` — the public site-search endpoint (lot S4).
 * Public and unauthenticated, like the other site routes; every hit has already been re-checked by
 * the search service's fail-closed access port before it reaches this file.
 *
 * Viewer audiences come ONLY from the visitor's own member session cookie (the same cookie and
 * resolver the member-gated page routes use), never from the query string: a member sees their
 * members-only matches, everyone else public ones. Because the answer can differ per visitor, it is
 * sent `private, no-store`, the convention every member-gated route here follows.
 *
 * Responses: `200 { hits: [{ url, title, snippet, highlights, collection }], nextCursor }` (plain-text
 * snippets; `nextCursor` is `null` on the last page), `400 { error: 'invalid_request', message }`,
 * `503 { error: 'search_unavailable', reason }` (no runtime in this composition, no configured
 * provider, timeout, provider down, access check failed) and `500` for anything unexpected.
 */

/** Longest accepted `q`, in UTF-16 code units. */
export const SEARCH_QUERY_MAX_LENGTH = 256;
/** Largest page this route serves (the service's own cap is 100). */
export const SEARCH_ROUTE_MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 1024;
const MAX_COLLECTIONS = 10;
/** The narrow deps this route needs. Absent `siteSearch` = this composition has no search. */
export interface SiteSearchRouteDeps extends VisitorAnalyticsDeps {
  readonly siteSearch?: SiteSearchRuntime;
  readonly clock?: { nowMs(): number };
}

function searchQueryErrorMessage({ issue }: { issue: SearchQueryIssue }, _optional = {}): string {
  switch (issue.code) {
    case "not-single": return `'${issue.field}' must be given once`;
    case "text-required": return "'q' is required";
    case "text-too-long": return `'q' must be at most ${SEARCH_QUERY_MAX_LENGTH} characters`;
    case "invalid-collections": return `'collection' must be up to ${MAX_COLLECTIONS} comma-separated names like 'post'`;
    case "invalid-limit": return `'limit' must be an integer from 1 to ${SEARCH_ROUTE_MAX_LIMIT}`;
    case "invalid-cursor": return "'cursor' must be the nextCursor of a previous page";
  }
}

/** The service result as the public JSON contract. */
function send(res: Response, result: SearchServiceResult): void {
  if (result.status === "invalid") {
    res.status(400).json({ error: "invalid_request", message: result.message });
    return;
  }
  if (result.status === "unavailable") {
    res.status(503).json({ error: "search_unavailable", reason: result.reason });
    return;
  }
  res.json({
    hits: result.page.hits.map(hit => ({ url: hit.url, title: hit.title, snippet: hit.snippet, highlights: hit.highlights, collection: hit.key.collection })),
    nextCursor: result.page.nextCursor ?? null,
  });
}

/**
 * Register `GET /api/search`.
 * @complexity Per request: one member-session read, one provider query and one access check.
 */
export function registerSiteSearchRoute(app: Pick<Express, "get">, deps: SiteSearchRouteDeps): void {
  app.get("/api/search", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const parsed = parseSearchRequest({ query: req.query, limits: {
      maxTextLength: SEARCH_QUERY_MAX_LENGTH, maxCollections: MAX_COLLECTIONS,
      maxLimit: SEARCH_ROUTE_MAX_LIMIT, maxCursorLength: MAX_CURSOR_LENGTH,
    } });
    if ("error" in parsed) {
      res.status(400).json({ error: "invalid_request", message: searchQueryErrorMessage({ issue: parsed.error }) });
      return;
    }
    const runtime = deps.siteSearch;
    if (!runtime) {
      res.status(503).json({ error: "search_unavailable", reason: "not_configured" });
      return;
    }
    try {
      await runtime.ready;
      const sessionToken = readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE });
      const audiences = await runtime.audiencesForSession(sessionToken === undefined ? {} : { sessionToken });
      const { siteId, workspaceId } = runtime;
      const clock = deps.clock;
      const startedAt = clock?.nowMs();
      const result = await runtime.service.query({ siteId, workspaceId, query: parsed.query }, { audiences });
      if (result.status === "ok") void captureVisitorEvent({ deps, request: req, name: "site_search_performed", properties: {
        resultCountBucket: searchResultCountBucket({ count: result.page.hits.length }),
        ...(startedAt === undefined || !clock ? {} : { durationBucket: searchDurationBucket({ elapsedMs: clock.nowMs() - startedAt }) }),
      } });
      send(res, result);
    } catch (error) {
      // Express 4 does not catch a rejected async handler; answer instead of hanging the caller.
      console.error("[site-search] GET /api/search failed:", error);
      res.status(500).json({ error: "internal error" });
    }
  });
}

function searchResultCountBucket({ count }: { count: number }, _optional = {}): string {
  if (count === 0) return "0";
  return count <= 10 ? "1-10" : "11-50";
}

/** Coarse latency only; query terms and exact timing never enter the event. @complexity O(1). */
function searchDurationBucket({ elapsedMs }: { elapsedMs: number }, _optional = {}): string {
  if (elapsedMs < 100) return "<100ms";
  if (elapsedMs < 1000) return "100ms-1s";
  return ">=1s";
}
