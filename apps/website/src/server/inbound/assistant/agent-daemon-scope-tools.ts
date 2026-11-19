import type { AgentDaemonCoreDeps } from "../../runtime/composition/agent-daemon-core-deps.js";
import { createChatSettingsGetRegistration } from '@jini-ai/daemon/chat-settings';
import { createDaemonSiteTools } from "./agent-daemon-site-tools.js";
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { createToolRegistry } from "@jini-ai/core";
import { createRoutingToolExecutor } from "@jini-ai/daemon";
import { createFrontendControl } from "@jini-ai/daemon/http";
import { adminFrontendOwner, adminFrontendRunOwner } from "#src/assistant/admin-frontend-owner";
import { nodeSessionTimer } from "../../runtime/composition/jini-routes.js";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";
import { pageApprovalOptions } from "#src/assistant/page-approval-context";
import { FRONTEND_CONTROL_CAPABILITIES, withReadOnlyFrontendCapabilities } from "#src/assistant/frontend-control-capabilities";
import { withReadOnlyToolConstraint } from "#src/assistant/read-only-tool-constraint";
import { createAssistantToolExecutor } from "#src/assistant/tool-recovery-preset";
import { createLostFrontendBindings } from "#src/assistant/lost-frontend-binding";
import { withPageNavigateErrorRewrap } from "#src/assistant/rewrap-page-navigate-error";

export function createScopeToolRegistry({ env, siteToolToken, routeDeps, surfaceExchanges, readSnapshot, contextFor, execute }: {
  env: NodeJS.ProcessEnv; siteToolToken: string; routeDeps: Pick<AgentDaemonCoreDeps, 'toolAttemptAuditSink' | 'workspaceId'>;
  surfaceExchanges: Parameters<typeof createAssistantToolExecutor>[0]['surfaceExchanges'];
  readSnapshot: Parameters<typeof createChatSettingsGetRegistration>[0]['readSnapshot'];
  contextFor: NonNullable<Parameters<typeof createDaemonSiteTools>[0]['contextFor']>;
  execute: Parameters<typeof pageApprovalOptions>[0]['execute'];
}, _optional = {}) {
const registry = createToolRegistry({});
registry.register(createChatSettingsGetRegistration({ readSnapshot }));
const siteTools = createDaemonSiteTools({
  baseUrl: env.TOVU_SITE_CALLBACK_ORIGIN ?? env.TOVU_SITE_LISTENER_ORIGIN ?? "",
  token: siteToolToken, localRegistry: registry,
  audit: { sink: routeDeps.toolAttemptAuditSink, workspaceId: routeDeps.workspaceId },
  contextFor,
});
const visibleRegistry = siteTools.registry;

/**
 * Runs whose tab bound with a token this daemon does not know — the tab outlived a restart and has
 * not reconnected yet. Their frontend tools say "reload the admin page" instead of the bare "no
 * frontend is bound". See `lost-frontend-binding.ts`.
 */
const lostFrontendBindings = createLostFrontendBindings();

/**
 * Agent-driven control of the admin's own browser tab and chat pane — `page.navigate`,
 * `page.scroll_to`, `page.find_elements`, `chat.send_message`, `admin.capture_screenshot`, and the
 * rest of {@link FRONTEND_CONTROL_CAPABILITIES} (`page.*` plus all seven of `chat.*`'s verbs — as
 * of 2026-09-24 `chat.reset_conversation` is included too, via a Tovu-owned clone; see that
 * module's own doc for why — plus Tovu's own `admin.*` additions).
 *
 * `createFrontendControl` assembles the three parts (session registry, gated tool registrations,
 * the stream/response routes) and deliberately never hands back the registry — its `invoke`
 * executes a capability on a real admin's real screen with no policy check, no timeout and no
 * audit record, and is safe only because the one thing that can reach it is a `ToolHandler`
 * `ToolExecutor` has already gated.
 *
 * `FRONTEND_CONTROL_CAPABILITIES` is imported rather than restated so the manifest the daemon
 * gates and the manifest `apps/admin` executes are the same array — the two cannot drift into a
 * state where an agent is offered a verb the page/chat pane does not implement, or vice versa.
 */
const frontendControl = createFrontendControl({
  capabilities: FRONTEND_CONTROL_CAPABILITIES,
  setTimer: nodeSessionTimer,
  session: { resolveOwner: async (input) => adminFrontendOwner({ ...input, workspaceId: routeDeps.workspaceId }) },
  resolveBindOwner: ({ request }) => adminFrontendRunOwner({ contextRef: request.contextRef, workspaceId: routeDeps.workspaceId }),
  /**
   * Which tab this run may drive. Tovu's own `contextRef` envelope carries it, put there by the
   * admin's `FrontendSessionBridge` (`apps/admin/src/lib/assistant-transport.ts`) and passed
   * through untouched by the proxy.
   *
   * `undefined` is normal, not an error — a run with no originating surface (a future CLI or
   * scheduled trigger) is still legitimate; it simply has no screen, and each `page.*` call it
   * makes is refused by name rather than hanging. A malformed envelope is treated the same way:
   * `onStarted` below already reports and fails the run for that, so throwing here as well would
   * turn one diagnosable error into two.
   */
  resolveBindToken: ({ request }) => {
    try {
      const parsed = JSON.parse(request.contextRef) as { frontendBindToken?: unknown };
      return typeof parsed.frontendBindToken === "string" && parsed.frontendBindToken.length > 0
        ? parsed.frontendBindToken
        : undefined;
    } catch {
      return undefined;
    }
  },
}, {
  // Pass-through `allow`, matching ADR-021 §2 and every other Tovu registration (see
  // `Jini packages/core/src/registration-kit.ts`). It is not a missing check: these verbs carry no Tovu permission
  // of their own, and the authorization that matters already happened twice before a call gets
  // here — Tovu's proxy required an admin session to start the run at all, and the daemon will
  // only route the invocation to the one surface bound to THAT run. An agent therefore cannot
  // reach a tab other than the one whose own admin started it.
  policy: { authorize: () => "allow" },
  // Page text is untrusted input to whatever model reads the result back. `page.find_elements`
  // returns labels and values written by the page itself, so bound what one call can return.
  maxOutputBytes: 64 * 1024,
  onBindError: (context) => {
    console.error(`[agent-daemon] run ${context.runId}: could not bind to a frontend surface`, context.error);
    lostFrontendBindings.noteBindError(context);
  },
});
// `withPageNavigateErrorRewrap` (Tovu-side, `assistant/rewrap-page-navigate-error.ts`) rewraps ONLY
// `page.navigate`'s registration so its "not a published page" refusal (`@jini-ai/agentic`'s
// `page-executor.ts:414`) cannot be misread as this codebase's own, unrelated
// `PostRecord.status === "published"` CMS-content concept — see that module's own header for the
// full rationale. Every other registration passes through unchanged.
// `withReadOnlyFrontendCapabilities` marks page.find_elements and admin.capture_screenshot read-only,
// so the read-only delegated-tool gateway runs them (see `frontend-control-capabilities.ts`).
for (const registration of withPageNavigateErrorRewrap(withReadOnlyFrontendCapabilities(frontendControl.toolRegistrations))) {
  // Page clicks carry arbitrary UI effects; apply the same reviewed host policy as WebMCP.
  // Every frontend registration needs a classification, including local chat operations.
  // The server's human chat-card exchange owns page approval for every transport. The browser
  // bridge has no second dialog gate, so an opaque click asks exactly once, including on AG-UI.
  const bound = lostFrontendBindings.wrap({ registration });
  registry.register(applyToolApprovalPolicy({ registration: bound, surfaces: { surfaceExchanges } },
    pageApprovalOptions({ toolId: registration.descriptor.id, execute })));
}
  return { registry, siteTools, visibleRegistry, lostFrontendBindings, frontendControl };
}

export function createScopeToolExecutor({ routeDeps, registry, surfaceExchanges, siteTools, idlePark }: {
  routeDeps: Pick<AgentDaemonCoreDeps, 'toolAttemptAuditSink' | 'workspaceId'>; registry: ReturnType<typeof createToolRegistry>;
  surfaceExchanges: Parameters<typeof createAssistantToolExecutor>[0]['surfaceExchanges']; siteTools: ReturnType<typeof createDaemonSiteTools>;
  idlePark: Pick<ReturnType<typeof createAgentDaemonIdlePark>, 'hold'>;
}, _optional = {}) {
// Wrapped, not bare: `@jini-ai/daemon`'s executor keeps its audit records in an in-process `Map`
// and mints them only AFTER authorization resolves, so an unknown tool id or a throwing
// authorization leaves no trace at all, and everything else is lost on restart. The decorator
// appends a `requested` row before delegating, which is the only ordering under which those cases
// are recorded. Audit is observation — a sink failure can never change a tool call's outcome.
// See `Jini packages/daemon/src/core/tool-audit.ts`.
// The retained root chooses this same site's content-kernel sink once (or the bounded local
// memory sink). Reuse that connection: a second openContentDb here used to open/migrate a second
// content.db solely for audit. Site tool audit runs at the server owner; this sink observes local
// frontend calls and discovery without constructing site handlers or a second site composition.
const auditSink = routeDeps.toolAttemptAuditSink;
// Local UI effects retain their approved gating/audit stack. Site effects use the server's
// complete stack; the outer descriptor gate verifies read-only authority before either route.
const localToolExecutor = createAssistantToolExecutor({ registry, surfaceExchanges,
  toolAttemptAudit: { sink: auditSink, workspaceId: routeDeps.workspaceId } }, {});
const toolExecutor = withReadOnlyToolConstraint(createRoutingToolExecutor({
  local: localToolExecutor, remote: siteTools.remote,
  isLocal: ({ toolId }) => registry.has({ toolId }),
}, { acquireActivity: () => idlePark.hold({}, {}) }), { registry: siteTools.registry });

  return toolExecutor;
}
