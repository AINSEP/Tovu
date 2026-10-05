/**
 * @module typed-answer-poster
 *
 * Binds `@jini-ai/chat/react`'s generic `createTypedAnswerPoster` to Tovu's own question tool and
 * admin route, for `ChatPane`'s `deliverTypedAnswer` in `AssistantDock.tsx`. Text the operator types
 * while the agent waits on an `assistant_ask_choice` card then answers that card instead of queueing
 * behind the run (where it would only go out after the question expired, as a second paid run).
 *
 * The server half is `apps/website/src/assistant/mcp-ui-tool-calls-route.ts`'s Shape 3: a body with
 * a non-blank `__typedAnswer` and no exchange id is routed to the one open `assistant_ask_choice`
 * exchange of the session's principal — 202 when delivered, 409 `SURFACE_NOT_PENDING` when nothing
 * is waiting.
 */
import { createTypedAnswerPoster, type DeliverTypedAnswer } from "@jini-ai/chat/react";

/**
 * The question tool that opted in to typed answers. Spelled here because the admin cannot import
 * the website's tool registrations; registered in `apps/website/src/assistant/tool-registrations.ts`.
 */
export const ASK_CHOICE_TOOL_ID = "assistant_ask_choice";

/** Tovu mounts the MCP-UI route behind the admin-session-gated prefix, same as `mcpUiToolCaller`. */
export const ADMIN_MCP_UI_TOOL_CALLS_PATH = "/api/admin/v1/mcp-ui/tool-calls";

/**
 * Builds the dock's typed-answer poster: same-origin, session cookie, Tovu's question tool.
 *
 * @param deps.fetch - The browser's fetch in production; a hand-written fake in tests.
 * @complexity O(1) per call — one request.
 */
export function createAdminTypedAnswerPoster({ fetch }: { fetch: typeof globalThis.fetch }): DeliverTypedAnswer {
  return createTypedAnswerPoster(
    { baseUrl: "", fetch, toolName: ASK_CHOICE_TOOL_ID },
    { path: ADMIN_MCP_UI_TOOL_CALLS_PATH },
  );
}
