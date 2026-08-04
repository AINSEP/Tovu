/**
 * @module a2ui-action-poster
 *
 * The client half of A2UI's inbound transport: a ready-made `onAgentAction` handler for
 * `@jini-ai/chat/react`'s `A2uiSurfaceCard`, which relays a rendered surface's agent-directed
 * action to `src/assistant/a2ui-actions-route.ts` (proxied by `src/server/modules/assistant.ts`).
 *
 * ```tsx
 * const postA2uiAction = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });
 * registerExtEventRenderer("a2ui", (props) => <A2uiSurfaceCard {...props} onAgentAction={postA2uiAction} />);
 * ```
 *
 * Deliberately Tovu-local rather than added to `@jini-ai/chat/react` beside its MCP-UI sibling,
 * `create-mcp-ui-tool-caller.ts` — that helper earns its place in the shared package because two
 * different pieces of machinery (`useMcpUiHost`'s JSON-RPC relay and the View's own `tools/call`)
 * both depend on its exact request/response shape. This one has a single, host-owned call site
 * (`AssistantDock.tsx`) and no shared contract to keep in sync; promoting it to `@jini-ai/chat/react`
 * later, if a second host needs it, is a pure code move with no behavior change.
 *
 * ## Why `onAgentAction`'s `runId` parameter is not what names the destination
 *
 * `A2uiSurfaceCardProps.onAgentAction` is `(runId: string | undefined, message: unknown) => void |
 * Promise<A2uiAgentActionOutcome>` — but `runId` is the chat RUN's id, not the exchange this message
 * answers. A2UI correlates by its own `surfaceId` (`interpreter.buildAction`'s `action.surfaceId`),
 * and `demo-a2ui-tool.ts` (and every other A2UI-opening tool) sets a surface's `surfaceId` FROM the
 * exchange id it opened — so
 * `message.action.surfaceId` already IS the id `a2ui-actions-route.ts` needs, with nothing to derive
 * from `runId` at all. This mirrors `createMcpUiToolCaller`'s own `McpUiToolCallHandler` shape,
 * which likewise ignores any `runId` in favor of a self-contained correlation handle.
 *
 * ## What this deliberately does NOT do
 *
 * No client-side validation of `message` beyond confirming it carries a `surfaceId` to address —
 * `a2ui-actions-route.ts` is the real boundary, and it validates the full envelope against A2UI's
 * own `parseRendererToAgentMessage` schema. A client-side re-check would only be a check whose
 * result the server re-derives anyway.
 *
 * A failed POST is reported two ways: to the console (as before, for devtools debugging) and, now,
 * to the card itself. `A2uiSurfaceCard`'s `onAgentAction` grew a response channel — it may return
 * `Promise<{ok:true} | {ok:false; reason:string}>` — so this poster resolves that promise instead
 * of leaving the click to look like it silently did nothing. `reasonForStatus` below maps the
 * route's real status codes (`a2ui-actions-route.ts`) to wording a non-technical person can act on;
 * a 409 in particular must not read as something the human did wrong — it means the exchange the
 * human was answering has already closed (agent moved on, TTL expired, answered from another tab),
 * which is the common case, not an error in their own work.
 */

/** The `RendererToAgentMessage` shapes this module inspects for a `surfaceId` to address — kept as
 * a structural, not imported, type: this file has no other reason to depend on `@jini-ai/agentic`,
 * and `a2ui-actions-route.ts` is the actual schema authority. */
interface SurfaceAddressableMessage {
  action?: { surfaceId?: unknown };
  error?: { surfaceId?: unknown };
}

/**
 * What this poster reports back to `A2uiSurfaceCard` after attempting one delivery. Kept
 * structurally identical to (not imported from) `@jini-ai/chat/react`'s `A2uiAgentActionOutcome` —
 * same reasoning as {@link SurfaceAddressableMessage} above: this file has no other reason to
 * depend on that package's types. Importing it would buy no additional compile-time guarantee
 * either: `AssistantDock.tsx` passes this poster directly into `A2uiSurfaceCard`'s `onAgentAction`
 * prop, so TypeScript already structurally checks this function's return type against Jini's
 * declared prop type at that call site — a drift in the Jini type fails Tovu's typecheck there,
 * one level up from this file, regardless of whether this file imports the type by name.
 */
export type A2uiActionDeliveryOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const NO_SURFACE_ID_REASON = "This action doesn't say which surface it answers, so there's nowhere to send it.";

/**
 * Maps `a2ui-actions-route.ts`'s real non-2xx status codes to wording a non-technical person can
 * act on. Deliberately keyed on status alone, not the route's `code`/`error` fields — every 400
 * cause (bad JSON shape, a schema-rejected envelope, a `surfaceId`/`exchangeId` mismatch) reduces to
 * the same actionable advice for a human, and a coarser mapping is less to keep in sync as the
 * route's validation grows new failure modes.
 *
 * @param status - The response's HTTP status. Only called for a non-`ok` response.
 * @complexity O(1).
 * @overallScore 100
 */
function reasonForStatus(status: number): string {
  switch (status) {
    case 409:
      // `a2ui-actions-route.ts`'s own comment on this status: "no such exchange" and "already
      // closed" both mean "this surface is no longer the one waiting on you" — the common case, not
      // a mistake the human just made, so the wording must not read as one.
      return "This surface is no longer waiting for a response — the agent has already moved on.";
    case 400:
      return "The agent didn't recognize this action. Reloading the conversation may fix it.";
    case 401:
      return "Your session couldn't be verified. Try reloading the page.";
    default:
      return `The action couldn't be delivered (server returned ${status}).`;
  }
}

export interface CreateA2uiActionPosterOptions {
  /** Path appended to `baseUrl`. Defaults to `/api/admin/v1/a2ui/actions` — Tovu's one mount point. */
  readonly path?: string;
  /** Abandon a call after this many ms. Defaults to 30s, matching `createMcpUiToolCaller`'s own default. */
  readonly timeoutMs?: number;
  /** Extra headers per request. `content-type` is always set and cannot be overridden. */
  readonly headers?: Readonly<Record<string, string>>;
}

const DEFAULT_PATH = "/api/admin/v1/a2ui/actions";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The exchange id a renderer→agent message declares, or `undefined` if it declares none.
 *
 * Only `action` and `error` carry `surfaceId` on the wire — `functionResponse` correlates by
 * `functionCallId` instead (see `interpreter.ts`'s module doc, decision 2). `buildAction`'s
 * agent-directed branch only ever produces an `ActionMessage`, so the `functionResponse` case is
 * unreachable from this call site today; handled anyway so this function's contract does not
 * silently depend on that.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function surfaceIdOf(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const { action, error } = message as SurfaceAddressableMessage;
  const candidate = typeof action?.surfaceId === "string" ? action.surfaceId : error?.surfaceId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

/**
 * Builds an `A2uiSurfaceCardProps["onAgentAction"]` handler that POSTs `{exchangeId, message}` to
 * `baseUrl + path` and resolves to the delivery outcome, which the card uses to show a
 * delivery-failure notice instead of leaving a click that looks like it did nothing.
 *
 * @param baseUrl - Origin to call. `""` for same-origin, the common case for an admin UI proxied to
 * its own API.
 * @complexity O(1) — one request per call.
 */
export function createA2uiActionPoster(
  baseUrl: string,
  options: CreateA2uiActionPosterOptions = {},
): (runId: string | undefined, message: unknown) => Promise<A2uiActionDeliveryOutcome> {
  const path = options.path ?? DEFAULT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${baseUrl.replace(/\/$/u, "")}${path}`;

  return async (runId, message) => {
    const exchangeId = surfaceIdOf(message);
    if (!exchangeId) {
      // Not reachable from `A2uiSurfaceCard`'s own call site today (see this module's doc), but a
      // future `wantResponse`/`callFunction` path could reach here with a message this poster has no
      // address for — reported rather than silently dropped, so a real gap is visible in devtools
      // instead of looking like an action that quietly did nothing.
      console.error(`[a2ui] cannot deliver an action with no surfaceId (run ${runId ?? "unknown"})`, message);
      return { ok: false, reason: NO_SURFACE_ID_REASON };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { ...options.headers, "content-type": "application/json" },
        body: JSON.stringify({ exchangeId, message }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(`[a2ui] action delivery failed (${response.status}) for surface ${exchangeId}`, detail);
        return { ok: false, reason: reasonForStatus(response.status) };
      }
      return { ok: true };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      console.error(`[a2ui] action delivery failed for surface ${exchangeId}`, timedOut ? `timed out after ${timeoutMs}ms` : error);
      return {
        ok: false,
        reason: timedOut
          ? "This took too long to deliver and was given up on."
          : "Couldn't reach the server to deliver this action.",
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
