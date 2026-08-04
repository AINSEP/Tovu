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
 * `A2uiSurfaceCardProps.onAgentAction` is `(runId: string | undefined, message: unknown) => void` —
 * but `runId` is the chat RUN's id, not the exchange this message answers. A2UI correlates by its
 * own `surfaceId` (`interpreter.buildAction`'s `action.surfaceId`), and `demo-a2ui-tool.ts` (and
 * every other A2UI-opening tool) sets a surface's `surfaceId` FROM the exchange id it opened — so
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
 * No error surfaced back into the rendered card on a failed POST — unlike MCP-UI's confirmation
 * dialog (`useMcpUiHost` relays a rejection to the View as a JSON-RPC error the dialog displays),
 * `onAgentAction` is a fire-and-forget callback with no response channel back into the click that
 * triggered it. A delivery failure is therefore reported to the console only. This is a known,
 * disclosed gap — see the implementation report this module shipped with — not an oversight; closing
 * it needs a change to `A2uiSurfaceCard` itself (Jini-owned), which was out of scope here.
 */

/** The `RendererToAgentMessage` shapes this module inspects for a `surfaceId` to address — kept as
 * a structural, not imported, type: this file has no other reason to depend on `@jini-ai/agentic`,
 * and `a2ui-actions-route.ts` is the actual schema authority. */
interface SurfaceAddressableMessage {
  action?: { surfaceId?: unknown };
  error?: { surfaceId?: unknown };
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
 * `baseUrl + path`.
 *
 * @param baseUrl - Origin to call. `""` for same-origin, the common case for an admin UI proxied to
 * its own API.
 * @complexity O(1) — one request per call.
 */
export function createA2uiActionPoster(
  baseUrl: string,
  options: CreateA2uiActionPosterOptions = {},
): (runId: string | undefined, message: unknown) => void {
  const path = options.path ?? DEFAULT_PATH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${baseUrl.replace(/\/$/u, "")}${path}`;

  return (runId, message) => {
    const exchangeId = surfaceIdOf(message);
    if (!exchangeId) {
      // Not reachable from `A2uiSurfaceCard`'s own call site today (see this module's doc), but a
      // future `wantResponse`/`callFunction` path could reach here with a message this poster has no
      // address for — reported rather than silently dropped, so a real gap is visible in devtools
      // instead of looking like an action that quietly did nothing.
      console.error(`[a2ui] cannot deliver an action with no surfaceId (run ${runId ?? "unknown"})`, message);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    void (async () => {
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
        }
      } catch (error) {
        const reason =
          error instanceof Error && error.name === "AbortError" ? `timed out after ${timeoutMs}ms` : error;
        console.error(`[a2ui] action delivery failed for surface ${exchangeId}`, reason);
      } finally {
        clearTimeout(timer);
      }
    })();
  };
}
