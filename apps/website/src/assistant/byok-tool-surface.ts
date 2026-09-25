/**
 * @file Composes a SECOND, in-process copy of the admin's real tool surface — for the BYOK execution
 * path, which runs inside Tovu's main server process rather than the separately-spawned agent daemon
 * (`agent-daemon-server.ts`, a distinct OS process — see that file's own header). This is not a
 * smaller/simplified tool surface: `buildAssistantToolRegistrations` is the exact same function the
 * daemon itself calls, given the exact same kind of deps bag, so BYOK mode sees the identical 131-tool,
 * 21-domain catalog and the identical per-tool `ToolPolicy` authorization the Local CLI path already
 * enforces. Two independent compositions of the same pure functions, not two different tool surfaces
 * (traced and confirmed in the 2026-08-04 milestone report to the Coordinator before this was written).
 *
 * `createToolRegistry` is `@jini-ai/core`'s own public, side-effect-only-at-call export — nothing
 * here reaches into its internals, and nothing here talks MCP or spawns a process.
 * `agent-daemon-server.ts:196-201,272` builds its own registry the exact same way; this module is a
 * second, independent caller of the same public API, not a fork of it. The EXECUTOR half is no
 * longer a second independent call, as of the 2026-09-06 parity fix: both this module and the daemon
 * now build theirs through `tool-executor-stack.ts`'s shared `createAssistantToolExecutor`, so the
 * read-only gate, the attempt audit, and the failure-recovery loop are the identical composition for
 * both surfaces rather than two hand-assembled copies that could (and once did) drift — see that
 * file's own header.
 *
 * `surfaceExchanges` (exposed on {@link ByokToolSurface}) is a FRESH store, not shared with the
 * daemon's — it never could be; see `surface-exchanges.ts`'s own module doc for why an open exchange
 * is inherently in-process. What used to be a disclosed gap here (a tool that parks via
 * `ctx.emitSurface` had nowhere in this process to be redeemed) is closed as of the redemption slice:
 * `executeMetaTool` now accepts an `emitSurface` and threads it straight into
 * `ToolExecutor.execute`'s own optional 6th argument, so a BYOK-mode tool call gets a real, live
 * surface seam exactly like the daemon path does. `assistant-byok.ts` builds the `SurfaceEmitter` from
 * its own SSE response and `server/modules/assistant.ts`'s redemption proxy tries THIS store first
 * (falling back to the daemon's only on `unknown-or-closed`) — see that module's own doc for the other
 * half. Scope actually verified end-to-end (`assistant-byok-routes.test.ts`): the MCP-UI channel only,
 * via `content_post_delete`, the one production tool that reads `ctx.emitSurface` today. The A2UI
 * route (`/api/admin/v1/a2ui/actions`) tries THIS store first as well (`proxyA2uiAction` in the same
 * module), so `assistant_render_ui`'s renderer rejection reaches a BYOK run.
 */
import {
  createToolRegistry,
  type Principal,
  type RunRef,
  type SurfaceEmitter,
  type ToolDescriptor,
  type ToolRegistry,
} from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";
import type { ToolCatalogQuery } from "@jini-ai/http-kit";

import { registerSupabaseMcpPreset } from "#src/features/plugins/supabase-mcp/supabase-mcp-plugin";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../contracts/core/tool-surface-exchanges.js";
import type { ToolAttemptAuditSink } from "../features/tool-audit/types.js";
import { appendToolCatalogAttempt, DESCRIBE_TOOL_TOOL_ID, describeToolAuditDetail, SEARCH_TOOLS_TOOL_ID, searchToolsAuditDetail } from "./tool-catalog-audit.js";
import { withFederatedRefusalDiagnosis } from "./federated-refusal-diagnosis.js";
import { buildExternalMcpFederationDeps, createStoredExternalMcpConnectionSource } from "./external-mcp-connection-source.js";
import { attachAssistantToolExtensions } from "./installed-extension-tools.js";
import type { FederationRuntime } from "./external-mcp-federation-runtime.js";
import type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpSessionPort } from "./mcp-federation/ports.js";
import { buildToolCatalogQuery, listToolCatalogEntries } from "./tool-catalog-query.js";
import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "./tool-registrations.js";
import { createAssistantToolExecutor } from "./tool-executor-stack.js";

/** What one meta-tool call resolves to — deliberately the exact `{content, isError?}` shape
 *  `byok-provider-turn.ts`'s `ByokToolExecutor` contract returns, so the route hands this straight
 *  back to the provider adapter with no second mapping layer of its own. */
export interface ByokMetaToolResult {
  readonly content: string;
  readonly isError?: boolean;
}

export interface ByokToolSurface {
  readonly registry: ToolRegistry;
  readonly executor: ToolExecutor;
  /** The 3 descriptors actually sent to the provider — see {@link META_TOOL_DESCRIPTORS}. */
  readonly metaTools: readonly ToolDescriptor[];
  /**
   * Backs the held-open-call return path for a BYOK-mode tool call (mirrors `agent-daemon-server.ts`'s
   * identical exposure of its own store). `server/modules/assistant-byok.ts` composes this surface
   * once at boot and hands this SAME reference to `server/modules/assistant.ts` so its redemption
   * proxy can deliver into it directly — a second, independent store here would leave every BYOK-mode
   * confirmation exchange unreachable from the browser.
   */
  readonly surfaceExchanges: SurfaceExchangeStore;
  /** Dispatches one model-issued call against the meta-tool set. Never throws for model-controlled
   *  input (an unknown id, a malformed argument): those come back as `isError` content the model can
   *  read and retry against.
   *
   * @param emitSurface - Forwarded verbatim into `ToolExecutor.execute`'s own optional 6th argument
   * (see that method's doc). Omit for a caller with no live response to emit into; a tool that reads
   * `ctx.emitSurface` (today: only `content_post_delete`) fails closed rather than parking when it is
   * absent — see that handler's own doc for why no fallback exists. */
  readonly executeMetaTool: (
    principal: Principal,
    run: RunRef,
    call: { readonly name: string; readonly input: unknown },
    signal?: AbortSignal,
    emitSurface?: SurfaceEmitter,
  ) => Promise<ByokMetaToolResult>;
  /**
   * Resolves once the installed-extension-tools pass (`installed-extension-tools.ts` — Agent
   * Plugins, Agent Skills, enabled plugin-capability tools) has finished applying to `registry` and
   * this surface's `search_tools`/`describe_tool` catalog has been rebuilt to include whatever it
   * added. Never rejects, since that pass is fail-open by construction. A turn started before this
   * resolves would still be able to EXECUTE a just-installed extension tool via
   * `execute_delegated_tool` (the registry already has it), but could not yet DISCOVER it via
   * `search_tools`/`describe_tool` — `modules/assistant-byok.ts`'s turn route awaits this once before
   * dispatching, so only the very first turn after boot ever pays that gap. Resolves immediately (no
   * disk read) when the surface was built with `installExtensions: false`.
   */
  readonly ready: Promise<void>;
  /**
   * This surface's own `FederationRuntime` (`external-mcp-federation-runtime.ts`) — the SAME
   * runtime shape `attachAssistantToolExtensions` hands the daemon, built but never started here:
   * unlike the daemon, BYOK never awaits `federation.start()` at construction, so building this
   * surface stays free of the external-MCP roster read and every child-process spawn it would
   * otherwise trigger. `undefined` when this surface was built with `installExtensions: false` —
   * there is nothing to federate without the installed-extension pass ahead of it (see
   * `attachAssistantToolExtensions`'s own doc for why the two are one registrar).
   */
  readonly federation?: FederationRuntime;
  /**
   * Starts (or, if already started, awaits) `federation.start()`, racing it against a `timeoutMs`
   * timer so a turn that touches an external-MCP tool never blocks forever on a slow or wedged
   * remote server. `federation.start()` is single-flight (see that method's own doc): a timeout
   * here does not cancel the boot pass, which keeps running in the background and still becomes
   * searchable once it finishes — only the CALLER stops waiting. `{settled: true}` once the boot
   * pass has actually completed and this surface's `search_tools`/`describe_tool` catalog has been
   * rebuilt to include whatever it admitted; `{settled: false}` only on a timeout. `{settled: true}`
   * immediately, with no timer started, when `federation` is `undefined` — nothing is connecting, so
   * the turn route must not append its "still connecting" note.
   */
  readonly awaitFederation: (timeoutMs: number) => Promise<{ readonly settled: boolean }>;
}

/** Bounds `search_tools`' `limit`, mirroring `@jini-ai/http-kit`'s `tool-catalog.ts`
 *  (`MAX_SEARCH_LIMIT = 25`, `DEFAULT_SEARCH_LIMIT = 10`) exactly. Declared here rather than
 *  imported because that module keeps them private to its own route parser; the values are the
 *  contract, and stating them in the schema means the model is told the same bounds this dispatch
 *  actually enforces instead of having a silently-clamped one applied behind its back. */
const SEARCH_LIMIT_MAX = 25;
const SEARCH_LIMIT_DEFAULT = 10;

/**
 * The 3 tools a BYOK turn actually publishes to the provider, in place of all 131 real ones.
 *
 * Why: a `ToolDescriptor` carries its full `inputSchema`, so publishing the real catalog costs
 * ~119 KB (~30 k tokens) on EVERY message of every conversation — measured, not estimated, against
 * the live registry. These 3 descriptors are under 1 KB. The model finds what it needs by searching
 * rather than by being handed everything up front, which is the same staged-discovery design
 * `@jini-ai/mcp`'s `search_tools`/`describe_tool`/`execute_delegated_tool` already use for the
 * spawned-CLI path — the names, descriptions, and argument shapes below deliberately match that
 * package's own defs (`server/tools/tool-catalog-tools.ts`, `server/tools/delegated-tool.ts`) so a
 * model that has seen one surface is not relearning a second dialect for the other.
 *
 * NOT a security boundary, and must not be mistaken for one. Authorization lives inside each tool's
 * own handler via `ToolPolicy`, one hop BELOW dispatch — `ToolExecutor.execute` consults it no
 * matter how the id reached it, so resolving an id through `execute_delegated_tool` grants exactly
 * what naming the tool directly would have granted, and no more. Narrowing what the model can SEE
 * is a payload optimization; what it may DO is unchanged.
 *
 * `execute_delegated_tool` takes no `runId`, unlike its MCP counterpart, and that difference is
 * deliberate rather than an omission: the MCP def closes over a run id because its server process
 * is scoped to one run for its lifetime. Here the route already holds the run it created for this
 * request and passes it into `executeMetaTool` directly, so there is no per-call argument for a
 * model to supply — and therefore no confused-deputy path where one run's turn executes "as"
 * another, which is the property that def's own doc says the closure exists to protect.
 */
export const META_TOOL_DESCRIPTORS: readonly ToolDescriptor[] = [
  {
    id: "search_tools",
    description:
      "Search this Tovu site's tool catalog. Returns ranked {id, description, source, score} candidates only — no input schemas, so this stays cheap to call broadly. Call describe_tool on the 1-3 candidates that look right before calling execute_delegated_tool. If nothing in the results fits, re-search with a higher limit or different phrasing rather than assuming the tool does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Describe what the tool you need DOES, the way its own documentation would describe it — a full phrase, not a keyword bag. Name the thing being acted on and the action, and include likely synonyms for both. Example: for an operator asking \"how many people visited last week\", write \"retrieve site traffic and visitor analytics counts for a date range\" rather than \"visitors last week\". Descriptive phrasing retrieves substantially better here than terse keywords, because the catalog is matched on tool descriptions. Required.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: SEARCH_LIMIT_MAX,
          description:
            `Max hits to return (1-${SEARCH_LIMIT_MAX}). Optional, defaults to ${SEARCH_LIMIT_DEFAULT}. ` +
            `If none of the returned candidates fit what you need, search again with a HIGHER limit (try ${SEARCH_LIMIT_MAX}) ` +
            `and different phrasing before concluding no tool exists — a differently-worded or wider search often surfaces a tool the ` +
            `default cutoff missed, so a miss at the default limit is weak evidence, not proof that no matching tool exists. If a retry ` +
            `with different terms still finds nothing, say you could not find a matching tool rather than assuming none exists.`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    id: "describe_tool",
    description:
      "Get the full descriptor for one tool id found via search_tools — its description and its input schema. Paid for only on the candidates that survive search, per the tool catalog's staged-discovery design.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Tool id returned by search_tools. Required." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    id: "execute_delegated_tool",
    description:
      "Execute one of this site's registered tools by id, routed through the same ToolExecutor deny-by-default gate every other tool-execution path here uses. Call describe_tool first so the input matches that tool's schema. Returns the tool's own result, or an error message explaining what to fix.",
    inputSchema: {
      type: "object",
      properties: {
        toolId: { type: "string", description: "Registry tool id to invoke, as returned by search_tools. Required." },
        input: {
          // `type: "object"` is load-bearing, for the reason `@jini-ai/mcp`'s own `delegated-tool.ts`
          // records against a real 2026-07-26 observation: declared without one, at least one client
          // delivers the model's object as a JSON-encoded STRING, and every tool here rejects a
          // string input by name rather than coercing it — the effect is that only no-input tools
          // stay callable. `resolveDelegatedInput` below ALSO accepts that string form defensively,
          // because this path now spans four providers rather than one client and the failure is
          // both silent and total.
          type: "object",
          additionalProperties: true,
          description:
            "JSON object of input fields for the tool, matching the schema describe_tool returned. Optional; omit for a tool that takes no input. Must be an object, not a JSON-encoded string.",
        },
      },
      required: ["toolId"],
      additionalProperties: false,
    },
  },
];

const META_TOOL_IDS: ReadonlySet<string> = new Set(META_TOOL_DESCRIPTORS.map((tool) => tool.id));

/** True for the meta-tool argument bags this dispatch accepts — a model can emit anything, including
 *  `null` or a bare string, and every read below has to survive that. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function err(content: string): ByokMetaToolResult {
  return { content, isError: true };
}

function ok(output: unknown): ByokMetaToolResult {
  return { content: typeof output === "string" ? output : JSON.stringify(output ?? null) };
}

/**
 * Normalizes `execute_delegated_tool`'s `input` argument into what a tool handler accepts.
 *
 * Three shapes are allowed in, deliberately: an object (the declared contract), absent/null (a tool
 * that takes no input), and a JSON-encoded object string. The last is not sloppiness — see the
 * schema comment above: it is a real, observed provider behavior whose failure mode is every
 * input-taking tool silently becoming uncallable. A string that does not parse, or parses to a
 * non-object, is refused with a message naming the problem rather than passed down to fail inside a
 * handler's own type check where the model would see a far less actionable error.
 */
type DelegatedInputResolution =
  | { readonly ok: true; readonly input: unknown }
  | { readonly ok: false; readonly message: string };

/** The string-input branch of {@link resolveDelegatedInput}, split out purely to keep that function's
 *  cognitive complexity under the shop ceiling — see this file's `@file` doc for why a JSON-encoded
 *  string has to be accepted here at all. */
function resolveDelegatedInputFromString(trimmed: string): DelegatedInputResolution {
  if (trimmed.length === 0) return { ok: true, input: undefined };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed)) return { ok: true, input: parsed };
    return { ok: false, message: "'input' parsed as JSON but is not an object — send a JSON object of the tool's input fields." };
  } catch {
    return { ok: false, message: "'input' must be a JSON object of the tool's input fields, not a plain string." };
  }
}

function resolveDelegatedInput(raw: unknown): DelegatedInputResolution {
  if (raw === undefined || raw === null) return { ok: true, input: undefined };
  if (isRecord(raw)) return { ok: true, input: raw };
  if (typeof raw === "string") return resolveDelegatedInputFromString(raw.trim());
  return { ok: false, message: `'input' must be a JSON object of the tool's input fields, not ${Array.isArray(raw) ? "an array" : typeof raw}.` };
}

/**
 * Real identity for one meta-tool call, forwarded into {@link appendToolCatalogAttempt} when
 * `search_tools`/`describe_tool` run. Unlike the Local CLI's `withToolCatalogAudit` (whose
 * `runId`/`principalId` are FIXED for the whole process, per that module's own doc), BYOK's
 * `executeMetaTool` already has the real per-call `principal`/`run` — this carries them straight
 * through rather than losing them to a placeholder. `undefined` when `createByokToolSurface` was not
 * given a sink (e.g. a test composing a bare surface), in which case neither branch logs at all.
 */
type MetaToolCatalogAudit = { readonly sink: ToolAttemptAuditSink; readonly workspaceId: string; readonly principalId: string; readonly runId: string };

/** `search_tools` branch of {@link createByokToolSurface}'s `executeMetaTool` dispatcher — split out
 *  purely to keep that function's complexity under the shop ceiling; behavior is unchanged. */
function runSearchTools(
  catalog: ToolCatalogQuery,
  registry: Pick<ToolRegistry, "list">,
  args: Record<string, unknown>,
  audit: MetaToolCatalogAudit | undefined,
): ByokMetaToolResult {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length === 0) return err("'query' is required and must be a non-empty string.");
  const rawLimit = args.limit;
  // Clamp rather than reject: `limit` is an optimization hint, not part of what the caller is
  // asking for, so an out-of-range one should not cost a whole turn to correct.
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), SEARCH_LIMIT_MAX)
      : SEARCH_LIMIT_DEFAULT;
  const hits = catalog.search(query, limit);
  if (audit) {
    appendToolCatalogAttempt(audit.sink, {
      workspaceId: audit.workspaceId,
      runId: audit.runId,
      principalId: audit.principalId,
      toolId: SEARCH_TOOLS_TOOL_ID,
      detail: searchToolsAuditDetail(query, limit, hits),
    });
  }
  if (hits.length === 0) {
    return ok({ hits: [], note: `No tool matched "${query}". Try broader or different keywords — this catalog has ${registry.list().length} tools.` });
  }
  return ok({ hits });
}

/** `describe_tool` branch — see {@link runSearchTools}'s doc for why this is split out. */
function runDescribeTool(catalog: ToolCatalogQuery, args: Record<string, unknown>, audit: MetaToolCatalogAudit | undefined): ByokMetaToolResult {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (id.length === 0) return err("'id' is required and must be a non-empty string.");
  const entry = catalog.describe(id);
  if (audit) {
    appendToolCatalogAttempt(audit.sink, {
      workspaceId: audit.workspaceId,
      runId: audit.runId,
      principalId: audit.principalId,
      toolId: DESCRIBE_TOOL_TOOL_ID,
      detail: describeToolAuditDetail(id, entry),
    });
  }
  if (!entry) return err(`No tool with id "${id}". Use search_tools to find a valid id.`);
  return ok(entry);
}

/** Maps one `ToolExecutor.execute` outcome onto the meta-tool result shape — split out of
 *  {@link runExecuteDelegatedTool} so its per-case branching does not also count against that
 *  function's own complexity. */
function mapToolExecutionResult(result: Awaited<ReturnType<ToolExecutor["execute"]>>, toolId: string): ByokMetaToolResult {
  switch (result.status) {
    case "completed":
      return ok(result.output);
    case "denied":
      return err(`tool "${toolId}" was denied for this caller`);
    case "confirmation-denied":
      return err(`tool "${toolId}" requires human confirmation, which BYOK mode cannot supply yet`);
    case "timed-out":
      return err(`tool "${toolId}" timed out`);
    case "cancelled":
      return err(`tool "${toolId}" was cancelled`);
    case "failed":
      return err(result.error ?? `tool "${toolId}" failed`);
  }
}

/** `execute_delegated_tool` branch — see {@link runSearchTools}'s doc for why this is split out. */
async function runExecuteDelegatedTool(
  executor: ToolExecutor,
  principal: Principal,
  run: RunRef,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  emitSurface: SurfaceEmitter | undefined,
): Promise<ByokMetaToolResult> {
  const toolId = typeof args.toolId === "string" ? args.toolId.trim() : "";
  if (toolId.length === 0) return err("'toolId' is required and must be a non-empty string.");
  const resolvedInput = resolveDelegatedInput(args.input);
  if (!resolvedInput.ok) return err(resolvedInput.message);

  try {
    const result = await executor.execute(principal, run, toolId, resolvedInput.input, signal, emitSurface);
    return mapToolExecutionResult(result, toolId);
  } catch (error) {
    // `ToolExecutor.execute` THROWS on an id it does not know (`unknown tool "<id>"`) rather than
    // returning a status for it. That was unreachable while the model could only name tools from
    // a list it was handed; with a meta-tool set the id is free-form model output, so a
    // hallucinated or misremembered id is now an ordinary, expected event — and an uncaught throw
    // here would abort the entire turn's stream instead of costing one recoverable tool call.
    const message = error instanceof Error ? error.message : String(error);
    return err(`${message}. Use search_tools to find a valid tool id.`);
  }
}

/**
 * Builds one fresh registry+executor pair over the full admin tool catalog.
 *
 * `magicLinkPerEmailLimiter` is built here rather than accepted as a parameter: it is the one field
 * `AssistantToolRegistryDeps` needs beyond plain `RouteDeps` (`MembersToolDeps`'s own requirement,
 * verified against `members/tool-registrations.ts` — not `IdentityToolDeps`, which declares no such
 * field, contrary to what an earlier version of this comment claimed) — see
 * `agent-daemon-server.ts:172-183`'s identical note on why this is computed, not stored on
 * `routeDeps`), and building a second, independent limiter instance here is correct: it is a
 * per-process request-rate counter, not shared state that would need to be the SAME instance as
 * `server/app.ts`'s own `membersDeps` limiter to behave correctly — two admins hitting
 * `members_request_magic_link` through two different entry points (the ordinary members route vs. a
 * BYOK-run tool call) sharing one counter would be a coupling this module has no reason to introduce.
 *
 * Call once per server boot (mirrors `agent-daemon-server.ts`'s own module-scope `const registry =
 * ...`), not per request — `ToolRegistry` is append-only and rebuilding it per request would be
 * needless repeated work for a structure that never changes after boot.
 *
 * @param options.surfaceExchangeStore - Injectable override for the exchange store this surface
 * opens confirmation parks against. Omit to get a fresh store on its own default TTLs (production
 * behavior — see `surface-exchanges.ts`'s `DEFAULT_SURFACE_IDLE_TTL_MS`/`DEFAULT_SURFACE_MAX_LIFETIME_MS`).
 * Exists so a test can inject one built with short TTLs and observe the bounded-resolution property
 * in milliseconds instead of actually waiting out the production 5.5-minute ceiling.
 * @complexity O(t) in the total wired-tool count (131 today) — the one-time cost of assembling every
 * domain's registrations; O(1) thereafter per `execute()` call (see `@jini-ai/daemon`'s own
 * `createToolExecutor` doc).
 * @overallScore 100
 */
/** Everything {@link createByokToolSurface} needs from its caller — every `AssistantToolRegistryDeps`
 *  field except `magicLinkPerEmailLimiter` (see the doc above) and `listCatalogTools` (bound to this
 *  surface's own registry, so `site_describe_capabilities` lists the catalog this surface serves),
 *  both of which this function builds itself.
 *  Exported so a caller that must cast into this shape (today: `modules/assistant-byok.ts`, whose own
 *  `routeDeps: RouteDeps` parameter is narrower than what it actually always receives at runtime —
 *  see that module's own comment) can cast to a named type instead of repeating this `Omit`. */
export type ByokToolSurfaceDeps = Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter" | "listCatalogTools">;

export function createByokToolSurface(
  routeDeps: ByokToolSurfaceDeps,
  options: {
    readonly surfaceExchangeStore?: SurfaceExchangeStore;
    /**
     * Where every tool-execution attempt is logged, for BOTH halves of this surface: the two
     * meta-tools (`search_tools`/`describe_tool`, via `tool-catalog-audit.ts`'s own
     * `appendToolCatalogAttempt` — a single "completed"-phase row per call, there being no
     * two-phase lifecycle for a catalog read) AND every real tool `execute_delegated_tool` resolves
     * to (via `withToolAttemptAudit` wrapping `executor` below — the same `requested`-then-final-phase
     * decorator `agent-daemon-server.ts` wraps its own executor with). Before 2026-09-02 this option
     * only reached the first half: a BYOK-mode `custom_credential_verify` or any other real tool call
     * left no durable trail at all, even though the search that found it did — see
     * `byok-tool-surface.test.ts`'s matching INCIDENT FIX test. Omitted, neither half is logged — a
     * test composing a bare surface pays nothing extra. Production (`assistant-byok.ts`) always
     * supplies this.
     */
    readonly toolAttemptAudit?: { readonly sink: ToolAttemptAuditSink; readonly workspaceId: string };
    /**
     * Whether this surface also registers installed Agent Plugin, Agent Skill, and enabled
     * plugin-capability tools (`installed-extension-tools.ts`) onto its own registry. Defaults to
     * `true` — every real caller wants these. Set `false` only for a `routeDeps` stub that does not
     * carry `discoverPlugins`/`postRepo`/`pluginActivationRepo` (a bare `AssistantToolRegistryDeps`
     * unit-test double): the registrar is fail-open either way, so a missing field there would only
     * cost a swallowed `console.warn` per call, not a test failure, but there is no reason to pay it.
     */
    readonly installExtensions?: boolean;
    /**
     * Test seam, threaded straight into `CreateFederationRuntimeParams.connect` (see that field's
     * own doc): overrides the session factory federation's boot pass uses for EVERY connection in
     * the roster, so a test can hand it a fake `McpSessionPort` (e.g.
     * `mcp-federation/adapter.memory.ts`'s `InMemoryMcpSession`) instead of actually spawning a
     * child process or dialing a hosted URL. Omitted, the real transport connects, exactly as
     * `assistant-byok.ts` (the only production caller) wants.
     */
    readonly federationConnect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  } = {},
): ByokToolSurface {
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  // `routeDeps`'s declared type (`ByokToolSurfaceDeps`, above) is every field `AssistantToolRegistryDeps`
  // needs EXCEPT `magicLinkPerEmailLimiter` and `listCatalogTools` — the two fields this function
  // builds itself rather than accepting. `.clock` on the line above resolves against this type because
  // several of the domain slices composing `AssistantToolRegistryDeps` (e.g. `MembersToolDeps`,
  // `PostToolDeps`) already declare `clock: { nowIso(): string }` themselves, so it is a real member of
  // this parameter's type, not assumed. No `as` of any kind is needed HERE: the object literal below
  // adds exactly the two fields the parameter type omits, so it is a real, checked `AssistantToolRegistryDeps` rather
  // than an assertion that one exists — verified empirically (`npx tsc -p tsconfig.json --noEmit`
  // reports zero errors on this file). The double cast this file used to hold (`as unknown as
  // AssistantToolRegistryDeps`) is gone, not relocated to a different line in this file — it moved to
  // the one place a cast is still genuinely required: `modules/assistant-byok.ts`'s call into this
  // function, where the caller's own `routeDeps: RouteDeps` parameter is honestly narrower than what
  // it always receives at runtime (verified empirically too — removing the cast there produces
  // TS2345, "missing ... newsletterReady, newsletterCampaignRepo, newsletterListRepo,
  // newsletterSubscriptionRepo, and 6 more", i.e. exactly `NewsletterToolDeps`'s domain-specific
  // fields). A single `as` is not available at that call site either (also verified, not assumed —
  // `RouteDeps` declares no relationship to `ByokToolSurfaceDeps`, unlike the `NewsletterRouteDeps
  // extends RouteDeps` precedent it otherwise mirrors), so it keeps the same `unknown` detour — see
  // that call site's own comment for the full trace of why.
  const registry = createToolRegistry();
  // `listCatalogTools` is `site_describe_capabilities`' reader over this surface's OWN registry, the
  // one `search_tools`/`describe_tool` below are seeded from. Spread last, so a reader smuggled in
  // through `routeDeps` cannot replace it.
  const deps: AssistantToolRegistryDeps = {
    ...routeDeps,
    magicLinkPerEmailLimiter,
    listCatalogTools: () => listToolCatalogEntries(registry),
  };
  const surfaceExchanges = options.surfaceExchangeStore ?? createSurfaceExchangeStore();

  for (const registration of buildAssistantToolRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }

  // Routed through `tool-executor-stack.ts`'s SHARED `createAssistantToolExecutor` — the exact same
  // decorator stack (read-only gate, then attempt audit, then failure recovery) the agent daemon's
  // own delegated-tool route composes, not a second, independently hand-assembled copy of it. Before
  // 2026-09-06 this function built its own inline stack that never wrapped
  // `withReadOnlyToolConstraint` at all, so a read-only-constrained principal (nothing sets that flag
  // for BYOK today, but `createByokToolSurface`'s only real caller — `assistant-byok.ts` — has no
  // structural guarantee that stays true) could dispatch a write tool through
  // `execute_delegated_tool` with no gate to refuse it; see `tool-executor-stack.ts`'s own header for
  // why one shared composition is what keeps that from silently reopening. `toolAttemptAudit` is
  // forwarded verbatim — omitted, the shared factory skips its own audit wrap the identical way this
  // function's inline one used to, matching this option's documented "neither half is logged"
  // contract.
  // Idempotent (`supabase-mcp-plugin.ts`'s own doc), and cheap when
  // `TOVU_SUPABASE_MCP_ENABLED` is unset — safe to call unconditionally, matching
  // `agent-daemon-server.ts`'s own `start()`, which is what makes disclosing this as
  // behavior-preserving for BYOK (a root that never called it before this slice) correct: nothing
  // is spawned unless an operator has actually opted in.
  registerSupabaseMcpPreset();

  // The stored-roster half of `external-mcp-connection-source.ts` — reads Settings → External
  // MCP's rows fresh on every `federation.resolveConnections()` call (boot, and every reload),
  // never rejecting. `routeDeps.externalMcpOAuth?.tokenResolver` mirrors
  // `agent-daemon-server.ts`'s own `resolveStoredExternalMcpConnections`: omitted (not merely
  // `undefined`-valued) when this surface's `routeDeps` carries no OAuth service, so an
  // `authMode: "oauth"` row degrades to a reported failure rather than launching credential-free.
  const connectionSource = createStoredExternalMcpConnectionSource({
    repo: routeDeps.externalMcpServerRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
    ...(routeDeps.externalMcpOAuth ? { oauth: routeDeps.externalMcpOAuth.tokenResolver } : {}),
    workspaceId: routeDeps.workspaceId,
    log: "[assistant-byok]",
  });

  // THE ONE REGISTRAR (`installed-extension-tools.ts`) — installed-extension tools, then (once
  // that settles) a `FederationRuntime` built but not yet started, per that function's own doc.
  // Skipped entirely under `installExtensions: false`, the same bare-test-double posture `ready`
  // already had: there is no roster to federate without the extension pass ahead of it, and this
  // surface's `federation`/`awaitFederation` degrade to `undefined`/an immediate no-op below.
  const extensions =
    options.installExtensions === false
      ? undefined
      : attachAssistantToolExtensions(
          registry,
          {
            ...deps,
            federation: {
              deps: buildExternalMcpFederationDeps({
                authorize: routeDeps.authorize,
                workspaceId: routeDeps.workspaceId,
                repo: routeDeps.externalMcpServerRepo,
                ...(routeDeps.externalMcpOAuth ? { oauth: routeDeps.externalMcpOAuth } : {}),
              }),
              resolveConnections: () => connectionSource.resolve(),
              // Only a RELOAD pass reaches this — see `FederationRuntime.reload`'s own doc — so the
              // boot pass's own newly-searchable tools are rebuilt by `awaitFederation` below, not
              // here.
              onAdmitted: () => {
                catalog = buildToolCatalogQuery(registry);
              },
              ...(options.federationConnect ? { connect: options.federationConnect } : {}),
            },
          },
          "[assistant-byok]",
        );
  const federation: FederationRuntime | undefined = extensions?.federation;

  // Composed OUTERMOST, matching `agent-daemon-server.ts`'s identical ordering (`:541` there) —
  // see `withFederatedRefusalDiagnosis`'s own header for why outermost is load-bearing. `() =>
  // federation?.reports() ?? []` reads live: empty before `awaitFederation` (or a caller directly
  // holding `federation`) ever starts the boot pass, and again whenever `federation` itself is
  // `undefined`, in which case no toolId here can be `mcp__`-prefixed either — this decorator is
  // then a no-op passthrough, never a behavior change for `installExtensions: false`.
  const executor = withFederatedRefusalDiagnosis(
    createAssistantToolExecutor({
      registry,
      surfaceExchanges,
      ...(options.toolAttemptAudit ? { toolAttemptAudit: options.toolAttemptAudit } : {}),
    }),
    () => federation?.reports() ?? [],
    // The "still connecting" / "failed to connect" diagnosis (2026-09-24): unlike the daemon
    // (`agent-daemon-server.ts` awaits `federation.start()` fully before it ever serves a turn), a
    // BYOK turn's own `awaitFederation` wait is BOUNDED (`assistant-byok.ts`'s
    // `FEDERATION_TURN_WAIT_MS`) and federation's boot pass keeps running in the background past
    // that bound — so a model that names a just-registering federated tool id before the boot pass
    // has settled must get "still connecting", not the daemon's own unreachable-in-practice bare
    // `unknown tool` throw. `settled: true, connectFailures: []` when `federation` itself is
    // `undefined` (`installExtensions: false`): nothing is connecting, so there is nothing this
    // branch could ever explain — every `mcp__`-prefixed id in that mode is genuinely unknown.
    () => (federation ? { settled: federation.started, connectFailures: federation.connectFailures() } : { settled: true, connectFailures: [] }),
  );
  // Seeded once here, from the same `registry` the executor resolves against, so a tool the model
  // can FIND is by construction a tool it can RUN — `buildToolCatalogQuery`'s own module doc names
  // that non-drift property as the reason it takes the registry rather than a separate catalog.
  // `let`, not `const`: `ready` below rebuilds it once the installed-extension-tools pass finishes,
  // and `awaitFederation`/`onAdmitted` above each rebuild it again once federation actually admits
  // something, so a tool either pass adds is findable, not just executable — see those members'
  // own docs.
  let catalog = buildToolCatalogQuery(registry);

  // See `ByokToolSurface.ready`'s own doc — `installed`, unchanged: `registerInstalledExtensionTools`
  // is fail-open by construction (each of its three sub-registrations catches its own error), so
  // this `.then()` is reached unconditionally and `ready` never rejects. Deliberately NOT chained
  // onto `federation.start()` too — federation stays lazy, per this module's own header.
  const ready: Promise<void> = extensions
    ? extensions.installed.then(() => {
        catalog = buildToolCatalogQuery(registry);
      })
    : Promise.resolve();

  /**
   * Starts (or awaits) `federation.start()`, racing it against `timeoutMs` — see
   * `ByokToolSurface.awaitFederation`'s own doc for the full contract. Rebuilds `catalog` itself
   * on a successful boot pass, mirroring `ready`'s own `.then(rebuildCatalog)`: unlike the daemon
   * (which starts federation and builds its FIRST catalog snapshot in the same sequential boot,
   * per `design-byok-external-mcp-2026-09-24.md` §2.1 item 4), BYOK's `catalog` above is already
   * built and possibly already searched by the time federation's lazy boot pass resolves, so
   * nothing else would ever pick up what it admitted.
   */
  async function awaitFederation(timeoutMs: number): Promise<{ readonly settled: boolean }> {
    if (!federation) return { settled: true };
    const runtime = federation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      runtime.start().then((): "started" => {
        catalog = buildToolCatalogQuery(registry);
        return "started";
      }),
      new Promise<"timed-out">((resolve) => {
        timer = setTimeout(() => resolve("timed-out"), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return { settled: outcome === "started" };
  }

  async function executeMetaTool(
    principal: Principal,
    run: RunRef,
    call: { readonly name: string; readonly input: unknown },
    signal?: AbortSignal,
    emitSurface?: SurfaceEmitter,
  ): Promise<ByokMetaToolResult> {
    const args = isRecord(call.input) ? call.input : {};

    if (!META_TOOL_IDS.has(call.name)) {
      // Reachable in practice: a model that has seen a real tool id (from a search hit, or from its
      // own prior turn) can try to call it directly as a tool name, since the meta-set is the only
      // thing it was actually offered. Say so, rather than returning a bare "unknown tool".
      return err(
        `"${call.name}" is not a callable tool here. This site exposes only ${[...META_TOOL_IDS].join(", ")}. ` +
          `To run "${call.name}", call execute_delegated_tool with toolId: "${call.name}".`,
      );
    }

    // Real per-call identity, unlike the Local CLI's fixed placeholder — see `MetaToolCatalogAudit`'s
    // own doc.
    const catalogAudit: MetaToolCatalogAudit | undefined = options.toolAttemptAudit && {
      sink: options.toolAttemptAudit.sink,
      workspaceId: options.toolAttemptAudit.workspaceId,
      principalId: principal.id,
      runId: run.id,
    };

    if (call.name === "search_tools") return runSearchTools(catalog, registry, args, catalogAudit);
    if (call.name === "describe_tool") return runDescribeTool(catalog, args, catalogAudit);
    // execute_delegated_tool
    return runExecuteDelegatedTool(executor, principal, run, args, signal, emitSurface);
  }

  return {
    registry,
    executor,
    metaTools: META_TOOL_DESCRIPTORS,
    surfaceExchanges,
    executeMetaTool,
    ready,
    federation,
    awaitFederation,
  };
}
