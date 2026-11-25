/** Tovu policy and presentation ports. Lifecycle and stack order belong to daemon. */
import { randomBytes, randomUUID } from "node:crypto";
import type { ToolExecutor } from "@jini-ai/daemon";
import type { ToolRegistry } from "@jini-ai/core";
import { redactUserText } from "@jini-ai/chat/core";
import { buildFormSurface, type SurfaceField } from "@jini-ai/ui/mcp-ui/surfaces";
import type { UIResource, UIResourceUri } from "@jini-ai/core/contracts/site/protocol-mcp-ui";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { mintToolErrorId as mintCoreErrorId } from "@jini-ai/core/errors/error-id";
import { withToolFailureRecovery as withDaemonRecovery, withRedactedToolFailures as withDaemonRedaction,
  createAssistantToolExecutor as createDaemonToolExecutor,
  describeDelegatedInternalError as describeDaemonError, delegatedToolErrorDisclosure as daemonErrorDisclosure } from "@jini-ai/daemon/tool-recovery";
import type { RedactedToolFailuresDeps as DaemonFailureDeps, ToolFailureReporter, DelegatedToolErrorDisclosureResult,
  DelegatedInternalErrorContext } from "@jini-ai/daemon/tool-recovery";
export { TOOL_ERROR_ID_PATTERN, readToolErrorId, isRedactedToolFailure } from "@jini-ai/daemon/tool-recovery";
export type { RedactedToolExecutionResult, DelegatedInternalErrorContext, FederationBootStatus, ToolFailureReporter } from "@jini-ai/daemon/tool-recovery";
import { assertCredentialFreeField } from "../contracts/core/credential-token.js";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { readOnlyRemedyRefusalMessage, tovuReadOnlyToolMessages } from "./read-only-tool-constraint.js";
import type { ToolAttemptAuditSink } from "@jini-ai/core/contracts/site/daemon-tool-audit";
/**
 * The synthetic id this loop opens its own recovery surface's exchange under — NOT a registered
 * `ToolRegistry` tool (calling it through the ordinary tool-execution path would throw "unknown
 * tool"). It exists only so `SurfaceExchangeStore.deliver()` has a binding to check and the rendered
 * form's Confirm/Skip buttons have a `toolName` to call back through `mcp-ui-tool-calls-route.ts`'s
 * Shape 1 — the SAME reason `assistant_ask_choice`/`custom_credential_set_token` needed their own ids
 * added to `mcp-ui-tool-calls.ts`'s redemption allowlist. This id must be added there too, or the
 * rendered surface's own submission 403s before ever reaching this loop.
 */
export const TOOL_FAILURE_RECOVERY_TOOL_ID = "assistant_tool_failure_recovery";

function recoverySurfaceUri({ exchangeId }: { exchangeId: string }, _options = {}): UIResourceUri {
  return `ui://tovu/tool-failure-recovery/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the recovery surface: the hedged `hint` as the description, and — only when
 * {@link RemedyPlan.askFor} is set — exactly one plain-text field for the missing input. A plan with
 * no `askFor` renders a plain confirm/skip with no field at all, which is exactly the shape a remedy
 * tool needing nothing beyond what is already known (e.g. `custom_credential_set_token`'s `{label}`)
 * produces — see this file's header for why that is what keeps a secret out of this form.
 *
 * @complexity O(1) — at most one field.
 */
function buildRecoveryFormResource(input: { exchangeId: string; hint: string; remedyToolId: string; askFor?: { key: string; prompt: string } }, _optional = {}): UIResource {
  const { exchangeId, hint, remedyToolId, askFor } = input;
  const fields: SurfaceField[] = askFor ? [{ kind: "string", name: askFor.key, label: askFor.prompt, required: true }] : [];

  return buildFormSurface({
    uri: recoverySurfaceUri({ exchangeId: exchangeId }),
    title: "A tool call failed — try the suggested fix?",
    description: hint,
    details: [{ label: "Suggested fix", value: remedyToolId }],
    submitLabel: askFor ? "Save and retry" : "Retry",
    toolName: TOOL_FAILURE_RECOVERY_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    fields,
    cancel: {
      label: "Skip",
      toolName: TOOL_FAILURE_RECOVERY_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
    },
    app: { appName: "tovu-tool-failure-recovery", appVersion: "1" },
    preferredFrameSize: ["100%", askFor ? "340px" : "260px"],
  });
}


/** Only the id source is a Tovu choice; redaction is fixed to Tovu's one secret-shape policy. The
 * host record is NOT written here: the daemon's observation layer records every failure through the
 * injected reporter (P4-J4), so a second sink here would log each incident twice under two owners. */
export interface RedactedToolFailuresDeps { readonly mintErrorId?: () => string }
export function mintToolErrorId(required: Record<string, never>, optional = {}): string {
  return mintCoreErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") }, optional);
}
/** The two redaction collaborators daemon needs, bound to Tovu's secret-shape redactor. */
function failurePorts(options: RedactedToolFailuresDeps): DaemonFailureDeps {
  return { redactSecretShapes, mintErrorId: options.mintErrorId ?? (() => mintToolErrorId({}, {})) };
}
const recoveryPorts = {
  recoveryToolId: TOOL_FAILURE_RECOVERY_TOOL_ID,
  containsSecret: ({ text }: { text: string }) => redactUserText({ text }).secretRedacted,
  assertCredentialFreeField, readOnlyMessages: tovuReadOnlyToolMessages,
  formatReadOnlyRemedyRefusal: ({ refusal }: { refusal: string }) => readOnlyRemedyRefusalMessage({ refusal: refusal }),
  buildRecoveryForm: buildRecoveryFormResource,
};
export function withToolFailureRecovery(required: { inner: ToolExecutor; surfaceExchanges: SurfaceExchangeStore; registry: Pick<ToolRegistry, "list"> }, optional = {}): ToolExecutor {
  return withDaemonRecovery({ ...required, ...recoveryPorts }, optional);
}
/** Standalone redact-and-stamp adapter: no reporter, so it never records on its own. */
export function withRedactedToolFailures(required: { inner: ToolExecutor }, options: RedactedToolFailuresDeps = {}): ToolExecutor {
  return withDaemonRedaction({ ...required, ...failurePorts(options) }, {});
}
/** Same reporter as the site's tool stack, so a failure the stack already recorded is not recorded
 * again: daemon reuses a stamped id or dedupes the thrown object inside that one reporter. */
export function describeDelegatedInternalError({ context, reporter }: { context: DelegatedInternalErrorContext; reporter: ToolFailureReporter }, _optional: Record<string, never> = {}): DelegatedToolErrorDisclosureResult {
  return describeDaemonError({ context, reporter, redactSecretShapes }, {});
}
export function delegatedToolErrorDisclosure({ reporter }: { reporter: ToolFailureReporter }, _optional: Record<string, never> = {}) {
  return daemonErrorDisclosure({ reporter, redactSecretShapes }, {});
}
export interface AssistantToolExecutorDeps {
  readonly prepareGuidance?: import("@jini-ai/core/contracts/site/daemon").PrepareToolGuidance;
  readonly registry: ToolRegistry; readonly surfaceExchanges: SurfaceExchangeStore;
  /** The owning site's one reporter — required, so no executor can exist whose incidents go nowhere. */
  readonly reporter: ToolFailureReporter;
  readonly toolAttemptAudit?: { readonly sink: ToolAttemptAuditSink; readonly workspaceId: string };
  readonly toolFailures?: RedactedToolFailuresDeps;
  readonly observability?: Parameters<typeof createDaemonToolExecutor>[0]["observability"];
  readonly observabilityEnabled?: Parameters<typeof createDaemonToolExecutor>[0]["observabilityEnabled"];
}
export function createAssistantToolExecutor(required: AssistantToolExecutorDeps, optional = {}): ToolExecutor {
  const { toolAttemptAudit, toolFailures, observability, observabilityEnabled, ...deps } = required;
  return createDaemonToolExecutor({ ...deps, ...recoveryPorts, newExecutionId: randomUUID,
    toolFailures: failurePorts(toolFailures ?? {}),
    ...(observability ? { observability } : {}), ...(observabilityEnabled ? { observabilityEnabled } : {}),
    ...(toolAttemptAudit ? { toolAttemptAudit: { ...toolAttemptAudit,
      now: () => new Date().toISOString(), newAttemptId: randomUUID,
      onSinkError: () => console.error("[tool-audit] sink threw; execution is unaffected") } } : {}) }, optional);
}
