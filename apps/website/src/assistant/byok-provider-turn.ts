/**
 * @file Tovu's provider-neutral BYOK turn adapter. The shared implementation is
 * `@jini-ai/agent-runtime/providers/tool-turn`; callers resolve credentials and supply tool execution.
 *
 * The normalized event shape matches `assistant-transport.ts`'s `translateRunAgentPayload` switch,
 * so the BYOK route can send events without provider-specific branches in the browser transport.
 */
import type { ToolDescriptor } from "@jini-ai/core";
import { providerTurnAdapters, runProviderToolTurn } from "@jini-ai/agent-runtime/providers/tool-turn";

/** The four protocols `apps/admin/src/lib/execution-settings.ts`'s `ByokConfig.protocol` supports —
 *  re-declared here (not imported from `@jini-ai/ui`) so this module has no dependency on a UI
 *  package; the string literals are the actual contract, and both sides are checked against the same
 *  four values by TypeScript regardless of which file declares the union. */
export type ByokProtocol = "anthropic" | "openai" | "azure" | "google";

/** Text history plus pixels prepared for the current message at the shared attachment seam. */
export interface ByokChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly images?: readonly { readonly mimeType: string; readonly data: string }[];
}

/**
 * The common turn-event shape every protocol adapter is normalized into. Field-for-field identical
 * to `assistant-transport.ts`'s `translateRunAgentPayload` switch on `payload.type` — see this
 * file's header for why that identity is load-bearing, not incidental.
 */
export type ByokTurnEvent =
  | { readonly type: "status"; readonly label: string }
  | { readonly type: "text_delta"; readonly delta: string }
  | { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: unknown }
  | { readonly type: "tool_result"; readonly toolUseId: string; readonly content: string; readonly isError: boolean }
  | { readonly type: "usage"; readonly usage: Record<string, unknown> | null }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "end"; readonly reason: string };

export interface ByokToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/**
 * One block of a tool result that carries more than text — the MCP content-block shape
 * (`{type:'image', mimeType, data}`) a registered tool returns, e.g. `media_view_image`.
 * Each `run*Turn` below maps it onto that provider's own image part; nothing here is
 * provider-specific.
 */
export type ByokToolResultBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly mimeType: string; readonly data: string };

export interface ByokToolResult {
  /** A string for an ordinary result; blocks only when the result carries an image. */
  readonly content: string | readonly ByokToolResultBlock[];
  readonly isError?: boolean;
}

/** Host-owned tool execution — `assistant-byok.ts` bridges this to `@jini-ai/daemon`'s `ToolExecutor`
 *  over the admin's own tool surface (`byok-tool-surface.ts`). Same "the collaborator is always
 *  supplied" convention every `run*ToolTurn` adapter already uses for its own protocol-specific
 *  executor type. */
export type ByokToolExecutor = (call: ByokToolCall) => Promise<ByokToolResult>;

export interface ByokProviderTurnInput {
  readonly protocol: ByokProtocol;
  readonly apiKey: string;
  /** Required for `azure` (no sane global default — every Azure OpenAI resource has its own
   *  endpoint); optional for the other three protocols, which fall back to each adapter's own
   *  public default endpoint. */
  readonly baseUrl?: string;
  /** `anthropic`/`openai`/`google`: a model id. `azure`: the deployment name, not a raw model id —
   *  see `AzureTurnOptions.model`'s own doc. */
  readonly model: string;
  readonly maxTokens?: number;
  /** Overrides the provider's tool-turn limit. The BYOK meta-tool surface spends three calls
   *  (search/describe/execute) per action, so the provider default can truncate multi-step tasks.
   *  See assistant-byok.ts's BYOK_MAX_TOOL_TURNS policy. Omit to keep the provider default. */
  readonly maxToolTurns?: number;
  readonly system: string;
  readonly messages: readonly ByokChatMessage[];
  /** Descriptors only, never handlers — the same public shape `ToolRegistry.list()` returns
   *  (`@jini-ai/core`'s own "handlers never publicly retrievable" invariant, see that package's
   *  `tool-registry.ts` module doc). Mapped into each protocol's own tool-def shape below. */
  readonly tools: readonly ToolDescriptor[];
  readonly executeTool: ByokToolExecutor;
  readonly onEvent: (event: ByokTurnEvent) => void;
  readonly signal?: AbortSignal;
}

export interface ByokProviderTurnResult {
  readonly stopReason: string | null;
  readonly toolTurns: number;
}

/**
 * Runs one tool-calling turn against whichever provider `input.protocol` names.
 * The implementation lives in `@jini-ai/agent-runtime/providers/tool-turn`.
 *
 * Provider mapping constraints (implemented by Jini's `providers/tool-turn.ts` and `google-schema.ts`):
 *
 * OpenAI/Azure have no host-tool-error flag on their wire. A shared fold marker carries failures
 * into content and restores `isError` on outgoing events; adapter validation alone cannot detect a
 * host denial in an otherwise valid string result. Azure uses the same content shape as OpenAI.
 * Anthropic accepts JPEG/PNG/GIF/WebP image sources; its adapter guards unsupported media types.
 * OpenAI/Azure move image parts into a follow-up user message because tool messages are text-only;
 * Gemini places inline data beside function responses. Transcript events describe each image by
 * MIME type instead of emitting base64 noise. Plain string results remain unchanged.
 * Missing input schemas use an empty-object schema; schema dialect is a consumer concern.
 *
 * Gemini's restricted Schema cannot express full JSON Schema. Its supported-key allowlist follows
 * the validator's Available Fields list (the Google AI Developer forum's "oneOf in response_schema"
 * thread), which includes fields omitted by the prose API docs. Unsupported keys are dropped only
 * from model guidance: tool handlers still validate inputs server-side. `const` becomes `enum`;
 * `oneOf` becomes `anyOf`. That conversion is equivalent for this catalog's disjoint tagged unions
 * (navigation targets and TipTap nodes); overlapping future branches require an owner decision
 * because the conversion would loosen the constraint.
 *
 * Local #/$defs references are resolved against the nearest enclosing, per-call definitions map,
 * preventing concurrent turns from sharing definitions. Unknown references degrade to object
 * guidance instead of failing an entire turn. References are inlined because Gemini has no $ref;
 * ordinary object/array traversal does not consume the reference-depth budget.
 * The reference cap is 4, a chosen bound rather than a product invariant: TipTap's recursive
 * eight-branch block union grows combinatorially, and two reference hops represent one visible
 * list/blockquote nesting level. Four hops cover two such levels while bounding request size.
 * The navigation tree's separate depth-five invariant does not determine this cap. Deeper content
 * remains permissible but undescribed by a shallow type/description stub (union stubs use object);
 * the stub must not recurse into properties, items or branches and recreate unbounded expansion.
 *
 * Gemini requires every array schema to declare items and every node to declare type unless it
 * has anyOf. Unknown array items degrade to string, the narrowest valid approximation, rather than
 * inviting arbitrary objects. Structural repair applies only at schema positions (properties.*, items,
 * anyOf), never arbitrary default/example objects, which must not acquire invented type fields.
 * Properties preserve author-chosen keys. Validation must use googleParametersOf, including shape
 * repair, so it checks the actual wire schema rather than an incomplete lower-level conversion.
 *
 * Bare const literals infer boolean/integer/number/string; object/array const sites need an explicit
 * type instead of broader inference. A type array collapses to one non-null type plus nullable;
 * multiple non-null types lose precision and require an owner decision if used. Null enum members
 * are removed because Gemini's enum accepts strings only and sibling nullable already conveys null.
 * Numeric enums are stringified for Gemini and must be converted back at the tool-call boundary:
 * redirects' statusCode handler still requires a number. Numeric paths come from the original
 * unsanitized schema, once per tool, because sanitization overwrites the numeric type. The original
 * type check prevents coercing numeric enum values on nonnumeric fields. Discovery traverses only
 * properties, not arrays, unions or $refs; a numeric enum in those positions needs an extension.
 * Coercion accepts only finite numeric-looking, nonblank strings and clones only the changed path;
 * malformed paths/arguments remain untouched for the handler's validation rather than inventing data.
 *
 * The adapter's captured end-event reason takes precedence over the final response's raw stop code:
 * a raw tool_use can mean the loop hit its cap while the model still wanted tools. Raw stop/finish
 * fields are fallbacks only when no end event was observed; callers must explain the loop's actual
 * stop. Anthropic alone requires a max-token default when omitted, so the shared mapping supplies it.
 * Provider-internal fabricated-role-marker diagnostics are filtered because the client has no event case.
 *
 * @complexity Provider request/tool-loop cost dominates; descriptors are mapped once per turn and
 * tool-result mapping is linear in content parts. Numeric-path discovery is linear in schema nodes;
 * coercion is proportional to path count and depth. Reference expansion is bounded by the hop cap.
 */
export async function runByokProviderTurn(input: ByokProviderTurnInput): Promise<ByokProviderTurnResult> {
  const { baseUrl, maxTokens, maxToolTurns, signal, ...required } = input;
  return runProviderToolTurn({ ...required, adapters: providerTurnAdapters }, {
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(maxToolTurns !== undefined ? { maxToolTurns } : {}),
    ...(signal !== undefined ? { signal } : {}),
  });
}
