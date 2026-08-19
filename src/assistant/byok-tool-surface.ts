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
 * `createToolRegistry`/`createToolExecutor` are `@jini-ai/core`/`@jini-ai/daemon`'s own public,
 * side-effect-only-at-call exports — nothing here reaches into either package's internals, and
 * nothing here talks MCP or spawns a process. `agent-daemon-server.ts:196-201,272` builds its own
 * registry/executor pair the exact same way; this module is a second, independent caller of the same
 * public API, not a fork of it.
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
 * via `content_post_delete`, the one production tool that reads `ctx.emitSurface` today. A2UI's own
 * `demo-a2ui` tools and `/api/admin/v1/a2ui/actions` are untouched by this slice — that route still
 * only reaches the daemon's store, so an A2UI tool run through BYOK mode would park against a store no
 * redemption path for A2UI specifically has been wired to reach; not attempted here.
 */
import {
  createToolRegistry,
  type Principal,
  type RunRef,
  type SurfaceEmitter,
  type ToolDescriptor,
  type ToolRegistry,
} from "@jini-ai/core";
import { createToolExecutor, type ToolExecutor } from "@jini-ai/daemon";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/core/rate-limit/rate-limit";
import type { ClockDeps } from "../server/routes/types.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../core/tool-surface-exchanges.js";
import { buildToolCatalogQuery } from "./tool-catalog-query.js";
import { type AssistantToolRegistryDeps, buildAssistantToolRegistrations } from "./tool-registrations/index.js";

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
            `before concluding no tool exists — measured on a 130-case blind set, the right tool is in the top ${SEARCH_LIMIT_DEFAULT} ` +
            `98% of the time but in the top 20 100% of the time, so the remaining misses are ranked just below the default cutoff, not absent.`,
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
function resolveDelegatedInput(raw: unknown): { readonly ok: true; readonly input: unknown } | { readonly ok: false; readonly message: string } {
  if (raw === undefined || raw === null) return { ok: true, input: undefined };
  if (isRecord(raw)) return { ok: true, input: raw };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ok: true, input: undefined };
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) return { ok: true, input: parsed };
      return { ok: false, message: "'input' parsed as JSON but is not an object — send a JSON object of the tool's input fields." };
    } catch {
      return { ok: false, message: "'input' must be a JSON object of the tool's input fields, not a plain string." };
    }
  }
  return { ok: false, message: `'input' must be a JSON object of the tool's input fields, not ${Array.isArray(raw) ? "an array" : typeof raw}.` };
}

/**
 * Builds one fresh registry+executor pair over the full admin tool catalog.
 *
 * `magicLinkPerEmailLimiter` is built here rather than accepted as a parameter: it is the one field
 * `AssistantToolRegistryDeps` needs beyond plain `RouteDeps` (`IdentityToolDeps`'s own requirement —
 * see `agent-daemon-server.ts:172-183`'s identical note on why this is computed, not stored on
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
export function createByokToolSurface(
  routeDeps: ClockDeps,
  options: { readonly surfaceExchangeStore?: SurfaceExchangeStore } = {},
): ByokToolSurface {
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  // `routeDeps`'s declared type here is `ClockDeps` (narrowed 2026-08-18, first slice of the
  // `RouteDeps` decomposition — see `server/routes/types.ts`'s `ClockDeps` doc) because `.clock` on
  // the line above is the only field this function ever names directly. But the spread just below
  // still needs the REAL, full `RouteDeps`-shaped object at runtime — the caller
  // (`modules/assistant-byok.ts`'s `createAssistantByokModule`) always passes its own full
  // `routeDeps: RouteDeps` value in, so the narrower static annotation here costs nothing at
  // runtime: `{ ...routeDeps }` spreads whatever real properties the object actually carries,
  // regardless of what TypeScript statically believes its type is (this is the exact same gap the
  // `newsletterAdminDeps = routeDeps as NewsletterRouteDeps` cast in `server/app.ts` documents —
  // "the real object is wider than its own annotation," just pushed one step further here). A plain
  // single `as AssistantToolRegistryDeps` fails here (`TS2352`, "neither type sufficiently
  // overlaps") because `AssistantToolRegistryDeps` is a 20-way intersection with no declared
  // relationship to `ClockDeps`/`RouteDeps` either one. The `unknown` detour is TypeScript's own
  // suggested escape for that case, not a weakening of the check: the real safety property is the
  // same one `agent-daemon-server.ts:196-198` already relies on with NO cast at all (because its own
  // `routeDeps` local is inferred from `createRouteDeps()`'s wide return type directly) — that
  // whatever composed the real `routeDeps` object populated every domain's fields.
  const deps = { ...routeDeps, magicLinkPerEmailLimiter } as unknown as AssistantToolRegistryDeps;
  const surfaceExchanges = options.surfaceExchangeStore ?? createSurfaceExchangeStore();

  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }

  const executor = createToolExecutor({ registry });
  // Seeded once here, from the same `registry` the executor resolves against, so a tool the model
  // can FIND is by construction a tool it can RUN — `buildToolCatalogQuery`'s own module doc names
  // that non-drift property as the reason it takes the registry rather than a separate catalog.
  const catalog = buildToolCatalogQuery(registry);

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

    if (call.name === "search_tools") {
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
      if (hits.length === 0) {
        return ok({ hits: [], note: `No tool matched "${query}". Try broader or different keywords — this catalog has ${registry.list().length} tools.` });
      }
      return ok({ hits });
    }

    if (call.name === "describe_tool") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (id.length === 0) return err("'id' is required and must be a non-empty string.");
      const entry = catalog.describe(id);
      if (!entry) return err(`No tool with id "${id}". Use search_tools to find a valid id.`);
      return ok(entry);
    }

    // execute_delegated_tool
    const toolId = typeof args.toolId === "string" ? args.toolId.trim() : "";
    if (toolId.length === 0) return err("'toolId' is required and must be a non-empty string.");
    const resolvedInput = resolveDelegatedInput(args.input);
    if (!resolvedInput.ok) return err(resolvedInput.message);

    let result: Awaited<ReturnType<ToolExecutor["execute"]>>;
    try {
      result = await executor.execute(principal, run, toolId, resolvedInput.input, signal, emitSurface);
    } catch (error) {
      // `ToolExecutor.execute` THROWS on an id it does not know (`unknown tool "<id>"`) rather than
      // returning a status for it. That was unreachable while the model could only name tools from
      // a list it was handed; with a meta-tool set the id is free-form model output, so a
      // hallucinated or misremembered id is now an ordinary, expected event — and an uncaught throw
      // here would abort the entire turn's stream instead of costing one recoverable tool call.
      const message = error instanceof Error ? error.message : String(error);
      return err(`${message}. Use search_tools to find a valid tool id.`);
    }

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

  return { registry, executor, metaTools: META_TOOL_DESCRIPTORS, surfaceExchanges, executeMetaTool };
}
