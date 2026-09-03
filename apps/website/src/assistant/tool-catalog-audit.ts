/**
 * @file Diagnostic audit for `search_tools`/`describe_tool` calls, into the same durable
 * `agent_tool_attempts` trail `tool-executor-audit.ts` uses for real tool executions.
 *
 * Why this exists: neither call ever reaches `ToolExecutor`. On the Local CLI path,
 * `search_tools`/`describe_tool` proxy `@jini-ai/http-kit`'s `registerToolCatalogRoutes`
 * (`tool-catalog-query.ts`), whose own module doc states the two routes are "deliberately not
 * routed through `ToolExecutor`" — a read over a snapshot table, not an execution. On the BYOK path
 * (`byok-tool-surface.ts`), the two meta-tools are dispatched directly inside `executeMetaTool`,
 * never through `ToolExecutor.execute` either. `withToolAttemptAudit` (`tool-executor-audit.ts`)
 * wraps `ToolExecutor`, so it never observes either call on either path — confirmed by reading both
 * call sites, not assumed.
 *
 * The 2026-09-01 incident this closes: an agent's `search_tools` query for
 * `custom_credential_verify` was concluded to have found nothing and reported so to the owner; the
 * tool existed and was found roughly two hours later after pushback. With no record anywhere of the
 * query text, the limit, or the ranked hits, nobody could tell afterward whether that was bad query
 * vocabulary, a `limit` cutoff, or a ranking bug — and no future ranking miss would have been
 * diagnosable either. {@link appendToolCatalogAttempt} and its two detail builders make that
 * reconstructible.
 *
 * Local CLI identity gap, disclosed rather than worked around: `toolCatalogSearchRoute`/
 * `toolCatalogDescribeRoute`'s own `handle(input, deps)` signature (`@jini-ai/http-kit`'s
 * `tool-catalog.ts`) carries no per-request run or principal id — that module's own doc states "v0
 * scope: no principal scoping" for this exact route family, and `handle` only ever receives the
 * parsed query input plus `{catalog}`. {@link withToolCatalogAudit} is therefore constructed once per
 * daemon boot with a FIXED `runId`/`principalId` for its whole process lifetime, not a real per-call
 * value — see its own doc. BYOK does not have this gap: `executeMetaTool` already receives a real
 * `principal`/`run` per call, so `byok-tool-surface.ts` calls {@link appendToolCatalogAttempt}
 * directly with them, no wrapper needed. Giving the Local CLI route real per-call identity is a
 * `@jini-ai/http-kit` protocol change (threading identity into `RouteInputContext`), out of scope
 * here.
 *
 * Architectural role:
 * `src/assistant` composition-layer adapter, mirroring `tool-executor-audit.ts`'s shape and its
 * "never let the sink's failure escape" contract. Depends on the `features/tool-audit` port, never on
 * a concrete sink.
 */
import { randomUUID } from "node:crypto";

import type { ToolCatalogEntry, ToolCatalogQuery, ToolCatalogSearchHit } from "@jini-ai/http-kit";

import type { ToolAttemptAuditSink } from "../features/tool-audit/types.js";

/** `toolId` recorded for a `search_tools` call — the same name the model calls it by on both paths
 *  (`@jini-ai/mcp`'s `searchToolsTool` and `byok-tool-surface.ts`'s `META_TOOL_DESCRIPTORS`), so a
 *  reader can filter `agent_tool_attempts` by name identically to every other tool. */
export const SEARCH_TOOLS_TOOL_ID = "search_tools";
/** `toolId` recorded for a `describe_tool` call — see {@link SEARCH_TOOLS_TOOL_ID}. */
export const DESCRIBE_TOOL_TOOL_ID = "describe_tool";

/** Fixed `principalId` recorded for every Local CLI catalog-route row — see this module's own doc
 *  for why no real per-call principal exists to record instead. Mirrors `seed.ts`'s
 *  `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID` naming convention for a system-attributed actor id. */
export const UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID = "system-tool-catalog-route";
/** Fixed `runId` recorded for every Local CLI catalog-route row — see
 *  {@link UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID}'s doc for why. */
export const UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID = "unscoped-tool-catalog-route";

/**
 * Builds the `detail` JSON for one `search_tools` call.
 *
 * `resultIds` carries ids only, in the exact rank order the caller received — never a hit's
 * description or score. An id is a stable, non-secret identifier by construction (every tool id is
 * itself part of the durable catalog). The raw `query` text is deliberately NOT included: it is
 * operator-supplied free text that could in principle contain anything — including a pasted secret —
 * and {@link ToolAttemptEvent.detail}'s own contract (`features/tool-audit/types.ts`) is "Redacted
 * metadata only — never raw input", the same rule `tool-executor-audit.ts`'s `describeInput` already
 * follows for a tool's input (key names and array lengths, never values). `queryLength` is this
 * field's value-free equivalent — enough to tell a blank or degenerate query apart from a real one
 * without the durable audit trail ever retaining what was actually typed.
 *
 * @param query - The raw query string the caller supplied — read only for its length, never stored.
 * @param limit - The limit actually used for this call. `null` only if a future caller genuinely
 * does not know its own resolved limit; both call sites wired today always know theirs.
 * @param hits - The ranked hits the catalog returned, in order.
 * @returns A compact JSON string safe to store in `agent_tool_attempts.detail`.
 * @complexity O(h) in the number of hits.
 * @overallScore 100
 */
export function searchToolsAuditDetail(query: string, limit: number | null, hits: readonly ToolCatalogSearchHit[]): string {
  return JSON.stringify({ queryLength: query.length, limit, resultIds: hits.map((hit) => hit.id), resultCount: hits.length });
}

/**
 * Builds the `detail` JSON for one `describe_tool` call: the requested id and whether it resolved.
 * Never the resolved entry's description or input schema — those are public catalog data already
 * durable in the registry, and repeating them into a per-call audit row would bloat it for no
 * diagnostic gain the id + found flag do not already give.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function describeToolAuditDetail(id: string, entry: ToolCatalogEntry | null): string {
  return JSON.stringify({ id, found: entry !== null });
}

/** One row's full attribution plus its pre-built `detail` JSON. */
export interface ToolCatalogAttemptEvent {
  readonly workspaceId: string;
  readonly runId: string;
  readonly principalId: string;
  readonly toolId: string;
  /** Pre-built via {@link searchToolsAuditDetail}/{@link describeToolAuditDetail}. */
  readonly detail: string;
}

export interface AppendToolCatalogAttemptOptions {
  /** @default `() => new Date().toISOString()` */
  now?: () => string;
  /** @default `node:crypto` `randomUUID` */
  newAttemptId?: () => string;
  /** Called when the sink itself throws. @default `console.error` */
  onSinkError?: (error: unknown) => void;
}

/**
 * Appends one `search_tools`/`describe_tool` attempt row, matching `tool-executor-audit.ts`'s own
 * "audit is observation, never a gate" contract: the append is fired without being awaited, so
 * neither `ToolCatalogQuery.search`/`.describe` (synchronous by contract) nor BYOK's meta-tool
 * dispatch is ever slowed or interrupted by it, and a throwing sink is caught and reported here
 * rather than allowed to propagate to the call it is observing.
 *
 * `phase` is always `"completed"`: unlike a delegated tool execution, a catalog read has no
 * authorization/confirmation lifecycle to distinguish — `@jini-ai/sqlite`'s `searchToolCatalog`/
 * `getToolCatalogEntry` tokenize the query into alphanumeric-only terms before building the FTS5
 * `MATCH` string (`tool-catalog.ts`), so neither can throw on caller-supplied query text.
 *
 * @complexity O(1); the sink write itself is async and not awaited here.
 * @overallScore 100
 */
export function appendToolCatalogAttempt(sink: ToolAttemptAuditSink, event: ToolCatalogAttemptEvent, options: AppendToolCatalogAttemptOptions = {}): void {
  const now = options.now ?? (() => new Date().toISOString());
  const newAttemptId = options.newAttemptId ?? randomUUID;
  const onSinkError = options.onSinkError ?? ((error: unknown) => console.error("[tool-catalog-audit] sink threw; catalog query is unaffected", error));

  void sink.append({ ...event, attemptId: newAttemptId(), executionId: null, phase: "completed", at: now() }).catch(onSinkError);
}

/** Fixed attribution a {@link withToolCatalogAudit} wrapper appends every row under — see that
 *  function's own doc for why `runId`/`principalId` cannot vary per call on this path. */
export interface ToolCatalogAuditIdentity {
  readonly workspaceId: string;
  readonly runId: string;
  readonly principalId: string;
}

/**
 * Wraps a `ToolCatalogQuery` so every `search`/`describe` call it serves is appended to `sink`, for
 * the Local CLI path (`registerToolCatalogRoutes`) — see this module's own doc for why BYOK logs
 * directly instead of using this wrapper.
 *
 * @param catalog - The real query this wraps; behavior (hits, ranking, `null` for an unknown id) is
 * passed through completely unchanged.
 * @param sink - Where attempts are appended.
 * @param identity - Fixed workspace/run/principal attribution for every row this wrapper appends.
 * @param options - Test seams, forwarded to {@link appendToolCatalogAttempt}.
 * @returns A drop-in `ToolCatalogQuery`.
 * @complexity Adds one sink append per call, O(1) at this layer (the append itself is async and never
 * awaited here, so it adds no latency to a caller waiting on `search`/`describe`).
 * @overallScore 100
 */
export function withToolCatalogAudit(
  catalog: ToolCatalogQuery,
  sink: ToolAttemptAuditSink,
  identity: ToolCatalogAuditIdentity,
  options: AppendToolCatalogAttemptOptions = {},
): ToolCatalogQuery {
  return {
    search(query, limit) {
      const hits = catalog.search(query, limit);
      appendToolCatalogAttempt(sink, { ...identity, toolId: SEARCH_TOOLS_TOOL_ID, detail: searchToolsAuditDetail(query, limit ?? null, hits) }, options);
      return hits;
    },
    describe(id) {
      const entry = catalog.describe(id);
      appendToolCatalogAttempt(sink, { ...identity, toolId: DESCRIBE_TOOL_TOOL_ID, detail: describeToolAuditDetail(id, entry) }, options);
      return entry;
    },
  };
}
