/** Tovu policy and presentation ports. Lifecycle and stack order belong to daemon. */
import { randomBytes, randomUUID } from "node:crypto";
import type { ToolExecutor } from "@jini-ai/daemon";
import type { ToolRegistry } from "@jini-ai/core";
import { redactUserText } from "@jini-ai/chat/core";
import { buildFormSurface, type SurfaceField, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { withToolFailureRecovery as withDaemonRecovery, withRedactedToolFailures as withDaemonRedaction,
  createAssistantToolExecutor as createDaemonToolExecutor, mintToolErrorId as mintDaemonErrorId,
  describeDelegatedInternalError as describeDaemonError, delegatedToolErrorDisclosure as daemonErrorDisclosure,
  withFederatedRefusalDiagnosis as withDaemonFederationDiagnosis } from "@jini-ai/daemon/tool-recovery";
import type { ToolFailureRecord, RedactedToolFailuresDeps as DaemonFailureDeps,
  DelegatedInternalErrorContext, FederationBootStatus } from "@jini-ai/daemon/tool-recovery";
export { TOOL_ERROR_ID_PATTERN, readToolErrorId, isRedactedToolFailure } from "@jini-ai/daemon/tool-recovery";
export type { ToolFailureRecord, RedactedToolExecutionResult, DelegatedInternalErrorContext, FederationBootStatus } from "@jini-ai/daemon/tool-recovery";
import { findFederatedToolRefusal, FEDERATED_TOOL_ID_PREFIX, parseFederatedConnectionId } from "@jini-ai/mcp/federation";
import type { FederationAdmissionSnapshotEntry } from "@jini-ai/mcp/federation";
import { tovuFederationMessages } from "./mcp-federation/presets.js";
import { assertCredentialFreeField } from "../contracts/core/credential-token.js";
import { redactSecretShapes } from "../contracts/core/secret-redaction.js";
import { readOnlyRemedyRefusalMessage, tovuReadOnlyToolMessages } from "./read-only-tool-constraint.js";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
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

function recoverySurfaceUri(exchangeId: string): UIResourceUri {
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
    uri: recoverySurfaceUri(exchangeId),
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


export interface RedactedToolFailuresDeps { readonly mintErrorId?: () => string; readonly onFailure?: (record: ToolFailureRecord) => void }
export function mintToolErrorId(required: Record<string, never>, optional = {}): string {
  return mintDaemonErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") }, optional);
}
/** Default reporter receives only already-redacted messages from the shared owner. */
function failurePorts(options: RedactedToolFailuresDeps): DaemonFailureDeps {
  return { redactSecretShapes, mintErrorId: options.mintErrorId ?? (() => mintToolErrorId({}, {})),
    onFailure: options.onFailure ?? ((record) => console.error(`[tool-failure] ${record.errorId} tool=${record.toolId} run=${record.runId} execution=${record.executionId} principal=${record.principalId} redactions=${record.redactions}: ${record.message}`)) };
}
const recoveryPorts = {
  recoveryToolId: TOOL_FAILURE_RECOVERY_TOOL_ID,
  containsSecret: ({ text }: { text: string }) => redactUserText({ text }).secretRedacted,
  assertCredentialFreeField, readOnlyMessages: tovuReadOnlyToolMessages,
  formatReadOnlyRemedyRefusal: ({ refusal }: { refusal: string }) => readOnlyRemedyRefusalMessage(refusal),
  buildRecoveryForm: buildRecoveryFormResource,
};
export function withToolFailureRecovery(required: { inner: ToolExecutor; surfaceExchanges: SurfaceExchangeStore; registry: Pick<ToolRegistry, "list"> }, optional = {}): ToolExecutor {
  return withDaemonRecovery({ ...required, ...recoveryPorts }, optional);
}
export function withRedactedToolFailures(required: { inner: ToolExecutor }, options: RedactedToolFailuresDeps = {}): ToolExecutor {
  return withDaemonRedaction({ ...required, ...failurePorts(options) }, {});
}
export function describeDelegatedInternalError(required: { context: DelegatedInternalErrorContext }, options: RedactedToolFailuresDeps = {}): string {
  return describeDaemonError({ ...required, ...failurePorts(options) }, {});
}
export function delegatedToolErrorDisclosure(required: Record<string, never>, options: RedactedToolFailuresDeps = {}) {
  return daemonErrorDisclosure(failurePorts(options), required);
}
export interface AssistantToolExecutorDeps {
  readonly registry: ToolRegistry; readonly surfaceExchanges: SurfaceExchangeStore;
  readonly toolAttemptAudit?: { readonly sink: ToolAttemptAuditSink; readonly workspaceId: string };
  readonly toolFailures?: RedactedToolFailuresDeps;
}
export function createAssistantToolExecutor(required: AssistantToolExecutorDeps, optional = {}): ToolExecutor {
  const { toolAttemptAudit, toolFailures, ...deps } = required;
  return createDaemonToolExecutor({ ...deps, ...recoveryPorts, newExecutionId: randomUUID,
    toolFailures: failurePorts(toolFailures ?? {}),
    ...(toolAttemptAudit ? { toolAttemptAudit: { ...toolAttemptAudit,
      now: () => new Date().toISOString(), newAttemptId: randomUUID,
      onSinkError: () => console.error("[tool-audit] sink threw; execution is unaffected") } } : {}) }, optional);
}
export function withFederatedRefusalDiagnosis(required: { inner: ToolExecutor; getSnapshot: () => readonly FederationAdmissionSnapshotEntry[]; getBootStatus?: () => FederationBootStatus }, optional = {}): ToolExecutor {
  return withDaemonFederationDiagnosis({ inner: required.inner, newExecutionId: randomUUID, redactSecretShapes,
    isFederatedTool: ({ toolId }) => toolId.startsWith(FEDERATED_TOOL_ID_PREFIX), parseConnectionId: parseFederatedConnectionId,
    findRefusal: ({ toolId }) => findFederatedToolRefusal({ toolId, snapshot: required.getSnapshot(), messages: tovuFederationMessages }),
    ...(required.getBootStatus ? { getBootStatus: required.getBootStatus } : {}) }, optional);
}
