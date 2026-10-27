/**
 * @file In-process admin tool composition for BYOK. Daemon and BYOK use the same registration
 * builder and shared executor factory, keeping catalog, permission, read-only, audit and recovery
 * behavior aligned. The registry is built through Jini's public API.
 *
 * Each process owns a fresh SurfaceExchangeStore because parked calls are in-process state.
 * `executeMetaTool` forwards its live emitter; the admin redemption proxy tries this store first,
 * falling back to the daemon only on unknown-or-closed exchanges. The A2UI proxy does likewise.
 */
import type { AssistantToolContributions } from "./tool-contribution-registry.js";
import {
  createToolRegistry,
  createToolExposure,
  isReadOnlyTool,
  type ToolExposure,
  type Principal,
  type RunRef,
  type SurfaceEmitter,
  type ToolDescriptor,
  type ToolRegistration,
  type ToolRegistry,
} from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";
import { constrainPrincipalToReadOnlyTools, filterReadOnlyToolCatalog } from "@jini-ai/daemon/read-only-tools";
import type { ToolCatalogQuery } from "@jini-ai/daemon/http";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { ToolAttemptAuditSink } from "../features/tool-audit/types.js";
import { appendToolCatalogAttempt, DESCRIBE_TOOL_TOOL_ID, describeToolAuditDetail, SEARCH_TOOLS_TOOL_ID, searchToolsAuditDetail } from "./tool-audit-preset.js";
import { withFederatedRefusalDiagnosis } from "./tool-recovery-preset.js";
import { buildExternalMcpFederationDeps, createStoredExternalMcpConnectionSource, type StoredExternalMcpConnectionSource } from "./external-mcp-connection-source.js";
import { attachAssistantToolExtensions, type AssistantToolExtensions, type InstalledExtensionRegistrar } from "./installed-extension-tools.js";
import type { FederationRuntime } from "./external-mcp-federation-runtime.js";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpSessionPort } from "@jini-ai/mcp/federation";
import { buildToolCatalogQuery, listToolCatalogEntries } from "./tool-catalog-query.js";
import { createChatDeleteScope, ALL_CHAT_DELETE_TOOLS } from "./permanent-delete-tool-gate.js";
import { readChatPermanentDeletesPolicy } from "./permanent-delete-settings.js";
import { isChatToolAllowed } from "../contracts/headless/assistant-permanent-deletes-policy.js";
import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "./tool-registrations.js";
import { createAssistantToolExecutor } from "./tool-recovery-preset.js";
import { err, isRecord, mapToolExecutionResult, ok, resolveDelegatedInput, type ByokMetaToolResult } from "./byok-meta-tool-result.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { readDaemonCallContext } from "./daemon-call-context.js";


export type { ByokMetaToolResult } from "./byok-meta-tool-result.js";

/** A request-owned exposure; releasing it at turn completion releases its pinned descriptors. */
export interface ByokToolRun {
  /** Meta-tools plus successfully described definitions, with core-owned wire names. */
  readonly getToolSnapshot: () => readonly (ToolDescriptor & { readonly wireName?: string })[];
  /** Calls retain the identity captured at creation, never a model-supplied run or principal. */
  readonly executeTool: (
    required: { readonly name: string; readonly input: unknown },
    optional?: { readonly signal?: AbortSignal; readonly emitSurface?: SurfaceEmitter },
  ) => Promise<ByokMetaToolResult>;
}

export interface ByokToolSurface {
  /** Create one isolated provider turn. Example: surface.createRun({ principal, run }). */
  readonly createRun: (
    required: { readonly principal: Principal; readonly run: RunRef },
    optional?: { readonly maxTools?: number; readonly maxSchemaBytes?: number },
  ) => ByokToolRun;
  /** Discovery view only; use this surface's executor/meta calls for execution against the inner registry. */
  readonly registry: ToolRegistry;
  readonly executor: ToolExecutor;
  /** The initial staged-discovery descriptors — see {@link META_TOOL_DESCRIPTORS}. */
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
  /**
   * The agent daemon's view of this surface over the tool RPC (ADR-070, `assistant-tool-exec.ts`).
   * `executor` is {@link ByokToolSurface.executor}, each call run the way `executeMetaTool` runs one:
   * after the installed-extension pass and inside a fresh per-principal delete grant, so
   * `site_describe_capabilities` lists what this caller may use. `listToolsFor` is the catalog the
   * daemon fetches at each run start, built fresh per call (delete policy and installed skills).
   */
  readonly daemonCalls: {
    readonly executor: ToolExecutor;
    readonly listToolsFor: (required: { readonly principalId: string }, optional?: Record<string, never>) => Promise<readonly ToolDescriptor[]>;
  };
}

/** Bounds `search_tools`' `limit`, mirroring `@jini-ai/http-kit`'s `tool-catalog.ts`
 *  (`MAX_SEARCH_LIMIT = 25`, `DEFAULT_SEARCH_LIMIT = 10`) exactly. Declared here rather than
 *  imported because that module keeps them private to its own route parser; the values are the
 *  contract, and stating them in the schema means the model is told the same bounds this dispatch
 *  actually enforces instead of having a silently-clamped one applied behind its back. */
const SEARCH_LIMIT_MAX = 25;
const SEARCH_LIMIT_DEFAULT = 10;

/**
 * The 3 tools a BYOK turn initially publishes, before successful descriptions add concrete schemas.
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
      "Search this Tovu site's tool catalog. Returns ranked {id, description, source, score} candidates only — no input schemas, so this stays cheap to call broadly. Call describe_tool on the 1-3 candidates that look right, then invoke the published callableName with its concrete input. execute_delegated_tool remains available for compatibility. If nothing in the results fits, re-search with a higher limit or different phrasing rather than assuming the tool does not exist.",
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
      "Get the full descriptor for one tool id found via search_tools — its description and its input schema. Successful descriptions publish a typed callableName for this turn; use execute_delegated_tool if the exposure budget is full. Paid for only on the candidates that survive search, per the tool catalog's staged-discovery design.",
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
          // requires: declared without one, some clients
          // delivers the model's object as a JSON-encoded STRING, and every tool here rejects a
          // string input by name rather than coercing it — the effect is that only no-input tools
          // stay callable. `resolveDelegatedInput` (`byok-meta-tool-result.ts`) ALSO accepts that string form defensively,
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
  const hits = catalog.search({ query }, { limit });
  if (audit) {
    appendToolCatalogAttempt({ sink: audit.sink, event: {
      workspaceId: audit.workspaceId,
      runId: audit.runId,
      principalId: audit.principalId,
      toolId: SEARCH_TOOLS_TOOL_ID,
      detail: searchToolsAuditDetail({ query: query, limit: limit, hits: hits }, {}),
    } }, {});
  }
  if (hits.length === 0) {
    return ok({ hits: [], note: `No tool matched "${query}". Try broader or different keywords — this catalog has ${registry.list({}).length} tools.` });
  }
  return ok({ hits });
}

/** `describe_tool` branch — see {@link runSearchTools}'s doc for why this is split out.
 * Publish only after visible discovery succeeds; budgets preserve the usable legacy wrapper.
 * @returns The authored entry with its pinned callable name, or a model-readable discovery error.
 * @complexity O(r log r + b) promotion time/space for r registry IDs and bounded schema bytes b.
 */
function runDescribeTool(
  { catalog, args, audit }: { catalog: ToolCatalogQuery; args: Record<string, unknown>; audit: MetaToolCatalogAudit | undefined },
  { exposure }: { exposure?: ToolExposure },
): ByokMetaToolResult {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (id.length === 0) return err("'id' is required and must be a non-empty string.");
  const entry = catalog.describe({ id });
  if (audit) {
    appendToolCatalogAttempt({ sink: audit.sink, event: {
      workspaceId: audit.workspaceId,
      runId: audit.runId,
      principalId: audit.principalId,
      toolId: DESCRIBE_TOOL_TOOL_ID,
      detail: describeToolAuditDetail({ id: id, entry: entry }, {}),
    } }, {});
  }
  if (!entry) return err(`No tool with id "${id}". Use search_tools to find a valid id.`);
  if (!exposure) return ok(entry);
  const promotion = exposure.promote({ toolIds: [id] });
  const published = promotion.snapshot.tools.find(tool => tool.descriptor.id === id);
  return ok({ ...entry, callableName: published?.wireName, exposureSkipped: promotion.skipped });
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
    // Omitted input is valid for no-input tools. Match the MCP gateway's empty object at
    // the executor boundary so the shared object normalizer can still run before policy.
    const result = await executor.execute({ principal: principal, run: run, toolId: toolId, input: resolvedInput.input ?? {} }, { signal: signal, emitSurface: emitSurface });
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

/** Resolve only this turn's published names, then recheck live visibility and read classification.
 * The existing executor validates, authorizes and handles confirmation/cancellation and surfaces.
 * Read attenuation also covers any nested recovery dispatch; it must never retry as a writer.
 * @param required - This run's exposure, current catalog/registry and existing executor/identity.
 * @param optional - Cancellation and the live surface emitter, forwarded unchanged.
 * @returns A mapped executor result or a model-readable refusal, with no unexposed dispatch.
 * @complexity O(r + e) time/space for r registrations and at most e bounded exposed definitions.
 */
async function runTypedTool(
  { exposure, catalog, registry, executor, principal, run, call }: {
    exposure: ToolExposure; catalog: ToolCatalogQuery; registry: ToolRegistry; executor: ToolExecutor;
    principal: Principal; run: RunRef; call: { readonly name: string; readonly input: unknown };
  },
  { signal, emitSurface }: { signal?: AbortSignal; emitSurface?: SurfaceEmitter } = {},
): Promise<ByokMetaToolResult> {
  const tools = exposure.getSnapshot({}).tools;
  const published = tools.find(tool => tool.wireName === call.name || tool.descriptor.id === call.name);
  if (!published) return err(`"${call.name}" is not exposed in this turn. Use describe_tool first, or execute_delegated_tool.`);
  const toolId = published.descriptor.id;
  const descriptor = registry.list({}).find(tool => tool.id === toolId);
  if (!descriptor || !catalog.describe({ id: toolId })) return err(`Tool "${toolId}" is no longer available to this caller.`);
  const caller = isReadOnlyTool({ descriptor }) ? constrainPrincipalToReadOnlyTools({ principal }) : principal;
  return runExecuteDelegatedTool(executor, caller, run, { toolId, input: call.input }, signal, emitSurface);
}

/** Everything {@link createByokToolSurface} needs from its caller — every `AssistantToolRegistryDeps`
 *  field except `magicLinkPerEmailLimiter` (see {@link createByokToolSurface}'s doc) and `listCatalogTools` (bound to this
 *  surface's own registry, so `site_describe_capabilities` lists the catalog this surface serves),
 *  both of which this function builds itself.
 *  Exported so a caller that must cast into this shape (today: `modules/assistant-byok.ts`, whose own
 *  `routeDeps: RouteDeps` parameter is narrower than what it actually always receives at runtime —
 *  see that module's own comment) can cast to a named type instead of repeating this `Omit`. */
export type ByokToolSurfaceDeps = Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter" | "listCatalogTools"> & {
  readonly federatedMcpPresetRegistry?: import("@jini-ai/mcp/federation").FederatedMcpPresetRegistry;
};

/** The optional half of {@link createByokToolSurface}'s arguments. */
export interface ByokToolSurfaceOptions {
  readonly surfaceExchangeStore?: SurfaceExchangeStore;
  readonly prepareGuidance?: import("@jini-ai/daemon").PrepareToolGuidance;
  /**
   * Where every tool-execution attempt is logged, for BOTH halves of this surface: the two
   * meta-tools (`search_tools`/`describe_tool`, via `tool-catalog-audit.ts`'s own
   * `appendToolCatalogAttempt` — a single "completed"-phase row per call, there being no
   * two-phase lifecycle for a catalog read) AND every real tool `execute_delegated_tool` resolves
   * to (via `withToolAttemptAudit` wrapping `executor` below — the same `requested`-then-final-phase
   * decorator used by the daemon). Omitted, neither half is logged; tests composing a bare
   * surface pay nothing extra. Production (`assistant-byok.ts`) always
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
  readonly contributions?: AssistantToolContributions;
  /**
   * The installed-extension pass `attachAssistantToolExtensions` runs ahead of federation —
   * injected by the composition root (`modules/assistant-byok.ts` passes
   * `server/runtime/composition/installed-extension-tools.ts`'s `registerInstalledExtensionTools`)
   * because its three registrars are feature code `assistant/` must not import by value (the
   * `assistant <-> features/*` module cycles). Omitted, that pass registers nothing and `ready`
   * resolves at once; federation is still attached unless `installExtensions: false`.
   */
  readonly registerInstalledExtensions?: InstalledExtensionRegistrar;
  /**
   * Registers first-party federated MCP presets before this surface is built — injected by the
   * composition root for the same module-cycle reason as `registerInstalledExtensions`. No root
   * passes one; vendors arrive as Agent Plugin rows in the stored roster. Omitted, nothing is registered.
   */
  readonly registerFederationPresets?: () => void;
  /**
   * Test seam, threaded straight into `CreateFederationRuntimeParams.connect` (see that field's
   * own doc): overrides the session factory federation's boot pass uses for EVERY connection in
   * the roster, so a test can hand it a fake `McpSessionPort` (e.g.
   * `mcp-federation/adapter.memory.ts`'s `InMemoryMcpSession`) instead of actually spawning a
   * child process or dialing a hosted URL. Omitted, the real transport connects, exactly as
   * `assistant-byok.ts` (the only production caller) wants.
   */
  readonly federationConnect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  /**
   * Host-built registrations added after the catalog's own, given those so one can delegate to
   * another's handler (the chat-attachment tools reuse `media_upload_asset`). Injected by the
   * composition root for the same module-cycle reason as `registerInstalledExtensions`.
   */
  readonly hostRegistrations?: (required: { readonly registrations: readonly ToolRegistration[] }) => readonly ToolRegistration[];
}

/** Stable discovery-filter port of `createChatDeleteScope`'s scope. */
type ChatDeleteDiscoveryScope = Pick<ReturnType<typeof createChatDeleteScope>, "policy">;

// Discovery view only: Jini authorizes invocations against the inner registry's WeakMap
// identity. Executors must use `registry`, never this filtered view.
function createDiscoveryRegistry(required: { readonly registry: ToolRegistry; readonly deleteScope: ChatDeleteDiscoveryScope }): ToolRegistry {
  const { registry, deleteScope } = required;
  return {
    register: registry.register,
    has: ({ toolId }) => registry.has({ toolId }) && isChatToolAllowed({ toolId, policy: deleteScope.policy() }),
    list: (...args) => registry.list(...args).filter(tool => isChatToolAllowed({ toolId: tool.id, policy: deleteScope.policy() })),
  };
}

// The stored-roster half of `external-mcp-connection-source.ts` — reads Settings → External
// MCP's rows fresh on every `federation.resolveConnections()` call (boot, and every reload),
// never rejecting. `routeDeps.externalMcpOAuth?.tokenResolver` mirrors
// `agent-daemon-server.ts`'s own `resolveStoredExternalMcpConnections`: omitted (not merely
// `undefined`-valued) when this surface's `routeDeps` carries no OAuth service, so an
// `authMode: "oauth"` row degrades to a reported failure rather than launching credential-free.
function createSurfaceConnectionSource(required: { readonly routeDeps: ByokToolSurfaceDeps }): StoredExternalMcpConnectionSource {
  const { routeDeps } = required;
  return createStoredExternalMcpConnectionSource({
    agentPluginLayout: routeDeps.agentPluginLayout,
    repo: routeDeps.externalMcpServerRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
    ...(routeDeps.externalMcpOAuth ? { oauth: routeDeps.externalMcpOAuth.tokenResolver } : {}),
    workspaceId: routeDeps.workspaceId,
    log: "[assistant-byok]",
  });
}

// THE ONE REGISTRAR (`installed-extension-tools.ts`) — installed-extension tools, then (once
// that settles) a `FederationRuntime` built but not yet started, per that function's own doc.
// Skipped entirely under `installExtensions: false`, the same bare-test-double posture `ready`
// already had: there is no roster to federate without the extension pass ahead of it, and this
// surface's `federation`/`awaitFederation` degrade to `undefined`/an immediate no-op below.
function attachSurfaceExtensions(
  required: {
    readonly registry: ToolRegistry;
    readonly deps: AssistantToolRegistryDeps;
    readonly routeDeps: ByokToolSurfaceDeps;
    readonly surfaceExchanges: SurfaceExchangeStore;
    readonly connectionSource: StoredExternalMcpConnectionSource;
    readonly onAdmitted: () => void;
  },
  options: Pick<ByokToolSurfaceOptions, "installExtensions" | "registerInstalledExtensions" | "federationConnect">,
): AssistantToolExtensions | undefined {
  if (options.installExtensions === false) return undefined;
  const { registry, deps, routeDeps, surfaceExchanges, connectionSource, onAdmitted } = required;
  return attachAssistantToolExtensions(
    registry,
    {
      ...deps,
      // Executable Agent Plugin tools that ask before acting use this surface's cards.
      surfaces: { surfaceExchanges },
      registerInstalled: options.registerInstalledExtensions ?? (async () => {}),
      federation: {
        presetRegistry: routeDeps.federatedMcpPresetRegistry,
        deps: buildExternalMcpFederationDeps({
          authorize: routeDeps.authorize,
          workspaceId: routeDeps.workspaceId,
          repo: routeDeps.externalMcpServerRepo,
          ...(routeDeps.externalMcpOAuth ? { oauth: routeDeps.externalMcpOAuth } : {}),
          // G3: federated calls that are not read-only ask on a card through THIS surface's
          // store — the one the API proxy delivers a Local-CLI run's clicks to.
          surfaceExchanges,
        }),
        resolveConnections: () => connectionSource.resolve(),
        // Only a RELOAD pass reaches this — see `FederationRuntime.reload`'s own doc — so the
        // boot pass's own newly-searchable tools are rebuilt by `awaitFederation` below, not
        // here.
        onAdmitted,
        ...(options.federationConnect ? { connect: options.federationConnect } : {}),
      },
    },
    "[assistant-byok]",
  );
}

// The shared executor factory applies read-only, audit and recovery rules for both processes.
// Forward the optional audit sink unchanged: omission leaves both halves unlogged.
//
// Composed OUTERMOST, matching `agent-daemon-server.ts`'s identical ordering (`:541` there) —
// see `withFederatedRefusalDiagnosis`'s own header for why outermost is load-bearing. `() =>
// federation?.reports() ?? []` reads live: empty before `awaitFederation` (or a caller directly
// holding `federation`) ever starts the boot pass, and again whenever `federation` itself is
// `undefined`, in which case no toolId here can be `mcp__`-prefixed either — this decorator is
// then a no-op passthrough, never a behavior change for `installExtensions: false`.
function composeSurfaceExecutor(
  required: { readonly registry: ToolRegistry; readonly surfaceExchanges: SurfaceExchangeStore; readonly federation: FederationRuntime | undefined },
  options: Pick<ByokToolSurfaceOptions, "prepareGuidance" | "toolAttemptAudit">,
): ToolExecutor {
  const { registry, surfaceExchanges, federation } = required;
  return withFederatedRefusalDiagnosis({ inner: createAssistantToolExecutor({
      registry,
      surfaceExchanges,
      ...(options.prepareGuidance ? { prepareGuidance: options.prepareGuidance } : {}),
      ...(options.toolAttemptAudit ? { toolAttemptAudit: options.toolAttemptAudit } : {}),
    }, {}), getSnapshot: () => federation?.reports() ?? [], getBootStatus: () =>
      federation
        ? { settled: federation.started, connectFailures: federation.connectFailures(), configuredConnectionIds: federation.configuredConnectionIds() }
        : { settled: true, connectFailures: [] } }, {});
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
export function createByokToolSurface(routeDeps: ByokToolSurfaceDeps, options: ByokToolSurfaceOptions = {}): ByokToolSurface {
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  // The input omits exactly the limiter and catalog reader built here. Domain slices already
  // declare the clock; the assembled object is checked against AssistantToolRegistryDeps.
  const registry = createToolRegistry({});
  const deleteScope = createChatDeleteScope({ readPolicy: ({ principalId }) => readChatPermanentDeletesPolicy({ ...routeDeps, principalId, settingsReady: routeDeps.settingsUiTabsReady }) });
  const visibleRegistry = createDiscoveryRegistry({ registry, deleteScope });
  // `listCatalogTools` is `site_describe_capabilities`' reader over this surface's OWN registry, the
  // one `search_tools`/`describe_tool` below are seeded from. Spread last, so a reader smuggled in
  // through `routeDeps` cannot replace it. A daemon call adds the tools the daemon runs itself.
  const deps: AssistantToolRegistryDeps = {
    ...routeDeps,
    magicLinkPerEmailLimiter,
    listCatalogTools: () => withDaemonLocalTools({ entries: listToolCatalogEntries(visibleRegistry) }),
  };
  const surfaceExchanges = options.surfaceExchangeStore ?? createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });

  const registrations = buildAssistantToolRegistrations(deps, { surfaceExchanges }, { contributions: options.contributions, permanentDeletePolicy: ALL_CHAT_DELETE_TOOLS });
  for (const registration of [...registrations, ...(options.hostRegistrations?.({ registrations }) ?? [])]) {
    registry.register(registration);
  }

  // Injected (see the option's doc); a registrar must be idempotent and spawn nothing unless an
  // operator has opted in.
  options.registerFederationPresets?.();

  const connectionSource = createSurfaceConnectionSource({ routeDeps });
  const extensions = attachSurfaceExtensions(
    { registry, deps, routeDeps, surfaceExchanges, connectionSource, onAdmitted: () => {
      catalog = buildToolCatalogQuery(registry);
    } },
    options,
  );
  const federation: FederationRuntime | undefined = extensions?.federation;
  const executor = composeSurfaceExecutor({ registry, surfaceExchanges, federation }, options);
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
   * sequence), BYOK's `catalog` above is already
   * built and possibly already searched by the time federation's lazy boot pass resolves, so
   * nothing else would ever pick up what it admitted.
   */
  async function awaitFederation(timeoutMs: number): Promise<{ readonly settled: boolean }> {
    if (!federation) return { settled: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      federation.start().then((): "started" => {
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

  /** The installed-extension pass, then any skill installed since the last call. */
  async function syncInstalled(): Promise<void> {
    await ready;
    const skillsRegistry = registry as ToolRegistry & { refreshInstalledSkills?: () => Promise<boolean> };
    if (await skillsRegistry.refreshInstalledSkills?.()) catalog = buildToolCatalogQuery(registry);
  }

  async function executeMetaTool(
    principal: Principal,
    run: RunRef,
    call: { readonly name: string; readonly input: unknown },
    signal?: AbortSignal,
    emitSurface?: SurfaceEmitter,
    exposure?: ToolExposure,
  ): Promise<ByokMetaToolResult> {
    await syncInstalled();
    const args = isRecord(call.input) ? call.input : {};

    if (!META_TOOL_IDS.has(call.name) && !exposure) {
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

    return deleteScope.fresh({ principalId: principal.id, run: () => {
      const visibleCatalog = filterReadOnlyToolCatalog({ principal, registry: visibleRegistry, catalog: deleteScope.catalog({ catalog }) });
      if (call.name === "search_tools") return runSearchTools(visibleCatalog, visibleRegistry, args, catalogAudit);
      if (call.name === "describe_tool") return runDescribeTool({ catalog: visibleCatalog, args, audit: catalogAudit }, { exposure });
      if (call.name === "execute_delegated_tool") return runExecuteDelegatedTool(executor, principal, run, args, signal, emitSurface);
      return runTypedTool({ exposure: exposure!, catalog: visibleCatalog, registry: visibleRegistry, executor, principal, run, call }, { signal, emitSurface });
    } });
  }

  /** Bind one run without retaining it in a process-wide map. Core owns naming, pinning and caps.
   * Successful descriptions alone promote; searches stay cheap and do not change exposure.
   * @param required - Trusted principal and run, held only for this turn's lifetime.
   * @param limits - Optional publication budgets; exhausted budgets leave wrappers callable.
   * @returns A live getter and dispatcher sharing exactly one bounded exposure.
   * @throws ToolExposureError if a publication budget is invalid.
   * @complexity O(1) creation; snapshots O(e) time/space in bounded exposed definitions.
   */
  function createRun(
    { principal, run }: { principal: Principal; run: RunRef },
    limits: { maxTools?: number; maxSchemaBytes?: number } = {},
  ): ByokToolRun {
    const exposure = createToolExposure({ registry: visibleRegistry }, { ...limits, reservedNames: [...META_TOOL_IDS] });
    return {
      getToolSnapshot: () => [...META_TOOL_DESCRIPTORS, ...exposure.getSnapshot({}).tools.map(({ descriptor, wireName }) => ({ ...descriptor, wireName }))],
      executeTool: (call, { signal, emitSurface } = {}) => executeMetaTool(principal, run, call, signal, emitSurface, exposure),
    };
  }

  return {
    createRun,
    registry: visibleRegistry,
    executor,
    metaTools: META_TOOL_DESCRIPTORS,
    surfaceExchanges,
    executeMetaTool,
    ready,
    federation,
    awaitFederation,
    daemonCalls: {
      executor: {
        ...executor,
        execute: async (call, optional) => {
          await syncInstalled();
          return deleteScope.fresh({ principalId: call.principal.id, run: () => executor.execute(call, optional) });
        },
      },
      listToolsFor: async ({ principalId }) => {
        await syncInstalled();
        return deleteScope.fresh({ principalId, run: () => visibleRegistry.list({}) });
      },
    },
  };
}

/** Rows for the ids the calling daemon runs itself (frontend control), which this registry lacks. */
function withDaemonLocalTools({ entries }: { entries: ReturnType<typeof listToolCatalogEntries> }): ReturnType<typeof listToolCatalogEntries> {
  const known = new Set(entries.map((entry) => entry.id));
  const local = (readDaemonCallContext()?.localToolIds ?? []).filter((id) => !known.has(id));
  if (local.length === 0) return entries;
  return [...entries, ...listToolCatalogEntries({ list: () => local.map((id) => ({ id, description: "", inputSchema: {} }) as ToolDescriptor) })];
}
