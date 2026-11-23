/** Mirrors `@jini-ai/ui`'s `ExecutionTab` `DetectedAgent` shape — see
 *  `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts`'s `toExecutionTabAgent`.
 *
 *  Each model's `reasoning` mirrors `@jini-ai/agent-runtime`'s `RuntimeModelOption.reasoning`
 *  (`packages/agent-runtime/src/types.ts` in Jini) — a model's OWN effort levels, narrowed to
 *  `{id,label}` the same way every other field on this interface narrows its Jini counterpart.
 *  `undefined` means the runtime doesn't report per-model levels for this agent (Codex today);
 *  it is never defaulted to `[]`, which would misreport "unknown" as "this model supports zero" —
 *  see `toExecutionTabAgent`'s `projectModelReasoning` for the same rule on the wire side. No
 *  `@jini-ai/ui` picker reads this yet; it exists so a future one can narrow the "Reasoning effort"
 *  control to the SELECTED model instead of `reasoningOptions`' agent-wide union. */
export interface AdminExecutionDetectedAgent {
  discoveryPending?: boolean;
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  path?: string;
  models?: Array<{ id: string; label: string; reasoning?: Array<{ id: string; label: string }> }>;
  modelsSource?: "live" | "fallback";
  authStatus?: "ok" | "missing" | "unknown";
  authMessage?: string;
}

/**
 * Mirrors `src/assistant/public-assistant-settings.ts`'s `PublicAssistantSettings`.
 *
 * `publicEnabled: false` is a hard off — the public page ships no assistant bundle and exposes no
 * assistant endpoint. It is NOT a client-side visibility flag, and nothing in this admin app should
 * ever treat it as one; see that module's header for the contract in full.
 */
export interface PublicAssistantSettings {
  publicEnabled: boolean;
  /** Optional while older servers and cached responses still carry only the switch. */
  widget?: "react" | "vanilla";
}
