/**
 * @file SPEC-046 REQ-0 — the site assistant's capability registry.
 *
 * `tools.ts` DEFINES the three read-only tools; until this file existed, `site-assistant.ts`'s SSE
 * route DISPATCHED them itself via a closed `switch` welded directly into the route
 * (`call.name === "search_published_entries" ? ... : ...`). That fused capability and transport: a
 * second caller (a future WebMCP in-page API, an A2A agent surface, an admin adapter converging with
 * the daemon surface) would have had to re-implement the same dispatch, the same authorization
 * decision, and the same refusal semantics — and would eventually drift from them.
 *
 * This file is the one place that answers "who is asking, what may they invoke, what does it
 * return." Every adapter (today: the SSE route) becomes a thin translator over `invoke()` — it never
 * touches `tools.ts` directly, and it never decides on its own whether a call is allowed.
 *
 * SPEC-046 REQ-4/REQ-6 added three Tier A page-action capabilities (`navigate_to_entry`,
 * `scroll_to_entry`, `highlight_entry`) alongside the original three read-only ones — six entries
 * plus the explicitly injected anonymous guide. All declare `visitorOfferable: true`; T1 checks
 * the anonymous caller class, site policy and budgets through the private visitor executor. A
 * page-action capability is authorized the same way a read-only one is, and its target resolution
 * lives in `tools.ts`/`client-directives.ts`, not here — this file still only decides WHETHER a call
 * reaches a capability, never what that capability does.
 *
 * ## Default deny, preserved exactly
 *
 * ADR-054 chose the closed switch deliberately: "an unknown tool name cannot resolve to anything."
 * `capabilities` below is a `Map` built from a fixed, literal array and the named guide port. T1
 * registers only these reviewed contracts in a private Jini registry: no dynamic loading or
 * config-driven capability list (explicit REQ-0 non-goal). Site policy selects eligible contracts;
 * it cannot make another tool eligible. No admin registry, plugin loader, credentials, invoker or
 * CLI is accepted by this boundary. A name absent from the registry refuses before anything runs,
 * the same way the old switch's `default` branch did; a name present but not granted to the caller
 * ALSO refuses before anything runs. Both paths return the same `"refused"` outcome kind AND text
 * so an adapter cannot accidentally disclose "capability doesn't exist" versus "capability exists
 * but you may not call it" — see `tools.ts`'s own "same response for exists-but-hidden and
 * doesn't-exist" precedent for why that non-disclosure property matters on a surface anonymous
 * traffic can probe.
 *
 * ## Validation stays with the capability
 *
 * `execute` on each entry below calls straight into the corresponding `tools.ts` function, and those
 * functions already own their own input validation (`typeof input?.slug === "string"`, etc. — see
 * `tools.ts`). This registry does not re-parse or re-validate `input` itself; it only decides WHETHER
 * a call reaches that function at all. That split is deliberate: input shape is a capability concern
 * (only the capability knows its own contract), while "may this caller reach it" is a registry
 * concern that must be enforced identically regardless of which capability is being asked for.
 * Server-side target resolution (REQ-6) likewise stays inside each capability's own `execute`, so
 * no adapter can add a second path that skips it. Published/trash/member checks keep their owners.
 *
 * ## What this deliberately does NOT do
 *
 * No plugin system, no externally supplied capability registration, no config file describing
 * capabilities — REQ-0's explicit non-goal. Adding a capability means editing the literal contracts
 * below, in code, same as editing the old switch was. Adding an ADAPTER (WebMCP, A2A) means writing
 * a translator that calls `invoke()` with the right `caller` value — it requires no change to the
 * capability list at all, which is REQ-0's success test.
 */
import type { ClientDirective } from "./client-directives.js";
import { createSiteAssistantTools, SITE_ASSISTANT_TOOL_SCHEMAS, type SiteAssistantToolDeps } from "./tools.js";
import { createVisitorExecutor, type VisitorCapabilityContract, type VisitorExecutionPorts, type VisitorExecutor } from "./visitor-executor.js";
import { VISITOR_TOOL_PRESENTATION } from "./visitor-tool-presentation.js";

/** Owner's site-guide brief adds one explicitly named read-only seam. This does not accept a
 * plugin catalog or arbitrary capability names; the host supplies an anonymous-safe guide only.
 * Effective names contain only reviewed visitor capabilities. */
export interface PublicSiteGuidePort {
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly run: (input: { input: unknown; availableTools?: readonly string[] }, options?: Record<string, never>) => Promise<unknown>;
}
/**
 * Who is asking. A real parameter threaded through every `invoke()` call, not an ambient assumption
 * the registry infers from context — so authorizing a new caller class is always a visible, reviewed
 * change to this union and the visitor executor's caller check, never a side effect of wiring an
 * adapter. Exactly one member today, matching the one real caller (the public SSE widget).
 *
 * Extending to a second caller class (a logged-in admin, a WebMCP in-page agent, an A2A remote agent)
 * means widening the union and explicitly reviewing its eligibility and policy. T1 replaces
 * `allowedCallers` with the `visitorOfferable` contract plus the anonymous check in `invoke`.
 */
export type SiteAssistantCallerClass = "anonymous-visitor";
/** One capability invocation, addressed by name, carrying who is asking. */
export interface SiteCapabilityInvocation {
  readonly name: string; readonly input: unknown; readonly caller: SiteAssistantCallerClass;
}
export type SiteCapabilityOutcome =
  | {
      readonly kind: "ok";
      readonly result: unknown;
      /** SPEC-046 REQ-4: present only for a capability that resolved a client-facing action (the
       * three page-action tools). `site-assistant.ts` emits this as the `client_directive` SSE
       * event — a side channel from `result`, which is what the MODEL sees. `result` and `directive`
       * can therefore differ in content; neither is derived from the other at this layer, so an
       * adapter cannot accidentally conflate "what the model was told" with "what the client was
       * told" — the no-tool_use/tool_result privacy property REQ-4 preserves. */
      readonly directive?: ClientDirective;
    }
  /** Unknown capability OR a known capability not granted to `caller` — both share one outcome
   * kind and uniform text so probing cannot distinguish them (see file header). */
  | { readonly kind: "refused"; readonly reason: string }
  /** Jini returns a handler error message or terminal status, rather than the original exception.
   * The execution wrapper reports original handler errors server-side before Jini normalizes them;
   * the route presents a safe error id. Cancelled calls instead become silent refusals. */
  | { readonly kind: "error"; readonly error: unknown };
/** Eligibility is explicit on every reviewed contract. T1 replaces the shared PUBLIC_READ_ONLY
 * caller set with `visitorOfferable: true` and one anonymous-only check in the executor, keeping
 * "which callers can reach this surface" a single visible fact instead of copies that can drift. */
type SiteCapability = VisitorCapabilityContract;

/**
 * Builds the fixed capability list over one `tools.ts` instance. Kept as a plain function (not a
 * module-level constant) because each capability closes over `tools`, which itself closes over
 * `deps` — the registry is created once per request in `site-assistant.ts` today, matching
 * `createSiteAssistantTools`'s own existing per-request lifetime, so no capability here is shared
 * across workspaces or requests.
 */
function buildCapabilities({ tools }: { tools: ReturnType<typeof createSiteAssistantTools> }, _options = {}): ReadonlyMap<string, SiteCapability> {
  const entries: readonly SiteCapability[] = [
    {
      name: "search_published_entries",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.search_published_entries,
      // Wrapped in `{ result }` — these three read-only tools return the model-facing value
      // directly, unlike the three page-action tools below, which already return `{ result,
      // directive? }` themselves (they have a directive to carry; these never do).
      execute: async ({ input }, _options = {}) => ({ result: await tools.search_published_entries(input as { query?: unknown }) }),
    },
    {
      name: "get_published_entry",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.get_published_entry,
      execute: async ({ input }, _options = {}) => ({ result: await tools.get_published_entry(input as { slug?: unknown }) }),
    },
    {
      name: "list_categories",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.list_categories,
      execute: async (_required, _options = {}) => ({ result: await tools.list_categories({}) }),
    },
    {
      name: "navigate_to_entry",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.navigate_to_entry,
      execute: ({ input }, _options = {}) => tools.navigate_to_entry(input as { slug?: unknown }),
    },
    {
      name: "scroll_to_entry",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.scroll_to_entry,
      execute: ({ input }, _options = {}) => tools.scroll_to_entry(input as { slug?: unknown }),
    },
    {
      name: "highlight_entry",
      visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.highlight_entry,
      execute: ({ input }, _options = {}) => tools.highlight_entry(input as { slug?: unknown }),
    },
  ];
  return new Map(entries.map((capability) => [capability.name, capability]));
}

export interface SiteCapabilityRegistry {
  /** The model-facing tool schemas (Google function-calling shape). Re-exported here so an adapter
   * never has to import `tools.ts` directly for anything, capability execution included. */
  readonly schemas: readonly { readonly name: string; readonly description: string; readonly parameters: Readonly<Record<string, unknown>> }[];
  invoke(invocation: SiteCapabilityInvocation, optional?: Parameters<VisitorExecutor["invoke"]>[1]): Promise<SiteCapabilityOutcome>;
}

/** Creates one registry bound to a single workspace's read-only content. The SSE route is the only
 * production caller today; it invokes this once per chat request with `caller: "anonymous-visitor"`
 * for every tool call the model makes during that turn.
 *
 * Build the visitor-only executor. Policy ports opt into T1; omitting them is the literal-registry
 * rollback and preserves standalone adapter compatibility. Ask requires the visitor-only return
 * channel; headless adapters continue to refuse it rather than waiting on an invisible prompt.
 * @complexity O(1) construction for the seven reviewed contracts; invocation adds policy/limiter I/O.
 * @example createSiteCapabilityRegistry(contentDeps, { siteGuide, visitorExecution });
 */
export function createSiteCapabilityRegistry(deps: SiteAssistantToolDeps, options: {
  siteGuide?: PublicSiteGuidePort; visitorExecution?: VisitorExecutionPorts;
} = {}): SiteCapabilityRegistry {
  const tools = createSiteAssistantTools(deps);
  const capabilities = new Map(buildCapabilities({ tools }));
  let schemas: SiteCapabilityRegistry["schemas"] = SITE_ASSISTANT_TOOL_SCHEMAS;
  if (options.siteGuide) {
    const guide = options.siteGuide;
    capabilities.set("site_guide", { name: "site_guide", visitorOfferable: true,
      ...VISITOR_TOOL_PRESENTATION.site_guide,
      execute: async ({ input }, _options = {}) => ({ result: await guide.run({ input, availableTools: await executor.availableToolNames({}) }) }) });
    schemas = [...schemas, { name: "site_guide", description: "Read-only overview or explain(topic) of the capabilities granted to this visitor. Administrator topics and private site facts are unavailable.", parameters: guide.inputSchema }];
  }
  const executor = createVisitorExecutor({ capabilities: [...capabilities.values()] }, { ports: options.visitorExecution });
  if (options.visitorExecution) schemas = schemas.filter(schema => executor.isAdvertised({ toolId: schema.name }));
  return { schemas, invoke: (invocation, optional) => executor.invoke(invocation, optional) };
}
