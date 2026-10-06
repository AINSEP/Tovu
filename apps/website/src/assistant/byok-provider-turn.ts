/**
 * @file One provider-neutral tool-calling turn, dispatched to whichever of `@jini-ai/agent-runtime`'s
 * four `run*ToolTurn` functions matches the admin's chosen BYOK protocol (ADR-049's "API · BYOK"
 * execution mode — see `assistant-byok.ts`'s own header for how this fits into the run).
 *
 * Why a normalized event/type layer exists at all, rather than calling each provider's own
 * `run*ToolTurn` directly from the route: the four providers' turn-event unions are independently
 * declared but structurally identical on every case this module needs (`status`/`text_delta`/
 * `tool_use`/`tool_result`/`usage`/`error`/`end`, each with the same field names) — confirmed by
 * reading all four source files directly, not inferred from naming. `ByokTurnEvent` below is that
 * common shape, deliberately spelled to match `apps/admin/src/lib/assistant-transport.ts`'s own
 * `translateRunAgentPayload(payload)` switch verbatim (same `type` strings, same field names), so
 * `assistant-byok.ts` can hand each event straight to the wire as `payload` and the ALREADY-SHIPPED
 * client-side translator (used today for the daemon path) renders it with zero new frontend
 * branching for the browser side of the pipe.
 *
 * What this module deliberately does NOT do: no tool-loop logic of its own (each provider's own
 * `run*ToolTurn` owns its request/response loop and its own `maxToolTurns` bound), no HTTP call (the
 * provider adapters make those directly), no credential storage (the caller resolves `apiKey` before
 * calling in). The shared mapping and its rationale now live at
 * `@jini-ai/agent-runtime/providers/tool-turn`; this adapter binds the provider ports and preserves
 * the existing Tovu input contract. The extraction rationale is retained below for the host.
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
  /** Overrides each provider adapter's own `DEFAULT_MAX_TOOL_TURNS` (8, shared by all four
   *  `run*ToolTurn` functions — confirmed by reading `Jini/packages/agent-runtime/src/providers/
   *  {anthropic-messages,openai-chat,azure-chat,google-messages}.ts` directly). 8 was sized for a
   *  caller that dispatches real tools by name directly, one call per action. `assistant-byok.ts`'s
   *  meta-tool surface (`search_tools`/`describe_tool`/`execute_delegated_tool`) costs 3 calls per
   *  real action, so the bare default silently truncates a multi-step task at roughly its second or
   *  third real operation — see `assistant-byok.ts`'s own `BYOK_MAX_TOOL_TURNS` for the value it
   *  passes and the reasoning behind it. Omit to take each adapter's own default unchanged (every
   *  existing caller of this module before 2026-08-04 relied on that default; this field is
   *  additive). */
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
 * The implementation and canonical rationale live in `@jini-ai/agent-runtime/providers/tool-turn`.
 *
 * Extraction rationale retained from the former local implementation: these descriptions explain
 * the pre-extraction units, now replaced by the package's provider mappings and google-schema
 * module. Keeping the host-specific incident
 * history here prevents this migration from discarding why those mappings and bounds exist.
 *
 * The one string both directions of the OpenAI/Azure `isError` workaround agree on: the fold marker
 *  a host-reported tool failure gets prefixed with (since neither protocol's own wire has a real
 *  error flag — see `runOpenAiTurn`/`runAzureTurn`'s own comments), and the marker their `onEvent`
 *  handlers test for to recover a correct `isError` on the OUTGOING `ByokTurnEvent`. A shared
 *  constant rather than two independently-typed string literals, so the fold and the detection can
 *  never drift apart.
 * Anthropic's base64 image source accepts exactly these four types; anything else would be rejected
 *  by the adapter's own guard, so it is passed through and left to that guard to report.
 * Maps tool-result blocks onto Anthropic `tool_result` content (which carries images natively).
 * Maps tool-result blocks onto OpenAI/Azure content parts. The adapter moves the image parts into a
 *  follow-up user message itself (a `tool` message is text-only on that wire).
 * Maps tool-result blocks onto Gemini parts; the adapter appends `inlineData` beside the `functionResponse`.
 * Prefixes a failed result with {@link TOOL_ERROR_PREFIX} for the two protocols with no error flag.
 * The image's type, from whichever provider part shape carries one; `null` for a non-image part.
 * The text a `tool_result` event shows in the chat pane. Text parts are kept, each image becomes
 * `[image: <type>]` — never the base64 itself, which would put a megabyte of noise in the transcript.
 * A plain string result is returned unchanged.
 *
 * @complexity O(parts).
 * `ToolDescriptor.inputSchema` is `unknown` by contract (a schema dialect is a consumer concern —
 *  see that field's own doc in `@jini-ai/core`'s `tool-registry.ts`). Every provider here wants a
 *  plain JSON-Schema object; a tool that declared none gets the same empty-object schema
 *  `workspace_get`'s own catalog entry uses for "no arguments".
 * The exhaustive set of field names Google's Generative Language API actually accepts on a
 * `functionDeclarations[].parameters` `Schema` object. NOT reconstructed from docs — the docs
 * pages for this (`ai.google.dev/api/generate-content`, `.../cachedContents#Schema`) proved
 * incomplete/inconsistent when checked directly. This list is instead the literal "Available
 * Fields" enumeration from a live Gemini 400 response body (Google AI Developer forum thread
 * "oneOf in response_schema", `discuss.ai.google.dev/t/oneof-in-response-schema/55926`) — the
 * validator's own field list, which is more authoritative than any prose description of it.
 *
 * Everything NOT in this list is either dropped or converted below, not just the one field
 * (`additionalProperties`) the original bug report's error message happened to name — the same
 * "Available Fields" evidence also rules out `$schema`/`$ref`/`$defs`/`const`/`oneOf`/`allOf`,
 * which is exactly the next wave of failures the owner hit after the first, narrower fix.
 * How many `$ref` hops `sanitizeGoogleSchema` will inline before it stops recursing into a cyclic
 * definition and substitutes {@link terminalGoogleRefStub} instead. Gemini's `Schema` has no `$ref`
 * (see `GOOGLE_SUPPORTED_SCHEMA_KEYS`'s doc), so a genuinely recursive JSON Schema — this catalog
 * has two: `@jini-ai/cms/navigation`'s menu-item tree (its own doc names an actual, enforced
 * "Max nesting depth 5") and this repo's own `features/post/agent-tools.ts` TIPTAP_DOC_SCHEMA (no
 * documented cap; a `blockNode` can nest into itself directly via `blockquote.content` or
 * indirectly via `bulletList`/`orderedList` → `listItemNode.content`) — has to be inlined by value
 * instead, since Gemini's wire format has no reference indirection to fall back on.
 *
 * A NAIVE full inline (no depth bound at all) is unsafe for `TIPTAP_DOC_SCHEMA` specifically:
 * `blockNode` is an 8-branch union with 3 branches that each recurse back into `blockNode`, so an
 * unbounded inline is combinatorial (8 branches, each potentially containing another 8-branch
 * union, ...) rather than merely deep — a small number of extra levels multiplies the payload size
 * by roughly 8x each, not by a fixed increment.
 *
 * 4 was chosen, not derived from a documented product invariant the way the nav tree's depth-5
 * cap is — flag this specifically if it needs to move: it covers 2 real visual nesting levels in a
 * TipTap document (each visible level costs 2 `$ref` hops here, e.g. `bulletList` →
 * `listItemNode` → `blockNode` for one nested list, or `blockquote` → `blockNode` directly for one
 * nested blockquote), which covers the common cases (a list inside a blockquote, a blockquote
 * inside a list) while keeping the fully-inlined schema's size bounded rather than exponential.
 * Content nested deeper than that degrades to {@link terminalGoogleRefStub}'s generic `"object"`
 * placeholder rather than being rejected outright — the model can still emit it (deeper nesting is
 * simply undescribed to it beyond this point), and `renderDocNode`'s own documented default-case
 * fallback for an unrecognized node type is the same kind of graceful degradation, not a new
 * failure mode this fix introduces.
 * Infers the `Schema.type` a bare JSON-Schema `const` literal implies, for the one case
 *  {@link sanitizeGoogleSchema} needs it: a `const` with no sibling `type` of its own (this
 *  catalog's actual usage — every `const` site is a bare `{ const: "someString" }` discriminator).
 *  Deliberately narrow, not a general JSON-Schema-to-OpenAPI type mapper: only the literal kinds a
 *  `const` value can actually be in JSON are handled, and anything this catalog has never used a
 *  `const` for (an object or array literal) falls back to `"string"` rather than guessing further —
 *  if a future `const` site needs one of those, it should carry its own explicit `type` instead of
 *  relying on inference for a shape this function was never evidenced against.
 * Collapses a JSON-Schema nullable-idiom `type` array (`["string","null"]`, or a bare
 * single-element array like `["integer"]`) into the single `type` string plus `nullable` flag
 * Gemini's `Schema` actually has room for — its `type` field is one enum value, not a repeating
 * list (confirmed live: Gemini's own 400 response for this exact shape reads "Proto field is not
 * repeating, cannot start list"). Real catalog sites today (`src/seo/agent-tools.ts`,
 * `src/forms/agent-tools.ts`, `src/comments/agent-tools.ts`, `src/newsletter/agent-tools.ts`,
 * `src/features/recovery/agent-tools.ts`) are all exactly this 2-element `[X, "null"]` shape — a
 * full catalog sweep found none with more than one non-`"null"` member.
 *
 * Two or more non-`"null"` members (e.g. `["string","number"]`) cannot be losslessly expressed as
 * Gemini's single `type` — there is no fully faithful conversion. Rather than crash the whole BYOK
 * turn over one field, this falls back to the first non-`"null"` member (a real precision loss,
 * scoped to that one field) so a live request degrades instead of failing outright; treat a case
 * that actually reaches this branch as a signal this function needs a human decision, not proof the
 * fallback is fine to rely on.
 * Resolves a `"#/$defs/name"` pointer against the nearest enclosing `$defs` map collected while
 *  walking down to it. Fails safe (a permissive `{ type: "object" }`, never a thrown error) for any
 *  pointer shape other than the local `#/$defs/name` form this catalog's two recursive schemas
 *  actually use — a live BYOK turn should degrade the one tool's schema, not crash the whole turn,
 *  if a future schema's `$ref` ever points somewhere this resolver doesn't understand.
 * The non-recursive approximation substituted once {@link MAX_GOOGLE_REF_DEPTH} is exhausted — see
 *  that constant's doc. Deliberately does NOT recurse into `resolved`'s own `properties`/`items`/
 *  `oneOf`/`anyOf` (that would just move the unbounded-size problem one level down); it only reads
 *  `resolved`'s own shallow `type`/`description` so the stub is still a valid, non-empty `Schema`
 *  (Gemini requires an explicit `type` on a nested schema unless the parent uses `anyOf` — confirmed
 *  by the same forum thread `GOOGLE_SUPPORTED_SCHEMA_KEYS` cites, which shows Gemini rejecting a
 *  schema with an unspecified `items` type with "must be specified when not using one_of"). A
 *  union def (e.g. `blockNode`, which only has `oneOf`, no `type` of its own) falls back to
 *  `"object"` since no single primitive type describes every branch.
 * Repairs the two STRUCTURAL invariants Gemini enforces on every `Schema` node, applied to every
 * node this module emits regardless of which branch produced it.
 *
 * Both were violated in production by code that satisfied every key-level rule:
 * {@link terminalGoogleRefStub} copies a truncated definition's own `type` but deliberately does
 * NOT recurse into its `items`. When the `$defs` entry it truncated was itself `type: "array"`,
 * the stub emitted an array with **no `items` at all**, and Gemini rejected the whole request with
 * `...properties[content].items: missing field` — repeated for every path through the recursive
 * TipTap node union that bottomed out on an array.
 *
 * That bug shipped through a green suite because the existing real-catalog test asserted every node
 * has a `type` and carries no unsupported key — never that an array actually says what it contains.
 * Hence a repair pass rather than a fix at the one call site that happened to break: each of the six
 * prior rounds of this bug fixed exactly what the last error message named and shipped, and each
 * time Gemini found the next violation. This function is the place to add any future structural
 * invariant, so a single missed shape cannot produce a whole invalid catalog again.
 *
 * 1. **Every `type: "array"` declares `items`.** A degraded `{ type: "string" }` when unknown —
 *    deliberately the narrowest valid shape rather than a permissive `{ type: "object" }`, which
 *    would invite the model to emit an object where the tool expects something specific.
 * 2. **Every node has a `type` unless it uses `anyOf`.** Gemini's own rejection text for the
 *    missing case reads "must be specified when not using one_of". `anyOf` nodes are left alone:
 *    the branches carry the types, and a sibling `type` alongside `anyOf` is not a shape this
 *    catalog produces.
 * Recursively converts a JSON-Schema object (this catalog's `inputSchema` values are draft-07 by
 * convention) into the `Schema` shape Gemini's `functionDeclarations[].parameters` actually
 * accepts, before it is sent — see `GOOGLE_SUPPORTED_SCHEMA_KEYS`'s doc for the evidence behind
 * every decision below. Only this module's `runGoogleTurn` calls this; `runAnthropicTurn`/
 * `runOpenAiTurn`/`runAzureTurn` keep passing `inputSchemaOf(d)` straight through unchanged, since
 * Anthropic/OpenAI/Azure's tool schemas all tolerate full JSON Schema — only Gemini's restricted
 * OpenAPI subset cannot parse `additionalProperties`/`$schema`/`$ref`/`$defs`/`const`/`oneOf`/
 * `allOf`, does not accept a `type` array (the JSON-Schema nullable idiom), and requires `enum`
 * values to be strings.
 *
 * Five kinds of change, not one — the first three below shipped in an earlier pass and only
 * covered the failures visible at the time; the owner's actual, live 400 response (2026-08-04)
 * showed two more classes neither this function's earlier version nor its author's first attempt
 * to derive Gemini's supported-field set from docs had caught:
 * 1. **Drop.** Any key outside `GOOGLE_SUPPORTED_SCHEMA_KEYS` (`additionalProperties`, `$schema`,
 *    `allOf`, ...) is simply omitted — dropping a constraint Gemini can't express is a real
 *    semantic loosening (a value `additionalProperties: false` would have rejected can now pass
 *    Gemini's own generation), but there is no Gemini-expressible alternative, and every tool
 *    handler still validates its own input server-side regardless of what schema the model saw —
 *    this was never the enforcement layer, only the model's guidance.
 * 2. **Convert, not drop.** `const: x` becomes `enum: [x]` (an exact equivalent — `enum` is
 *    supported). `oneOf` becomes `anyOf` (merged with any sibling `anyOf` the schema might also
 *    carry) — NOT an exact equivalent in general (`oneOf` requires exactly one match, `anyOf` at
 *    least one), but verified safe for this catalog's actual 2 `oneOf` sites by reading both
 *    directly: `@jini-ai/cms/navigation`'s `NAV_TARGET_SCHEMA` and this repo's own `blockNode` are
 *    both tagged unions whose branches each require a distinct, disjoint `const` (now `enum`) on a
 *    `kind`/`type` discriminator field — no input can ever satisfy two branches at once, so
 *    "exactly one" and "at least one" select the identical set of valid values here. A future
 *    `oneOf` site whose branches actually overlap would be silently loosened by this same
 *    conversion; there is no Gemini-side alternative to fall back to, so a new overlapping `oneOf`
 *    needs a human to look at it, not a stronger version of this function.
 * 3. **Inline by value, depth-bounded.** `$ref`/`$defs` are resolved via {@link resolveGoogleRef},
 *    capped by {@link MAX_GOOGLE_REF_DEPTH} — see that constant's doc for why a bound exists at all
 *    and how 4 was chosen.
 * 4. **Collapse a `type` array to one value plus `nullable`.** See {@link collapseGoogleTypeArray}'s
 *    doc — `["string","null"]` becomes `{ type: "string", nullable: true }`.
 * 5. **Stringify a numeric `enum`, and coordinate with the tool-call boundary.** A numeric `enum`
 *    (this catalog's one real site: `redirects`'s `statusCode`) gets its values converted to
 *    strings and its `type` forced to `"string"` — but unlike 1-4, this one is NOT self-contained
 *    inside this function: it changes what the model sends back on a tool call, which the affected
 *    tool's own handler still expects as a `number`. See `runGoogleTurn`'s `executeTool` wrapper
 *    (`findNumericEnumPaths`/`coerceNumericEnumStringsToNumbers`) for the other half of this fix —
 *    reading this function's doc in isolation would miss that the two halves must move together.
 *
 * @param defs The nearest enclosing `$defs` map collected on the way down; merged with any `$defs`
 * this node itself declares before its own `$ref`s (if any) are resolved against it. Threaded
 * explicitly rather than read from a module-level map because a tool's `inputSchema` is walked
 * fresh on every turn (no caching), and passing it explicitly means two concurrent calls (two
 * different tools, or two different Google-protocol turns) can never see each other's `$defs`.
 * @param remainingRefDepth Counts down only across an actual `$ref` hop (see {@link MAX_GOOGLE_REF_DEPTH});
 * ordinary object/array traversal does not consume it, so a schema's plain nesting depth (e.g. a
 * hand-written `properties.foo.properties.bar...` chain with no `$ref` at all) is never truncated —
 * only recursive `$ref` cycles are.
 * @complexity O(n·d) worst case, where n is the schema's own node count and d is
 * {@link MAX_GOOGLE_REF_DEPTH} — each `$ref` hop can re-walk the definition it points to, up to the
 * depth cap, rather than O(n) for an acyclic schema (no `$ref` in this catalog costs more than one
 * hop in practice, since only the two recursive schemas named above use `$ref` at all).
 * True for the 3 keys {@link applyGoogleSchemaEntry} drops outright: `$defs`/`$ref` are consumed by
 *  {@link sanitizeGoogleSchema} before the entries loop runs, and `oneOf` is handled after it by
 *  {@link mergeGoogleOneOf}. Split out purely to keep the dispatcher's own condition count under the
 *  shop complexity ceiling.
 * True for the JSON-Schema nullable idiom (`type: ["string","null"]`) — see
 *  {@link applyGoogleSchemaTypeArray}'s doc for why it gets special handling.
 * True for a JSON-Schema `enum` that carries the nullable-idiom's literal `null` member alongside
 *  its real values (this catalog's real sites: `seo`'s `ogType`/`twitterCard`, each paired with a
 *  `type: ["string","null"]` on the same node) — see {@link applyGoogleSchemaEnum}'s doc for why
 *  that `null` cannot reach Gemini's wire format as an `enum` member.
 * Drops a nullable `enum`'s literal `null` member before it reaches Gemini, whose `enum` is
 *  `repeated string` only (see `sanitizeGoogleSchema`'s "Stringify a numeric `enum`" doc point for
 *  the sibling rule this mirrors — a JS `null` fails that same check with `typeof member ===
 *  "object"`, not `"string"`). Safe to drop rather than convert: the sibling `type: ["string",
 *  "null"]` on the same node already becomes `nullable: true` via
 *  {@link applyGoogleSchemaTypeArray} in the same entries loop, which is where Gemini expresses
 *  "this field may be absent/null" — losing the redundant `null` `enum` member loses no
 *  information Gemini's own shape has anywhere else to put it.
 * True for the one key ({@link applyGoogleSchemaEntry}'s `properties`) whose VALUE is a map keyed
 *  by arbitrary, tool-author-chosen property names rather than schema keywords.
 * True for the two keys ({@link applyGoogleSchemaEntry}'s `items`/`anyOf`) that hold a nested
 *  SCHEMA position, where {@link enforceGoogleSchemaShape}'s structural invariants must be
 *  enforced — `items` is the one that mattered in production: a truncated recursive def left an
 *  array with no `items` at all.
 * Collapses a `type` array entry into Gemini's single-`type`-plus-`nullable` shape and writes it
 *  onto `result`. Split out of {@link applyGoogleSchemaEntry} purely to keep that function's
 *  complexity under the shop ceiling.
 * Sanitizes an `items`/`anyOf` schema position, which may be a single schema or (for `anyOf`) an
 *  array of them. Split out of {@link applyGoogleSchemaEntry} purely to keep that function's
 *  complexity under the shop ceiling.
 * What one entry can hand back to {@link buildGoogleSchemaResult}'s loop besides the write it
 *  already made directly onto `result` — the loop-scoped `const`/nullable state a single entry
 *  cannot carry any other way.
 * Applies one `[key, value]` entry of a JSON-Schema object onto `result`, mirroring one iteration
 * of {@link sanitizeGoogleSchema}'s original inline loop body. Split out purely to keep that
 * function's complexity under the shop ceiling — this is a direct extraction, not a behavior
 * change; see {@link sanitizeGoogleSchema}'s own doc for the "Five kinds of change" this
 * implements.
 * Each property name is preserved verbatim; only its own subschema value is recursively
 * sanitized — see `isGooglePropertiesKey`'s doc for why this key skips the generic path below.
 * Merges `schema.oneOf` (if present) into `result.anyOf`, per {@link sanitizeGoogleSchema}'s
 *  "Convert, not drop" doc point. Returns `undefined` when `schema` has no `oneOf` at all, so the
 *  caller can tell "nothing to merge" apart from "merged to an empty array". Split out purely to
 *  keep {@link buildGoogleSchemaResult}'s complexity under the shop ceiling.
 * The entries-loop-plus-`oneOf`-merge core of {@link sanitizeGoogleSchema}, for every schema that
 *  is neither an array nor a `$ref`. Split out purely to keep that function's complexity under the
 *  shop ceiling.
 * The `$ref` branch of {@link sanitizeGoogleSchema} — split out purely to keep that function's
 *  complexity under the shop ceiling.
 * True when every member of `schema.enum` is a JS `number` — the shape
 *  {@link applyGoogleNumericEnumStringification} stringifies for Gemini's wire format, and the
 *  shape {@link findNumericEnumPaths} (over the UNSANITIZED schema, with an added `type` check —
 *  see that function's own doc for why the two checks differ) finds so the matching tool-call
 *  argument can be coerced back to a number. Split out purely to keep both callers' complexity
 *  under the shop ceiling.
 * The numeric-`enum`-to-string conversion documented on {@link sanitizeGoogleSchema}'s "Stringify
 *  a numeric `enum`" point — split out purely to keep that function's complexity under the shop
 *  ceiling. Mutates `result` in place, mirroring the original inline assignment.
 * The `const`-without-a-sibling-`type` inference documented on {@link sanitizeGoogleSchema}'s doc
 *  (see its "A plain JSON-Schema `const`..." comment) — split out purely to keep that function's
 *  complexity under the shop ceiling. Mutates `result` in place, mirroring the original inline
 *  assignment.
 * A plain JSON-Schema `const: "entryRef"` (this catalog's real usage — e.g.
 * `NAV_TARGET_SCHEMA`'s `kind: { const: "entryRef" }`) carries no separate `type` field of its
 * own: JSON Schema doesn't need one, since a single literal value already implies its type. `enum`
 * alone is NOT valid standalone on Gemini's `Schema`, though (confirmed empirically: sanitizing the
 * REAL catalog and asserting every node has a `type` caught this exact gap before it could
 * reproduce the live bug a third time) — so a bare `type`-less `const` needs one synthesized here.
 * A schema that already declares its own `type` alongside `const` keeps that declared type as-is.
 * Gemini's `enum` is `repeated string` ONLY (confirmed live: a numeric `enum` value fails with
 * "Invalid value ... (TYPE_STRING)") — this catalog's one real site (`redirects`'s `statusCode`,
 * `type: "integer"`, `enum: [301,302,307,308]`; a full catalog sweep found no other numeric
 * `enum`) needs both its `enum` values stringified AND its `type` forced to `"string"` (Gemini
 * also rejects `enum` paired with a non-string `type`). This is a deliberate WIRE-FORMAT-ONLY
 * change, not silently accepted as the tool's real contract: `runGoogleTurn`'s `executeTool`
 * wrapper coerces the matching tool-call argument back to a number via
 * `findNumericEnumPaths`/`coerceNumericEnumStringsToNumbers` before the tool handler (which still
 * requires `typeof value === "number"`, e.g. `@jini-ai/cms/core`'s `requireNumber`) ever sees it —
 * without that reverse step, every Gemini-driven call to a tool using this shape would fail at the
 * handler's own type check even though the Gemini API call itself succeeded.
 * NOT `enforceGoogleSchemaShape(result)` here, deliberately. This function also recurses into
 * values that are NOT schemas — `default` and `example` are both supported Gemini keys whose
 * values are arbitrary user data — and blanket-enforcing here injected `type: "object"` into
 * them, corrupting the very defaults it was meant to leave alone. Enforcement happens only at
 * the positions where a SCHEMA is placed (see `sanitizeGoogleSubschema`).
 * {@link sanitizeGoogleSchema} plus {@link enforceGoogleSchemaShape}, for the positions that hold
 *  a nested SCHEMA rather than arbitrary data: `properties.*`, `items`, and `anyOf` members.
 * Applies {@link sanitizeGoogleSchema} to a tool's already-resolved `inputSchema`, typed as the
 *  `Record<string, unknown>` every provider's `parameters`/`input_schema` field expects.
 *
 *  Exported for the full-catalog validator (`byok-google-catalog.test.ts`) and for no other reason.
 *  It has to be THIS function the validator calls, not `sanitizeGoogleSchema` alone: the two differ
 *  by exactly the `enforceGoogleSchemaShape` pass, and the array-without-`items` class that reached
 *  production reproduced only after that pass — a validator run one layer lower would have declared
 *  the catalog clean while Gemini rejected it. Validate the bytes that go on the wire.
 * Finds every property PATH (dot-separated through `properties`, e.g. `"statusCode"`) whose
 * ORIGINAL, pre-sanitized schema declares a numeric `type` (`"integer"`/`"number"`) together with
 * an `enum` of number literals — the one shape {@link sanitizeGoogleSchema} converts to a STRING
 * `enum` for Gemini's wire format (see that function's "Stringify a numeric `enum`" doc point).
 * `runGoogleTurn` calls this once per tool (over the UNSANITIZED `inputSchemaOf(d)`, which is the
 * only copy that still has the numeric `type` to test for — the sanitized copy has already been
 * overwritten to `"string"`) and uses the result to coerce the matching tool-call ARGUMENT back to
 * a number before the tool's own handler sees it.
 *
 * Only walks through `properties` (object nesting) — not `items`/`anyOf` — because no real catalog
 * schema nests a numeric `enum` inside an array or union today; extend here with evidence if one
 * ever does, the same discipline `sanitizeGoogleSchema`'s own doc uses throughout.
 *
 * @complexity O(n) in the schema's own node count — one pass, no `$ref` following (a schema that
 * both recurses via `$ref` AND carries a numeric `enum` inside the cycle does not exist in this
 * catalog; this function does not resolve `$ref` at all, so such a schema's numeric `enum` past a
 * `$ref` would not be found — flag this if one is ever added).
 * The extra `type` check {@link findNumericEnumPaths} needs on top of
 *  {@link hasGoogleNumericEnumValues}: a numeric `enum` only means "coerce the tool-call argument
 *  back to a number" when the ORIGINAL schema also declared a numeric `type` — see
 *  `hasGoogleNumericEnumValues`'s own doc for why `sanitizeGoogleSchema`'s stringification check
 *  does not need this same `type` guard. Split out purely to keep `findNumericEnumPaths`'s
 *  complexity under the shop ceiling.
 * Reads the value at a dot-separated path inside a nested record, or `undefined` if any segment
 *  along the way is missing or not itself a record.
 * Returns a copy of `input` with the value at `segments` replaced by `value`, cloning only the
 *  objects actually on the path (siblings are left as the SAME reference, not deep-cloned) — the
 *  same "clone only what changes" discipline `sanitizeGoogleSchema` uses when rebuilding a schema.
 *  If a segment along the way isn't a record, `input` is returned unchanged rather than throwing —
 *  a tool-call argument that doesn't match its own declared schema shape is the tool handler's own
 *  validation to reject, not this coercion step's job to paper over.
 * The other half of {@link sanitizeGoogleSchema}'s "Stringify a numeric `enum`" conversion — see
 * that function's doc point 5. Gemini, having been told `statusCode` is a string `enum`, sends the
 * tool call back with `statusCode: "301"` (a string) instead of `301` (a number); the tool's own
 * handler (`@jini-ai/cms/core`'s `requireNumber`, shared by every protocol, not something this fix
 * may change) still requires `typeof value === "number"` and would reject the call outright
 * otherwise. `runGoogleTurn`'s `executeTool` wrapper calls this on every incoming `call.input`,
 * for the paths `findNumericEnumPaths` found on that SAME tool's original schema, before forwarding
 * to `input.executeTool`.
 *
 * Only coerces a value that is actually a numeric-looking string (`Number(value)` finite and the
 * string isn't empty/whitespace) — anything else at that path is left untouched and surfaces as
 * whatever validation error the tool handler already produces for a malformed argument, rather than
 * this step inventing a number that was never there.
 *
 * @complexity O(p·d) where p is `paths.length` (at most the tool's own numeric-enum field count —
 * 1 in this catalog today) and d is each path's depth (1 today); not O(schema size).
 * Every provider's turn-result field names its "why did generation stop" value differently
 * (`stopReason` for Anthropic, `finishReason` for the other three) — normalized to `stopReason`
 * here so `assistant-byok.ts` never branches on protocol to read it.
 *
 * @param capturedEndReason - The reason string each `run*Turn` function's own `onEvent` wrapper
 * recorded off the LAST `{type:'end'}` `ByokTurnEvent` the adapter emitted, if any. Preferred over
 * `result.stopReason`/`finishReason` when present: those two fields carry the raw provider
 * response's own stop code from the FINAL underlying HTTP call (e.g. Anthropic's `tool_use` when
 * the loop stopped because it hit its turn cap while the model still wanted to call more tools, not
 * because it was done) — genuinely different information from "why the ADAPTER'S OWN loop actually
 * ended," which is what a caller deciding how to explain the stop to a human needs. Before this
 * capture existed, a BYOK turn that hit `maxToolTurns` reported `stopReason: "tool_use"` on the
 * final SSE `end` event (see `assistant-byok.ts:215`'s old `result.stopReason ?? "stop"`) — visually
 * indistinguishable from an ordinary stop, even though the adapter's own `onEvent` stream had
 * already said `max_tool_turns` moments earlier. Falls back to the raw fields only when no `end`
 * event was observed at all (should not happen in practice — every adapter's own `createTurnEndGuard`
 * is documented to emit exactly one — but this function makes no assumption about a collaborator it
 * doesn't own).
 * Set by `onEvent` below off the adapter's own `{type:'end'}` — see `normalizeTurnResult`'s doc
 * for why this, not `result.stopReason`, is the reason a caller should actually be told.
 * `AnthropicTurnOptions.maxTokens` is non-optional — every other protocol here defaults it
 * server-side when omitted, Anthropic's own adapter does not, so this is the one place a
 * fallback belongs rather than pushing an Anthropic-specific default onto every caller.
 * `OpenAiToolResult` (unlike Anthropic/Google) carries no `isError` field at all — checked
 * directly in the adapter source, not assumed: a host-reported failure has nowhere on the wire to
 * go, so it is folded into `content` itself, or the model would see a denied/failed tool call as a
 * silent, contentless success.
 * See `runAnthropicTurn`'s identical local for why this exists.
 * NOT `isError: event.isError` — verified by reading `openai-chat.ts`'s own result guard:
 * it sets `isError` from ITS OWN content-shape validation (oversized/malformed images),
 * never from what `executeTool` returned, so the adapter's `isError` is `false` for any
 * plain-string result regardless of whether it says "[tool error]". Deriving it from the
 * fold marker instead is what makes this wire event (and therefore the chat pane's own
 * error styling, via `translateRunAgentPayload`) actually correct for a failed tool call —
 * without this, a denied/failed OpenAI-protocol tool call would render with no visual
 * distinction from a successful one.
 * Same wire gap as OpenAI above (Azure's chat/completions shape is OpenAI-compatible) —
 * `AzureToolResult` has no `isError` field, so a host failure is folded into `content`.
 * `AzureContentPart` is structurally `OpenAiContentPart` (Azure's chat/completions body is
 * byte-identical to OpenAI's), so the same mapping serves both.
 * See `runAnthropicTurn`'s identical local for why this exists.
 * Same derivation as `runOpenAiTurn` above, same reason — see that function's comment.
 * `parameters: googleParametersOf(d)`, NOT `inputSchemaOf(d)` — see that function's doc. Every
 * other protocol's tool-mapping in this module keeps calling `inputSchemaOf(d)` directly and
 * stays byte-identical; only Gemini's restricted OpenAPI-subset schema needs the strip.
 * Computed from the UNSANITIZED `inputSchemaOf(d)` (see `findNumericEnumPaths`'s doc for why it
 * has to be the original, not `googleParametersOf(d)`'s output) — one lookup per tool, reused for
 * every tool call in this turn, not recomputed per call.
 * Reverses `sanitizeGoogleSchema`'s numeric-enum-to-string conversion on the way back in — see
 * `coerceNumericEnumStringsToNumbers`'s doc for why this is required, not optional, for any tool
 * using that shape (`redirects_create`/`redirects_update`'s `statusCode` today).
 * See `runAnthropicTurn`'s identical local for why this exists.
 * Fabricated-role-marker events deliberately have no ByokTurnEvent case and are filtered by Jini;
 * the client translator cannot consume that provider-internal diagnostic.
 *
 * @complexity Dominated by the provider adapter's own request/tool-loop cost; the package maps
 * O(t) tool descriptors once and each emitted tool result in its number of content parts.
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
