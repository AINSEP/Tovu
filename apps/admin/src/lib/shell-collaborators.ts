/**
 * @file Tovu's bindings for the collaborators the `@jini-ai/admin` shell takes by injection
 * (ex5-fnd-kit review, rv-g FIX 1/3). Jini's shell imports no core implementation and writes no
 * console output; this file is where the admin app chooses them.
 */
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { browserStreamPorts, type BrowserStreamPorts } from "@jini-ai/admin/shell/lib/browser-stream";
import { onAdminSecretRedacted } from "@jini-ai/admin/shell/lib/credential-card-guidance";
import { createVersionConflict } from "@jini-ai/admin/shell/lib/version-conflict";
import { createProbeErrorDescribers } from "@jini-ai/admin/shell/lib/stored-credential-endpoint";
import { createVisitorToolsPort } from "@jini-ai/admin/shell/lib/visitor-tools";
import { createAssistantPermanentDeletesPort } from "@jini-ai/admin/shell/lib/assistant-permanent-deletes";
import { createAssistantAgentsSnapshot } from "@jini-ai/admin/shell/lib/assistant-agents-snapshot";
import { createAgentInventorySnapshot } from "@jini-ai/chat/browser/agent-inventory";
import { createCredentialSubmitErrorClassifier } from "@jini-ai/admin/shell/lib/credential-submit-error";
import { createAssistantSubagentsPort } from "@jini-ai/admin/shell/lib/assistant-subagents";
import { createStandingDraftLocalBackup } from "@jini-ai/ui/panel-kit";
import type { UserTextRedactionOptions } from "@jini-ai/chat/core";
import { createTypedAnswerPoster, type DeliverTypedAnswer } from "@jini-ai/chat/react";
import { createA2uiActionPoster as createChatA2uiActionPoster, type CreateA2uiActionPosterOptions } from "@jini-ai/chat/transports/http";
import { ApiError, authenticatedAdminRequest } from "./admin-http/request";
import { WORKSPACE_ID } from "./admin-http/config";

/** The admin app's logger: core's console logger describes caught errors instead of printing them raw. */
export const adminLogger = createConsoleLogger({ prefix: "[admin]" });

/** Browser stream ports with the host's guarded call. A function, not a constant: the ports read
 *  `document`/`window`, which must not happen at module import. */
export function adminBrowserStreamPorts(_required = {}, _optional = {}): BrowserStreamPorts {
  return browserStreamPorts({ orFallbackSync });
}

/** Tovu wraps each MCP-UI card in its overflow-aware surface (`OverflowAwareMcpUiSurfaceCard`); the
 *  credential guide scrolls that wrapper, not the bare card, into view. */
export const MCP_UI_CARD_WRAPPER_SELECTOR = ".mcpui-surface-overflow-wrap";

/** The redaction callback the chat posters take, bound to Tovu's card markup. */
export function onTovuSecretRedacted(signal: Parameters<typeof onAdminSecretRedacted>[0]): void {
  onAdminSecretRedacted(signal, { cardWrapperSelector: MCP_UI_CARD_WRAPPER_SELECTOR });
}

/** Tovu's sidebar markup for the shell's label-tooltip hook: its item links, and Sites, which owns a
 *  measured name-only tooltip (the one host exception). */
export const SIDEBAR_TOOLTIP_ITEMS = { itemSelector: "a.cms-item" } as const;
export const sidebarOwnsTitle = ({ link }: { link: Element }): boolean => link.getAttribute("href")?.endsWith("/sites") ?? false;

/** The admin client's request-error guard: the same `instanceof ApiError` its `createAdminHttp` ports use. */
const isAdminApiError = (required: { error: unknown }): required is { error: ApiError } => required.error instanceof ApiError;

/** The stale-version 409 classifiers, bound to the admin client's `ApiError`. */
export const { isVersionConflict, readVersionConflict } = createVersionConflict({ isRequestError: isAdminApiError });

/** The stored-key probe-error wording, bound to the admin client's `ApiError`. */
export const { describeProbeError, createProbeErrorDescriber } = createProbeErrorDescribers({ isRequestError: isAdminApiError });

/** The assistant settings ports, sent through the admin session client's authenticated request. */
const adminRequestOps = { authenticatedAdminRequest };
export const visitorToolsPort = createVisitorToolsPort({ http: adminRequestOps, workspaceId: WORKSPACE_ID });
export const assistantPermanentDeletesPort = createAssistantPermanentDeletesPort({ http: adminRequestOps, workspaceId: WORKSPACE_ID });

/**
 * The assistant picker's last-seen agent inventory (Jini's `createAssistantAgentsSnapshot`). The key
 * is the one this browser has always used: versioned so a future change to the stored shape can
 * ignore old entries, and unchanged by the move so stored inventories survive.
 */
export const { readAgentsSnapshot, writeAgentsSnapshot } = createAssistantAgentsSnapshot({
  storageKey: "tovu.admin.assistant-agents.v1",
  createInventorySnapshot: createAgentInventorySnapshot,
});

/** The credential create/update rejection classifier, bound to the admin client's `ApiError`. */
export const classifyCredentialSubmitError = createCredentialSubmitErrorClassifier({ isRequestError: isAdminApiError });

/** The Full CLI (subagents) setting port, sent through the admin session client's authenticated request. */
export const assistantSubagentsPort = createAssistantSubagentsPort({ http: adminRequestOps, workspaceId: WORKSPACE_ID });

/** The standing-draft editor's local backup of refused work. The exact storage prefix is retained so
 *  refused work parked before extraction stays recoverable; storage failures remain best-effort. */
export const standingDraftLocalBackup = createStandingDraftLocalBackup({
  keyPrefix: "tovu.admin.standing-draft-backup.", getStorage: () => localStorage,
}, {});

/**
 * The question tool that opted in to typed answers. Spelled here because the admin cannot import
 * the website's tool registrations; registered in `apps/website/src/assistant/tool-registrations.ts`.
 */
export const ASK_CHOICE_TOOL_ID = "assistant_ask_choice";

/** Tovu mounts the MCP-UI route behind the admin-session-gated prefix, same as `mcpUiToolCaller`. */
export const ADMIN_MCP_UI_TOOL_CALLS_PATH = "/api/admin/v1/mcp-ui/tool-calls";

/**
 * Binds `@jini-ai/chat/react`'s generic `createTypedAnswerPoster` to Tovu's own question tool and
 * admin route, for `ChatPane`'s `deliverTypedAnswer` in `AssistantDock.tsx`. Text the operator types
 * while the agent waits on an `assistant_ask_choice` card then answers that card instead of queueing
 * behind the run (where it would only go out after the question expired, as a second paid run).
 *
 * The server half is `apps/website/src/assistant/mcp-ui-tool-calls-route.ts`'s Shape 3: a body with
 * a non-blank `__typedAnswer` and no exchange id is routed to the one open `assistant_ask_choice`
 * exchange of the session's principal — 202 when delivered, 409 `SURFACE_NOT_PENDING` when nothing
 * is waiting. Same-origin, session cookie, Tovu's question tool.
 *
 * @param deps.fetch - The browser's fetch in production; a hand-written fake in tests.
 * @complexity O(1) per call — one request.
 */
export function createAdminTypedAnswerPoster({ fetch }: { fetch: typeof globalThis.fetch }, options: UserTextRedactionOptions = {}): DeliverTypedAnswer {
  return createTypedAnswerPoster(
    { baseUrl: "", fetch, toolName: ASK_CHOICE_TOOL_ID },
    { path: ADMIN_MCP_UI_TOOL_CALLS_PATH, onSecretRedacted: onTovuSecretRedacted, ...options },
  );
}

/** Host route/cookie wiring for A2UI card actions; Jini owns exchange addressing and delivery outcomes. */
export function createA2uiActionPoster({ baseUrl }: { baseUrl: string }, options: CreateA2uiActionPosterOptions = {}) {
  return createChatA2uiActionPoster({ baseUrl, path: options.path ?? "/api/admin/v1/a2ui/actions", fetch: (url, init) => fetch(url, init),
    reportFailure: ({ args }) => console.error(...args),
  }, { timeoutMs: options.timeoutMs, headers: options.headers });
}
