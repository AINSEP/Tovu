/**
 * @file SPEC-046 REQ-4/REQ-6 — the client half of the `client_directive` channel's shape.
 *
 * Mirrors `src/assistant/site/client-directives.ts`'s server-side `ClientDirective` type exactly
 * (same field names, same literal `kind`/`type` discriminants) — duplicated rather than imported,
 * the same tradeoff `main.tsx`'s `MOUNT_ID` and `check-bundle-mounts.mjs`'s storage-key literals
 * already make: this is a standalone Vite app (`apps/site-chat`) with no dependency on the main
 * server's `src/` tree, so there is no shared runtime module either side could import from. If the
 * two ever drift, `isPageActionDirective` below fails closed (returns `false`, directive dropped)
 * rather than crashing on an unrecognized shape — see its own doc.
 *
 * REQ-6's "the client resolves nothing" holds here structurally: every `ResolvedPublicTarget` this
 * file consumes already carries a server-computed `path` — nothing in this file, `highlight.ts`, or
 * `SiteAssistantWidget.tsx` ever constructs a URL, path, or selector from a slug or title itself.
 */

export interface ResolvedPublicTarget {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}

export type PageAction =
  | { readonly type: "navigate"; readonly target: ResolvedPublicTarget; readonly auto: boolean }
  | { readonly type: "scroll_to"; readonly target: ResolvedPublicTarget }
  | { readonly type: "highlight"; readonly target: ResolvedPublicTarget };

export type ClientDirective =
  | { readonly kind: "page_action"; readonly action: PageAction }
  /** REQ-7 extension point only. No server code constructs one yet (the public MCP-UI allowlist
   *  ships empty, SPEC-046 §8) — this widget has no runtime handling for it either; see
   *  `SiteAssistantWidget.tsx`'s directive-processing loop, which explicitly no-ops on this kind
   *  rather than guessing at Tier B redemption behavior that was never specced for the public site. */
  | { readonly kind: "ui_surface"; readonly toolId: string; readonly resource: unknown };

function isResolvedPublicTarget(value: unknown): value is ResolvedPublicTarget {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && typeof v.title === "string" && typeof v.path === "string";
}

/**
 * Structural validation for one bare `PageAction` — shared by `isPageActionDirective` below (the SSE
 * wire boundary) and `main.tsx` (REQ-2's queued-action boundary: `session-store.ts`'s
 * `drainQueuedPageAction` returns `unknown` by design, since it round-trips through the session store
 * as JSON with no shape enforced at that layer — see that file's own doc). Both call sites need the
 * identical "is this actually a `PageAction`" check, so it lives once here rather than twice.
 */
function isPageAction(value: unknown): value is PageAction {
  if (typeof value !== "object" || value === null) return false;
  const action = value as Record<string, unknown>;
  if (action.type === "navigate") return isResolvedPublicTarget(action.target) && typeof action.auto === "boolean";
  if (action.type === "scroll_to" || action.type === "highlight") return isResolvedPublicTarget(action.target);
  return false;
}

/**
 * Structural validation for one SSE `client_directive` payload — the wire boundary between this
 * bundle and the server, so treated with the same "do not trust, narrow before use" posture as any
 * other external input (a stale cached bundle talking to a newer/older server is a realistic version
 * of "untrusted" here, not just a hostile one). Only `page_action` is recognized; a `ui_surface`
 * frame (or anything unrecognized) returns `false` — this bundle has no Tier B runtime, so the safe
 * default is to drop it rather than partially act on a shape nothing here was built to execute.
 *
 * @complexity O(1) — a fixed handful of property checks.
 * @overallScore 100
 */
export function isPageActionDirective(value: unknown): value is { kind: "page_action"; action: PageAction } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "page_action") return false;
  return isPageAction(v.action);
}

/**
 * SPEC-046 REQ-2's queued-action boundary: `drainQueuedPageAction()` (`session-store.ts`) hands back
 * `unknown` — same "do not trust the round-trip" posture as `isPageActionDirective`, just one layer
 * down (a bare `PageAction`, not a full `ClientDirective` envelope, since that is what
 * `SiteAssistantWidget.tsx` actually enqueues — see its own doc). `main.tsx` uses this to decide
 * whether a drained entry is safe to execute at all before ever touching the DOM with it.
 */
export function isQueuedPageAction(value: unknown): value is PageAction {
  return isPageAction(value);
}

/** The minimal shape `SiteAssistantWidget.tsx` needs from a `ChatMessage`'s `events` entry —
 *  structurally compatible with `@jini-ai/chat/core`'s real `AgentEvent`, kept narrow here so this
 *  file (and its tests) do not need to import that package's full union. */
interface DirectiveCarryingEvent {
  readonly kind: string;
  readonly name?: string;
  readonly data?: unknown;
}

/**
 * Extracts, in call order, every valid `page_action` from a settled message's `events`. A `ui_surface`
 * payload, a malformed shape, or anything that fails `isPageActionDirective` is silently skipped
 * rather than surfaced as an error — this bundle has no Tier B runtime and a version-mismatched
 * payload must degrade to "nothing happened," never a thrown error in the middle of rendering a
 * settled assistant reply.
 *
 * @complexity O(n) in event count for one settled message — bounded by REQ-3's history caps in
 *   practice, not a scaling concern.
 * @overallScore 100
 */
export function extractPageActions(events: readonly DirectiveCarryingEvent[] | undefined): PageAction[] {
  if (!events) return [];
  const actions: PageAction[] = [];
  for (const event of events) {
    if (event.kind !== "ext" || event.name !== "client_directive") continue;
    if (isPageActionDirective(event.data)) actions.push(event.data.action);
  }
  return actions;
}

export type NavigateAction = Extract<PageAction, { type: "navigate" }>;
export type NonNavigateAction = Exclude<PageAction, { type: "navigate" }>;

export interface SplitPageActions {
  /** At most one — `navigate_to_entry`'s own single-target-per-call shape (`tools.ts`) already
   *  bounds this to one per turn in practice; `find` (not `filter`) makes that bound explicit here
   *  too rather than assuming it. */
  readonly navigate: NavigateAction | null;
  /** At most one `scroll_to`/`highlight` action is acted on per settled reply — see
   *  `SiteAssistantWidget.tsx` for why a second one is simply not reachable today (each of
   *  `scroll_to_entry`/`highlight_entry` targets one slug, and the model gets one turn's worth of
   *  tool calls before replying). */
  readonly other: NonNavigateAction | null;
}

/** Splits a turn's resolved page actions into the (at most one) navigation and the (at most one)
 *  non-navigation action, so `SiteAssistantWidget.tsx` can decide navigate-vs-propose and
 *  highlight/scroll_to independently without re-scanning the array itself. */
export function splitPageActions(actions: readonly PageAction[]): SplitPageActions {
  const navigate = actions.find((a): a is NavigateAction => a.type === "navigate") ?? null;
  const other = actions.find((a): a is NonNavigateAction => a.type !== "navigate") ?? null;
  return { navigate, other };
}
