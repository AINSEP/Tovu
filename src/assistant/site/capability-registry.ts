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
 * ## Default deny, preserved exactly
 *
 * ADR-054 chose the closed switch deliberately: "an unknown tool name cannot resolve to anything."
 * `capabilities` below is a `Map` built from a fixed, literal array — there is no registration
 * function, no dynamic loading, no config-driven capability list (explicit REQ-0 non-goal). A name
 * absent from the map refuses before anything runs, the same way the old switch's `default` branch
 * did; a name present but not granted to the calling class ALSO refuses before anything runs. Both
 * paths return the same `"refused"` outcome kind so an adapter cannot accidentally treat "capability
 * doesn't exist" and "capability exists but you may not call it" differently in a way that discloses
 * which one it was — see `tools.ts`'s own "same response for exists-but-hidden and doesn't-exist"
 * precedent for why that non-disclosure property matters on a surface anonymous traffic can probe.
 *
 * ## Validation stays with the capability
 *
 * `execute` on each entry below calls straight into the corresponding `tools.ts` function, and those
 * functions already own their own input validation (`typeof input?.slug === "string"`, etc. — see
 * `tools.ts`). This registry does not re-parse or re-validate `input` itself; it only decides WHETHER
 * a call reaches that function at all. That split is deliberate: input shape is a capability concern
 * (only the capability knows its own contract), while "may this caller reach it" is a registry
 * concern that must be enforced identically regardless of which capability is being asked for. A
 * future capability with server-side target resolution (REQ-6, not built here) would do that
 * resolution inside its own `execute`, for the same reason — so no adapter could add a second one
 * that skips it.
 *
 * ## What this deliberately does NOT do
 *
 * No plugin system, no dynamic capability registration, no config file describing capabilities —
 * REQ-0's explicit non-goal. Adding a capability means editing the literal array below, in code,
 * same as editing the old switch was. Adding an ADAPTER (WebMCP, A2A) means writing a translator that
 * calls `invoke()` with the right `caller` value — it requires no change to `CAPABILITIES` at all,
 * which is REQ-0's success test.
 */
import { createSiteAssistantTools, SITE_ASSISTANT_TOOL_SCHEMAS, type SiteAssistantToolDeps } from "./tools";

/**
 * Who is asking. A real parameter threaded through every `invoke()` call, not an ambient assumption
 * the registry infers from context — so authorizing a new caller class is always a visible, reviewed
 * change to a capability's `allowedCallers` set, never a side effect of wiring up a new adapter.
 *
 * Exactly one member today, matching the one real caller (the public SSE widget). Extending this to
 * a second caller class (a logged-in admin, a WebMCP in-page agent, an A2A remote agent) is additive:
 * widen the union, then explicitly opt each capability in via its own `allowedCallers`.
 */
export type SiteAssistantCallerClass = "anonymous-visitor";

/** One capability invocation, addressed by name, carrying who is asking. */
export interface SiteCapabilityInvocation {
  readonly name: string;
  readonly input: unknown;
  readonly caller: SiteAssistantCallerClass;
}

export type SiteCapabilityOutcome =
  | { readonly kind: "ok"; readonly result: unknown }
  /** Unknown capability name OR a known capability not granted to `caller` — see file header for why
   *  both share this one outcome kind. */
  | { readonly kind: "refused"; readonly reason: string }
  /** The capability's own `execute` threw. Carries the raw error (not a message string) so an
   *  adapter can log it with full fidelity the way `site-assistant.ts`'s old catch block did. */
  | { readonly kind: "error"; readonly error: unknown };

interface SiteCapability {
  readonly name: string;
  readonly allowedCallers: ReadonlySet<SiteAssistantCallerClass>;
  readonly execute: (input: unknown) => Promise<unknown>;
}

/** Granted to every capability below today — there is only one real caller class yet. Naming this
 *  once, rather than repeating an inline `new Set([...])` per entry, is what makes "which callers can
 *  reach the public read-only surface" a single visible fact instead of three copies that could
 *  silently disagree. */
const PUBLIC_READ_ONLY: ReadonlySet<SiteAssistantCallerClass> = new Set(["anonymous-visitor"]);

/**
 * Builds the fixed capability list over one `tools.ts` instance. Kept as a plain function (not a
 * module-level constant) because each capability closes over `tools`, which itself closes over
 * `deps` — the registry is created once per request in `site-assistant.ts` today, matching
 * `createSiteAssistantTools`'s own existing per-request lifetime, so no capability here is shared
 * across workspaces or requests.
 */
function buildCapabilities(tools: ReturnType<typeof createSiteAssistantTools>): ReadonlyMap<string, SiteCapability> {
  const entries: readonly SiteCapability[] = [
    {
      name: "search_published_entries",
      allowedCallers: PUBLIC_READ_ONLY,
      execute: (input) => tools.search_published_entries(input as { query?: unknown }),
    },
    {
      name: "get_published_entry",
      allowedCallers: PUBLIC_READ_ONLY,
      execute: (input) => tools.get_published_entry(input as { slug?: unknown }),
    },
    {
      name: "list_categories",
      allowedCallers: PUBLIC_READ_ONLY,
      execute: () => tools.list_categories(),
    },
  ];
  return new Map(entries.map((capability) => [capability.name, capability]));
}

export interface SiteCapabilityRegistry {
  /** The model-facing tool schemas (Google function-calling shape). Re-exported here so an adapter
   *  never has to import `tools.ts` directly for anything, capability execution included. */
  readonly schemas: typeof SITE_ASSISTANT_TOOL_SCHEMAS;
  invoke(invocation: SiteCapabilityInvocation): Promise<SiteCapabilityOutcome>;
}

/**
 * Creates one capability registry bound to a single workspace's read-only content. The SSE route is
 * the only production caller today; it invokes this once per chat request with `caller:
 * "anonymous-visitor"` for every tool call the model makes during that turn.
 *
 * @complexity O(1) per `invoke()` call beyond whatever the underlying capability itself costs (a
 *   `Map.get` plus a `Set.has`); construction is O(1) in the fixed, three-entry capability list.
 * @overallScore 100
 */
export function createSiteCapabilityRegistry(deps: SiteAssistantToolDeps): SiteCapabilityRegistry {
  const tools = createSiteAssistantTools(deps);
  const capabilities = buildCapabilities(tools);

  return {
    schemas: SITE_ASSISTANT_TOOL_SCHEMAS,

    async invoke(invocation: SiteCapabilityInvocation): Promise<SiteCapabilityOutcome> {
      const capability = capabilities.get(invocation.name);
      if (!capability) {
        return { kind: "refused", reason: `unknown tool: ${invocation.name}` };
      }
      if (!capability.allowedCallers.has(invocation.caller)) {
        return {
          kind: "refused",
          reason: `capability "${invocation.name}" is not available to caller "${invocation.caller}"`,
        };
      }
      try {
        const result = await capability.execute(invocation.input);
        return { kind: "ok", result };
      } catch (error) {
        return { kind: "error", error };
      }
    },
  };
}
