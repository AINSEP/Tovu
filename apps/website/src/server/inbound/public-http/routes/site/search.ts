import type { Express, Request, Response } from "express";
import type { SearchQuery, SearchServiceResult } from "@jini-ai/search";

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
/** The collection grammar of `@jini-ai/search` document keys. */
const COLLECTION = /^[a-z][a-z0-9_]{0,63}$/;
const LIMIT = /^[0-9]{1,3}$/;

/** The narrow deps this route needs. Absent `siteSearch` = this composition has no search. */
export interface SiteSearchRouteDeps {
  readonly siteSearch?: SiteSearchRuntime;
}

type Parsed = { readonly query: Omit<SearchQuery, "audiences"> } | { readonly error: string };

/** One query-string value as a string; a repeated parameter (an array) is malformed. */
function single(value: unknown, name: string): string | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return { error: `'${name}' must be given once` };
  return value;
}

function readText(raw: unknown): string | { error: string } {
  const value = single(raw, "q");
  if (typeof value === "object") return value;
  const text = (value ?? "").trim();
  if (text.length === 0) return { error: "'q' is required" };
  if (text.length > SEARCH_QUERY_MAX_LENGTH) return { error: `'q' must be at most ${SEARCH_QUERY_MAX_LENGTH} characters` };
  return text;
}

/** `collection=post` or `collection=post,page`. */
function readCollections(raw: unknown): readonly string[] | undefined | { error: string } {
  const value = single(raw, "collection");
  if (typeof value !== "string") return value;
  const collections = value.split(",").map(part => part.trim());
  if (collections.length > MAX_COLLECTIONS || !collections.every(part => COLLECTION.test(part))) {
    return { error: `'collection' must be up to ${MAX_COLLECTIONS} comma-separated names like 'post'` };
  }
  return collections;
}

function readLimit(raw: unknown): number | undefined | { error: string } {
  const value = single(raw, "limit");
  if (typeof value !== "string") return value;
  const limit = LIMIT.test(value) ? Number(value) : 0;
  if (limit < 1 || limit > SEARCH_ROUTE_MAX_LIMIT) return { error: `'limit' must be an integer from 1 to ${SEARCH_ROUTE_MAX_LIMIT}` };
  return limit;
}

function readCursor(raw: unknown): string | undefined | { error: string } {
  const value = single(raw, "cursor");
  if (typeof value !== "string") return value;
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) return { error: "'cursor' must be the nextCursor of a previous page" };
  return value;
}

const isError = (value: unknown): value is { error: string } => typeof value === "object" && value !== null && "error" in value;

/**
 * The request's query string as a service query, or the first reason it is malformed. Never reads
 * audiences or any other field from the request.
 * @complexity O(q + collections).
 */
export function parseSearchRequest(required: { readonly query: Request["query"] }, _optional: Record<string, never> = {}): Parsed {
  const { query } = required;
  const text = readText(query.q);
  const collections = readCollections(query.collection);
  const limit = readLimit(query.limit);
  const cursor = readCursor(query.cursor);
  const failed = [text, collections, limit, cursor].find(isError);
  if (failed) return { error: failed.error };
  return {
    query: {
      text: text as string,
      ...(collections === undefined ? {} : { collections: collections as readonly string[] }),
      ...(limit === undefined ? {} : { limit: limit as number }),
      ...(cursor === undefined ? {} : { cursor: cursor as string }),
    },
  };
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
    const parsed = parseSearchRequest({ query: req.query });
    if ("error" in parsed) {
      res.status(400).json({ error: "invalid_request", message: parsed.error });
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
      send(res, await runtime.service.query({ siteId, workspaceId, query: parsed.query }, { audiences }));
    } catch (error) {
      // Express 4 does not catch a rejected async handler; answer instead of hanging the caller.
      console.error("[site-search] GET /api/search failed:", error);
      res.status(500).json({ error: "internal error" });
    }
  });
}
