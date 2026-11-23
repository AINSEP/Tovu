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
import { createReadInitialAdminSession } from "@jini-ai/admin/shell/lib/local-owner-signin";
import { createAssistantSubagentsPort } from "@jini-ai/admin/shell/lib/assistant-subagents";
import { createOwnerMfaPort } from "@jini-ai/admin/shell/lib/owner-mfa-api";
import { createOwnerPasskeyPorts } from "@jini-ai/admin/shell/lib/owner-passkey-api";
import { createOwnerRecoveryFailure, createOwnerRecoveryPort } from "@jini-ai/admin/shell/lib/owner-recovery-api";
import { readInitialSession } from "@jini-ai/user-management/session-bootstrap";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ApiError, authenticatedAdminRequest, describeApiError, requestOnce } from "./admin-http/request";
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

/** The initial session read with local-owner bootstrap: user-management's reader plus the admin client's `ApiError`. */
export const readInitialAdminSession = createReadInitialAdminSession({ readInitialSession, isRequestError: isAdminApiError });

/** The Full CLI (subagents) setting port, sent through the admin session client's authenticated request. */
export const assistantSubagentsPort = createAssistantSubagentsPort({ http: adminRequestOps, workspaceId: WORKSPACE_ID });

/** The owner auth ports (MFA, passkeys, recovery): single-send requests through the admin client's `requestOnce`. */
const adminRequestOnceOps = { requestOnce };
export const ownerMfaPort = createOwnerMfaPort({ http: adminRequestOnceOps });
export const { settings: ownerPasskeySettingsPort, signIn: ownerPasskeySignInPort } = createOwnerPasskeyPorts({ http: adminRequestOnceOps });
export const ownerRecoveryPort = createOwnerRecoveryPort({ http: adminRequestOnceOps });
/** Recovery failures keep the server's explanation and redact with Tovu's secret-redaction vocabulary. */
export const ownerRecoveryFailure = createOwnerRecoveryFailure({ describeError: describeApiError, redactionOptions: TOVU_ERROR_REDACTION_OPTIONS });
