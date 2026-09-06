/**
 * @file The admin assistant dock's "API · BYOK" execution mode (ADR-049's picker, see
 * `@jini-ai/chat`'s `AgentRuntimePicker`) — a SECOND, provider-direct run path alongside the
 * existing Local CLI path (`assistant.ts`'s proxy in front of `agent-daemon-server.ts`).
 *
 * Deliberately NOT mounted under `/api/runs` and NOT reusing `assistant.ts`'s run-lifecycle
 * (`POST /api/runs` → `EventSource(GET /api/runs/:runId/events)`, with separate `fetchRunStatus`/
 * `stopRun` requests against a runId the DAEMON tracks). That shape exists because the daemon is a
 * genuinely separate, long-lived process whose runs must be reattachable across an `EventSource`
 * reconnect. A BYOK turn has no such process to reattach to: this route holds the whole
 * request/response open for exactly one turn (mirrors `site-assistant.ts`'s own shape for the
 * public visitor assistant — same reasoning, same author, same day) and streams events on the SAME
 * connection the browser's `fetch()` opened. `apps/admin/src/lib/assistant-transport.ts`'s `startRun`
 * branches on execution mode: Local CLI keeps the existing POST-then-EventSource dance unchanged;
 * BYOK reads this response body directly as one continuous SSE stream.
 *
 * Disclosed cost of that simpler shape (see the 2026-08-04 milestone thread — asked to name what
 * this trades away rather than paper over it): a BYOK turn cannot be reattached after a page reload
 * or a dropped connection — closing the request loses the in-flight turn, the same way closing a
 * `fetch()` would for any other in-page request. `fetchRunStatus`/`stopRun`/`reattachRun` are not
 * implemented for BYOK-originated run ids in `assistant-transport.ts`; a page reload mid-BYOK-turn
 * shows the conversation as it stood, not a resumed stream. Local CLI mode is unaffected — its own
 * genuinely reattachable daemon-run model is untouched by anything in this file.
 *
 * Tool calling: real, not stubbed. `byok-tool-surface.ts` composes the identical
 * `buildAssistantToolRegistrations` catalog the daemon uses (131 tools, 21 domains, the same
 * per-tool `ToolPolicy`), so a BYOK-mode tool call is authorized and executed exactly like a
 * Local-CLI-mode one. MCP-UI confirmation parity: a tool that raises a surface via `ctx.emitSurface`
 * (today: only `content_post_delete`) now genuinely parks rather than failing closed —
 * `handleTurn` below builds a real `SurfaceEmitter` per tool call, writing each emission onto this
 * SAME SSE response as an `agent` event shaped exactly like the daemon path's own wire format (see
 * `toWireSurfacePayload`'s doc), so the already-shipped client-side `translateRunAgentPayload`
 * switch renders it with no new frontend branching. Redemption is `server/modules/assistant.ts`'s
 * job: it holds the SAME `toolSurface.surfaceExchanges` reference this module composed and exposes
 * on its own returned handle (see {@link createAssistantByokModule}'s doc for why `app.ts` captures
 * it that way rather than importing `byok-tool-surface.ts` directly) and tries local delivery before
 * falling back to the daemon's own store. Scope: verified for the `mcp-ui` channel only — see
 * `byok-tool-surface.ts`'s header for what remains out of scope (A2UI).
 *
 * Credential source: see `byok-credential.ts`'s header. As of the server-side keystore (design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved), this
 * module constructs `createStoredExecutionCredentialPort` — a request-supplied key still wins when
 * the browser sends one, and it falls back to this admin's own stored, encrypted row
 * (`admin_execution_credentials`, migration `0026`) when the request omits one.
 */
import { randomUUID } from "node:crypto";

import type { Express, NextFunction, Request, Response } from "express";

import type { Principal, SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";

import {
  type ByokChatMessage,
  type ByokProviderTurnResult,
  type ByokTurnEvent,
  runByokProviderTurn,
  createStoredExecutionCredentialPort,
  type ExecutionCredentialPort,
  type RequestSuppliedByokConfig,
  type ResolvedByokCredential,
  createByokToolSurface,
  type ByokToolSurface,
  type ByokToolSurfaceDeps,
} from "#src/assistant/index";
import { formatCustomInstructionsOverlay, resolveCustomInstructions } from "#src/assistant/custom-instructions";
import { createInMemoryToolAttemptAuditSink } from "#src/features/tool-audit/repo.memory";
import { SqliteToolAttemptAuditSink } from "#src/features/tool-audit/repo.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * Resolves the sink `search_tools`/`describe_tool` calls are logged to when
 * {@link createAssistantByokModule} builds its own default `ByokToolSurface` (a caller-supplied
 * `toolSurface` bypasses this entirely, so no test that injects one pays for a connection it does not
 * need). Mirrors `agent-daemon-server.ts`'s identical `auditSink` construction shape, including its
 * `TOVU_DB=memory` branch and its reason for opening a dedicated handle rather than reusing
 * `RouteDeps`': that type does not expose its own `ContentDb`, by the same design choice documented
 * there — but NOT that function's own path resolution. `agent-daemon-server.ts` runs as a genuinely
 * separate process spawned with `TOVU_SITE_DIR` already set to the real install dir
 * (`daemon-supervisor.ts`'s `buildDaemonSpawnEnvOverrides`), so its own `defaultContentDbPath()` call
 * is correct in that context. This module runs IN-PROCESS with `createApp()`, sharing `routeDeps`
 * with every other module here — `defaultContentDbPath()` would instead recompute the path fresh from
 * `process.cwd()`/env, which disagrees with `routeDeps.contentDbPath` (this composition root's real,
 * already-resolved path) whenever `tovu serve <dir>` was launched with a `<dir>` other than the
 * process's own default site root, or from a cwd other than the install dir (CR-R04's exact
 * scenario) — silently opening (and, since `openContentDb` migrates unconditionally, migrating) a
 * DIFFERENT database than the one this composition root's other 50+ repos read and write. Fixed by
 * reading the path this `RouteDeps` was actually built from — see `RouteDeps.contentDbPath`'s own
 * doc.
 */
function resolveToolAttemptAuditSink(routeDeps: RouteDeps) {
  console.error("[DEBUG] contentDbPath=", routeDeps.contentDbPath, "TOVU_DB=", process.env.TOVU_DB);
  return process.env.TOVU_DB === "memory"
    ? createInMemoryToolAttemptAuditSink()
    : new SqliteToolAttemptAuditSink(openContentDb(routeDeps.contentDbPath));
}

export const BYOK_TURN_PATH = "/api/admin/v1/assistant/byok-turn";

/** Exported so `assistant-byok-routes.test.ts` can assert the exact composed `system` string against
 *  this same literal rather than duplicating it — see {@link resolveByokSystemPrompt}'s doc for the
 *  composition this constant is the fixed half of. */
export const SYSTEM_PREAMBLE =
  "You are the Tovu admin assistant, running with the operator's own AI provider key (BYOK mode). " +
  "Use the tools you are given to inspect and manage this Tovu site on the operator's behalf. " +
  "Keep replies short and direct: lead with the answer, skip preamble and skip restating the " +
  "request. Use headers, lists, or tables only when they carry real structure. Give full detail " +
  "when asked, and never trade correctness for brevity — error text, failing output, and " +
  "confirmations for destructive actions keep their full content. " +
  "Only call tools that exist in your tool list; never invent one.";

/** Bounds one BYOK turn's history the same way `assistant-transport.ts`'s `MAX_TRANSCRIPT_TURNS`
 *  bounds the daemon path's flattened prompt — each turn is a fresh provider request billed for its
 *  whole input, so an unbounded history would make every later message in a long chat more
 *  expensive than the last. */
const MAX_HISTORY_MESSAGES = 40;

/** Raises the bound each `run*ToolTurn` adapter would otherwise take from its own
 *  `DEFAULT_MAX_TOOL_TURNS` (8 — verified directly in all four of `@jini-ai/agent-runtime`'s
 *  `providers/{anthropic-messages,openai-chat,azure-chat,google-messages}.ts`, each of which reads
 *  `options.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS`). 8 is sized for a caller that names a real tool
 *  per action; this route's meta-tool surface costs up to 3 calls per real action
 *  (`search_tools` → `describe_tool` → `execute_delegated_tool`), so 8 truncates an ordinary
 *  multi-step task at roughly its second or third real operation — silently, because a truncated
 *  turn is reported to the client as an ordinary stop. 24 keeps ~6-8 real actions in reach at that
 *  3-calls-each cost. */
const BYOK_MAX_TOOL_TURNS = 24;

/** SSE framing. Local to this module, same convention (and same reason: kept in one place so event
 *  names cannot drift between branches) as `site-assistant.ts`'s identical helper — not shared
 *  cross-module because both are a few lines and neither has a second real caller yet. */
function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function beginStream(req: Request, res: Response): void {
  res.status(200).set({
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    // Same reasoning as `site-assistant.ts`'s identical guard: HTTP/2 throws
    // `ERR_HTTP2_INVALID_CONNECTION_HEADER` on a `connection` header, and dropping it changes
    // nothing observable for an HTTP/1.1 client (keep-alive is already its default there).
    ...(req.httpVersionMajor < 2 ? { connection: "keep-alive" } : {}),
    "x-accel-buffering": "no",
  });
  res.flushHeaders?.();
}

function isPlainMessage(value: unknown): value is { role: unknown; content: unknown } {
  return typeof value === "object" && value !== null;
}

/**
 * Transforms one `SurfaceEmission` into the bare `RunAgentPayload`-shaped object this route's own
 * `sse(res, "agent", ...)` writes onto the wire.
 *
 * Mirrors `@jini-ai/daemon`'s `delegated-tool-bridge.ts` `emitSurface` closure byte-for-byte (traced
 * directly, not inferred): `emission.channel` becomes the payload's `type`, `emission.payload`'s own
 * fields are spread in beside it (after stripping any `type`/`toolUseId` a handler tried to smuggle
 * in, so a handler cannot forge either), and `toolUseId` is injected only for the `'mcp-ui'` channel —
 * the one channel whose client-side renderer (`McpUiSurfaceCard`) actually reads it for correlation.
 * This is what lets `apps/admin/src/lib/assistant-transport.ts`'s already-shipped
 * `translateRunAgentPayload` switch render a BYOK-mode surface exactly like a daemon-mode one, with no
 * new frontend branching — see this module's own header for the full trace.
 *
 * Verified end-to-end for `'mcp-ui'` only (`assistant-byok-routes.test.ts`), the one channel a real
 * catalog tool (`content_post_delete`) uses today. Kept channel-agnostic, like its daemon
 * counterpart, so a future channel is not silently dropped — but an untested channel inherits that
 * counterpart's own disclosed scope, not a new guarantee this function makes.
 *
 * @complexity O(k) in `emission.payload`'s own key count.
 * @overallScore 100
 */
function toWireSurfacePayload(emission: SurfaceEmission, toolUseId: string): Record<string, unknown> {
  const safePayload: Record<string, unknown> = { ...emission.payload };
  delete safePayload.type;
  delete safePayload.toolUseId;
  return {
    ...safePayload,
    type: emission.channel,
    ...(emission.channel === "mcp-ui" ? { toolUseId } : {}),
  };
}

/** One raw history entry -> a valid {@link ByokChatMessage}, or `null` if it isn't one — the single
 *  per-entry validation `resolveMessages` below loops over. */
function toByokChatMessage(entry: unknown): ByokChatMessage | null {
  if (!isPlainMessage(entry)) return null;
  const role = entry.role === "user" || entry.role === "assistant" ? entry.role : null;
  const content = typeof entry.content === "string" ? entry.content : null;
  if (role === null || content === null || content.length === 0) return null;
  return { role, content };
}

/** Validates and bounds the client-supplied history. Fail-soft on individual malformed entries
 *  (dropped, not rejected) — mirrors `site-assistant.ts`'s own `resolveBoundedHistory` posture for
 *  the sibling visitor-assistant route: history is passive background context the caller did not
 *  just author this instant, so a malformed entry degrades the turn's context rather than the whole
 *  request. */
function resolveMessages(raw: unknown): ByokChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ByokChatMessage[] = [];
  for (const entry of raw) {
    const message = toByokChatMessage(entry);
    if (message) messages.push(message);
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

/**
 * Composes this route's `system` prompt: {@link SYSTEM_PREAMBLE} plus the admin Instructions tab's
 * custom overlay (`core.instructions.custom`), when the operator has set one — same composition order
 * and separator as the Local CLI path's own `systemOverlay()` (`agent-daemon-server.ts`: `` `${base}
 * \n\n${custom}` `` when a custom overlay exists, the bare base otherwise), so an operator's custom
 * instructions apply identically in both execution modes rather than only to Local CLI runs.
 *
 * Re-reads `core.instructions.custom` fresh on every call rather than caching it at module load or
 * across turns: this route has no long-lived process to refresh a cache against between requests (each
 * `handleTurn` invocation is its own request/response lifecycle), so a plain re-read is both simpler
 * and sufficient here — unlike the Local CLI path, which needs `custom-instructions.ts`'s
 * `createCustomInstructionsCache` bridge specifically because `PromptAugmenter.systemOverlay()` is
 * called synchronously inside the daemon's `run()`. `resolveCustomInstructions` never throws (fails
 * open to `""` on any read error) and `formatCustomInstructionsOverlay` returns `null` for unset,
 * empty, or whitespace-only text, so an operator who has never opened the Instructions tab gets exactly
 * {@link SYSTEM_PREAMBLE} back, unchanged.
 *
 * @complexity O(1) — one `resolveCustomInstructions` read (itself O(1)) plus a trim/length check.
 * @overallScore 100
 */
async function resolveByokSystemPrompt(routeDeps: RouteDeps): Promise<string> {
  const customInstructions = await resolveCustomInstructions(
    {
      settingsRepo: routeDeps.settingsRepo,
      settingsReady: routeDeps.settingsUiTabsReady,
      getEffective: routeDeps.getEffective,
      instructionsNamespace: routeDeps.instructionsNamespace,
    },
    { workspaceId: routeDeps.workspaceId },
  );
  const customOverlay = formatCustomInstructionsOverlay(customInstructions);
  return customOverlay === null ? SYSTEM_PREAMBLE : `${SYSTEM_PREAMBLE}\n\n${customOverlay}`;
}

/**
 * Return type widened past the generic {@link ServerModuleHandle} to also expose the composed
 * `toolSurface` — specifically so `app.ts` can capture `.toolSurface.surfaceExchanges` and hand it to
 * `createAssistantModule`'s redemption proxy WITHOUT importing `byok-tool-surface.ts` directly
 * itself. That's not a style preference: `app.ts` already transitively reaches `byok-tool-surface.ts`
 * through this module (which has always imported it), so reading the value off this return object
 * costs the composition root zero new edges in the dependency graph; a direct
 * `import { createByokToolSurface } from "../assistant/byok-tool-surface"` in `app.ts` would add one,
 * and — traced empirically via `npm run check:architecture` before landing this — that one new edge
 * from the highest-fan-out file in the whole codebase was enough to flip ~17 other files into the
 * "core" classification (both fan-in and fan-out above the graph median), regressing that ratcheted
 * metric. This shape gets the identical runtime behavior (one surface, built once, shared by both
 * modules) for zero graph cost.
 */
export interface AssistantByokModuleHandle extends ServerModuleHandle {
  readonly toolSurface: ByokToolSurface;
}

/**
 * @param toolSurface - Defaults to a fresh `createByokToolSurface(routeDeps)`, built once right here
 * when the caller doesn't supply one — the production path (`app.ts`) always takes this default, so
 * it never needs its own `byok-tool-surface.ts` import (see {@link AssistantByokModuleHandle}'s doc
 * for why that specifically matters). The explicit parameter exists for tests that need to observe or
 * override the composed surface — e.g. injecting a short-TTL `surfaceExchangeStore` via
 * `createByokToolSurface`'s own override to prove the no-hang bound in milliseconds rather than the
 * production 5.5-minute ceiling — without which this module would have no seam to reach it through.
 * Optional (rather than a plain default parameter) specifically so
 * `installFirstPartyToolContributors()` below is guaranteed to run BEFORE the default
 * `createByokToolSurface(routeDeps)` construction, not as part of evaluating this function's own
 * argument list — a default-parameter expression evaluates before the function body starts, which
 * would be too early for the install call to have any effect on the surface it composes.
 */
type ByokTurnInputs = { messages: ByokChatMessage[]; principal: Principal; credential: ResolvedByokCredential };

/**
 * The two gates `handleTurn` must clear before it opens a stream: the client-supplied history must
 * resolve to a non-empty, user-ending message list, and a usable BYOK credential (request-supplied
 * or the admin's own stored row) must resolve. Both can end the request on their own; consolidated
 * here so `handleTurn` itself is a single `if (!inputs) return;` rather than two separate guards.
 */
async function resolveTurnInputsOrRespond(
  req: Request,
  res: Response,
  credentialPort: ExecutionCredentialPort,
  routeDeps: RouteDeps,
): Promise<ByokTurnInputs | null> {
  const body = (req.body ?? {}) as { messages?: unknown; byok?: RequestSuppliedByokConfig };
  const messages = resolveMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    res.status(400).json({ error: "'messages' must end with a non-empty user message", code: "VALIDATION_ERROR" });
    return null;
  }

  const authed = getAuthedPrincipal(res);
  const credential = await credentialPort.resolve({
    requestBody: body.byok ?? {},
    workspaceId: routeDeps.workspaceId,
    principalId: authed.id,
  });
  if (!credential) {
    res.status(400).json({
      error:
        "no usable BYOK credential — supply 'byok' with a supported protocol, a non-empty apiKey, and a model, or save one first in Settings",
      code: "VALIDATION_ERROR",
    });
    return null;
  }

  return { messages, principal: { id: authed.id }, credential };
}

export function createAssistantByokModule(
  routeDeps: RouteDeps,
  toolSurface?: ByokToolSurface,
): AssistantByokModuleHandle {
  // Must run before `createByokToolSurface` (below, or the caller's own instance's earlier
  // construction) calls `buildAssistantToolRegistrations`: that function reads whatever
  // `assistant/tool-contribution-registry.ts` currently holds, and the registry starts empty every
  // process boot. See `tool-catalog-manifest.ts`'s own header for why this call lives here and in
  // `agent-daemon-server.ts`, and nowhere else. Idempotent, so a test supplying its own `toolSurface`
  // (built from an already-installed registry) pays nothing extra for this still running.
  installFirstPartyToolContributors();
  // `routeDeps`'s declared type here is `RouteDeps` (this function's own parameter above), which is
  // honestly narrower than what `createByokToolSurface` needs (`ByokToolSurfaceDeps` — every
  // `AssistantToolRegistryDeps` field, including all 10 of `NewsletterToolDeps`'s own). The real
  // object this is always called with (`app.ts`'s `createApp(routeDeps: RouteDeps =
  // createRouteDeps())`) already carries them — `createRouteDeps()`'s actual return type is
  // `NewsletterRouteDeps`, a superset of `RouteDeps` — the same structural-narrowing gap
  // `server/app.ts`'s own `newsletterAdminDeps = routeDeps as NewsletterRouteDeps` cast documents and
  // accepts at the identical seam, a few hundred lines away in the same composition root.
  //
  // Unlike that precedent, a SINGLE cast is not available here: `NewsletterRouteDeps extends
  // RouteDeps` is a declared nominal relationship, so TypeScript accepts `routeDeps as
  // NewsletterRouteDeps` outright. `ByokToolSurfaceDeps` declares no such relationship to `RouteDeps`
  // — verified empirically, not assumed: `routeDeps as ByokToolSurfaceDeps` alone fails with TS2352
  // ("neither type sufficiently overlaps... convert the expression to 'unknown' first"), naming the
  // exact same `NewsletterToolDeps` fields TS2345 named when this parameter's own type was
  // `Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter">` outright (`npx tsc -p tsconfig.json
  // --noEmit`, both checked directly before choosing this form). The `unknown` detour below is
  // TypeScript's own required spelling for "these two types don't provably overlap, trust the
  // runtime invariant" — the same one-step escape hatch `byok-tool-surface.ts` used to need
  // internally before its own signature was made honest; it now lives at the one remaining seam
  // where the type information is actually insufficient, not two stacked assumptions.
  //
  // Widening this function's own `routeDeps: RouteDeps` parameter to close the gap structurally
  // (instead of casting) would ripple into `app.ts`'s `createApp` signature and every test that
  // constructs a bare `RouteDeps` fixture for this module — a behavior-preserving but far wider
  // change than this narrowing pass's scope.
  const resolvedToolSurface =
    toolSurface ??
    createByokToolSurface(routeDeps as unknown as ByokToolSurfaceDeps, {
      toolAttemptAudit: { sink: resolveToolAttemptAuditSink(routeDeps), workspaceId: routeDeps.workspaceId },
    });
  const credentialPort = createStoredExecutionCredentialPort({
    repo: routeDeps.adminExecutionCredentialRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
  });

  return {
    name: "assistant-byok",
    toolSurface: resolvedToolSurface,
    registerRoutes: (app: Express) => {
      app.use(BYOK_TURN_PATH, requireAdminSession(routeDeps));
      app.post(BYOK_TURN_PATH, (req: Request, res: Response, next: NextFunction) => {
        void handleTurn(req, res).catch((error: unknown) => {
          console.error("[assistant-byok] unhandled error", error);
          if (res.headersSent) {
            sse(res, "error", { message: "assistant failed" });
            res.end();
          } else {
            next(error);
          }
        });
      });
    },
  };

  async function handleTurn(req: Request, res: Response): Promise<void> {
    const inputs = await resolveTurnInputsOrRespond(req, res, credentialPort, routeDeps);
    if (!inputs) return;
    const { messages, principal, credential } = inputs;
    const system = await resolveByokSystemPrompt(routeDeps);

    const run = { id: randomUUID() };

    beginStream(req, res);
    // Same reasoning as `site-assistant.ts`'s identical guard: a browser tab closing must stop the
    // upstream provider call and any in-flight tool execution, not run to completion unobserved.
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });

    // Dispatches against the META-tool set, not the raw catalog: `call.name` is one of
    // `search_tools`/`describe_tool`/`execute_delegated_tool`, and a real tool id arrives as the
    // third one's `toolId` argument. The unwrap, the status mapping, and the "model named something
    // that isn't callable" case all live in `byok-tool-surface.ts` beside the descriptors that
    // create them, so the two cannot drift apart. Authorization is unmoved by any of this — see
    // `META_TOOL_DESCRIPTORS`' own doc.
    //
    // `emitSurface` is built fresh per call (not once for the whole turn), because it needs THIS
    // call's own `call.id` as the correlation `toolUseId` a rendered mcp-ui card is tagged with —
    // `runByokProviderTurn`'s adapters invoke `executeTool` once per model-issued tool call, so a new
    // closure per invocation costs nothing a turn with real tool calls wasn't already paying.
    const executeTool = (call: { id: string; name: string; input: unknown }) => {
      const emitSurface: SurfaceEmitter = async (emission) => {
        sse(res, "agent", toWireSurfacePayload(emission, call.id));
      };
      return resolvedToolSurface.executeMetaTool(principal, run, call, abort.signal, emitSurface);
    };

    let result: ByokProviderTurnResult;
    try {
      result = await runByokProviderTurn({
        protocol: credential.protocol,
        apiKey: credential.apiKey,
        ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
        model: credential.model,
        ...(credential.maxTokens !== undefined ? { maxTokens: credential.maxTokens } : {}),
        maxToolTurns: BYOK_MAX_TOOL_TURNS,
        system,
        messages,
        // 3 descriptors, not all 131. The full catalog is ~119 KB (~30 k tokens) of `inputSchema`
        // re-sent on EVERY message; the meta-set is under 1 KB and reaches the same tools through
        // `search_tools` → `describe_tool` → `execute_delegated_tool`. See `META_TOOL_DESCRIPTORS`.
        tools: resolvedToolSurface.metaTools,
        executeTool,
        signal: abort.signal,
        // `error`-typed events get their OWN SSE event name, not folded into `agent` — mirrors the
        // daemon path's distinct `source.addEventListener("error", ...)` on the client
        // (`assistant-transport.ts`), which is what actually calls `handlers.onError` rather than
        // rendering an unrecognized `ext` event. Everything else rides `agent` unchanged, reusing
        // `translateRunAgentPayload`'s existing switch on the client with zero new cases.
        onEvent: (event: ByokTurnEvent) => sse(res, event.type === "error" ? "error" : "agent", event),
      });
    } catch (error) {
      sse(res, "error", { type: "error", message: error instanceof Error ? error.message : String(error) });
      sse(res, "end", { reason: "error" });
      res.end();
      return;
    }

    sse(res, "end", { reason: result.stopReason ?? "stop" });
    res.end();
  }
}
