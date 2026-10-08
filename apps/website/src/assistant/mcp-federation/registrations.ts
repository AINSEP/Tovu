// Local federation forks moved to @jini-ai/mcp/federation (+ /stdio, /approvals); see development/DELETED-CODE.md.
import { ToolInputError } from "@jini-ai/core";
import { federatedApprovalClassFor } from "../tool-approval-policy.js";
import type { ToolApprovalClass } from "../../contracts/headless/assistant-tool-approval-policy.js";
import { FEDERATED_ENTITY_TYPE, FEDERATED_TOOL_PERMISSION, federatedCallConfirmationForAction, writeShapedInputNames } from "@jini-ai/mcp/federation";
import type { ToolRegistration, ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import {
  buildFederatedMcpRegistrations as buildJiniRegistrations,
  type FederationDeps as JiniFederationDeps,
} from "@jini-ai/mcp/federation";
import { McpAuthFailedError } from "@jini-ai/mcp/federation";
import { tovuFederationMessages } from "./presets.js";
import type { FederatedCallConfirmationOutcome, FederatedCallConfirmationRequest, FederatedCallTarget,
  FederatedMcpConnectionConfig, McpSessionPort, RemoteToolDescriptor } from "@jini-ai/mcp/federation";
import type { FederatedAdmissionReport } from "@jini-ai/mcp/federation";
// Implementation and security rationale: Jini/packages/mcp/src/federation/{registrations,trust}.ts.

/**
 * @file Turns one connected external MCP server into `ToolRegistration`s — the federated
 * counterpart of a domain's `tool-registrations.ts`, and deliberately NOT one of them.
 *
 * The structural point of this file is what it does not do. It does not call
 * `buildDomainRegistrations`, it does not appear in `assistant/tool-registrations.ts`'s
 * `DOMAIN_SLICES`, and it contributes nothing to `DERIVED_RISK_BY_TOOL_ID`. Those three mechanisms
 * are the native tier's guarantees — a reviewed static catalog, an independently-derived risk
 * classification, a build that fails on any entry that is neither wired nor explicitly excused —
 * and a runtime-discovered third-party tool can satisfy none of them. Routing federated tools
 * through them would not extend those guarantees to federated tools; it would only stop them
 * meaning anything for the native ones. So federation gets its own construction path, with its own
 * gates (`trust.ts`), and the two surfaces stay separable by id, by permission, and by audit source.
 *
 * They do converge in exactly one place, and it is unavoidable: the single `ToolRegistry` the
 * daemon's `ToolExecutor` executes against (`agent-daemon-server.ts`). A tool the executor cannot
 * see cannot be called. Convergence there is mechanical, and everything that makes the tiers
 * distinct — namespacing, the operator allowlist, the one-way hint rule, the untrusted-data
 * envelope, the coarse `admin.integrations.manage` gate — is applied on this side of it, before
 * anything is handed over. The audit trail stays separable for free: `tool-executor-audit.ts` wraps
 * the executor, so federated attempts are recorded like any other, distinguishable by their
 * `mcp__` id prefix.
 *
 * Authorization shape, in this file's own terms (the question every domain file answers): the
 * remote has no `authorize()` call of its own and never will, so the handler here performs the
 * check itself via the kit's `requireToolPermission` — the same shape as
 * `features/database/tool-registrations.ts`'s read handlers, which gate inline because their domain
 * functions carry no gate to inherit. It is one evaluator, not two (ADR-021 §2).
 *
 * Delegated implementation rationale (Jini helper names):
 * What `federate` needs from a composition root. A narrow slice of `RouteDeps`, deliberately —
 * federation touches no repo, no clock, no id generator, and asking for the whole bag would imply
 * otherwise.
 * Liveness AND revocation first — see `FederationDeps.assertConnectionUsable` for why this
 * precedes the permission check rather than following it.
 * ONE evaluator, run before anything crosses the network — not after, so a denied principal's
 * arguments are never even sent to a third party. `entityId` is the connection, so a
 * deployment can grant per-connection rather than all-or-nothing.
 * Fixed ONCE, before any card is drawn: the frozen copy the human sees is the same object that
 * is sent, so nothing that happens to `ctx.input` while the card waits can change what runs.
 * The REMOTE name, not the namespaced id — namespacing exists for Tovu's registry, and a
 * remote must never see, or be able to depend on, Tovu's naming.
 * A token valid at boot can die mid-session; nothing here re-probes it proactively (no
 * periodic refresh exists), so this is where that discovery actually happens. Handed to
 * `onAuthFailed` so the SAME durable state and terminal, non-retryable error this file's
 * `assertConnectionUsable` doc already promises apply here too — not just to a connection
 * already known dead at the call's start.
 * R7's media carve-out (trust.ts): image blocks are pulled out of `result.content` BEFORE the
 * untrusted-data envelope is built, so they reach the model through the daemon's typed
 * `media` channel (`extractResultMedia`) intact — see the shared Jini media-extraction rationale
 * for why stringifying them into the byte-capped text boundary instead would corrupt them.
 * R7. Every federated result reaches the model inside an untrusted-data boundary, including
 * the remote's own `isError` claim — which is reported as data rather than acted on, because
 * a remote lying about its own success is not a case this side can adjudicate.
 * The ONLY field `@jini-ai/daemon`'s `extractResultMedia` reads to hoist inline media onto
 * the `tool_result` wire event — see `demo-image-tool.ts` for the identical shape proven
 * end to end through the chat pane. Omitted (not an empty array) when there is nothing to
 * hoist, so a text-only result's return shape is byte-identical to before this existed.
 * Pass-through, matching `buildDomainRegistrations`'s identical choice and for the identical
 * ADR-021 §2 reason: the handler above IS this tool's one gate, and a `ToolPolicy` check would
 * be a second evaluator of the same rule.
 * Connects nothing and lists nothing itself — takes a session, drains its tool list, and returns
 * registrations. The one place `listTools` is called, so `trust.ts` R5's "frozen at connect" is a
 * property of the code rather than a convention: there is no other path that could re-list.
 *
 * @throws {Error} If `listTools` rejects — a connection that cannot enumerate is not usable, and
 * `bootstrap.ts` is where that is turned into "carry on without federation".
 * @complexity O(t) in the advertised tool count.
 * @overallScore 100
 * G3: the per-call human gate for protected actions (permanent deletion, delivery to people,
 * and changes to assistant privacy/instructions/access). Write-shaped names describe the card;
 * they do not independently require one (owner policy, 2026-10-07). Returns
 * `null` when the call may proceed — a read-only tool with ordinary inputs, or an explicit Confirm — and otherwise the
 * model-facing result that replaces the call. One card per call: the card is opened here, inside the
 * call it guards, and closes when answered, so one Confirm authorizes exactly one call.
 *
 * @throws {ToolInputError} `EXTERNAL_MCP_NO_CONFIRMATION_CHANNEL` when the root wired no confirmer —
 *   nothing is sent.
 * @complexity O(1) plus the wait for the human.
 * {@link normalizeArguments}, then a deep, frozen copy — the one object both shown and sent (G3).
 * Narrows `ToolExecutionContext.input` to the `arguments` object a `tools/call` carries.
 *
 * Undefined and `{}` both become `{}` — MCP servers routinely publish parameterless tools, and the
 * kit's own `requireNoInput` establishes that "omit it or pass `{}`" is this codebase's convention
 * for one. Anything else is refused rather than coerced: forwarding an array or a string as
 * `arguments` would produce a remote-side error the model cannot act on, and silently dropping it
 * would teach the model its argument was accepted.
 * extractFederatedImageBlocks (assistant/mcp-federation/trust.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */

/** Jini's mandatory-per-call flag also controls deletion styling; retain the actual host action
 * separately so a publication card never claims the server declared permanent deletion. */
export type FederatedPolicyConfirmationRequest = FederatedCallConfirmationRequest & { readonly approvalClass?: ToolApprovalClass };

/** What `federate` needs from a composition root. A narrow slice of `RouteDeps`, deliberately —
 * federation touches no repo, no clock, no id generator, and asking for the whole bag would imply
 * otherwise. */
export interface FederationDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  /**
   * A LIVENESS gate, checked before every federated call. Optional; when absent, behaviour is
   * exactly what it was before this existed.
   *
   * ## Why a gate rather than unregistering the tools
   *
   * Nothing in this subtree unregisters anything, and that is structural rather than an omission:
   * `buildToolCatalogQuery` snapshots `registry.list({})` into a ONE-SHOT FTS index at boot, so a tool
   * removed from the registry afterwards would still be discoverable by `search_tools` and
   * `describe_tool` while no longer being executable — strictly worse than leaving it registered.
   * `trust.ts` R5's "frozen at connect" guarantee rests on the same snapshot.
   *
   * So a connection that dies mid-run cannot be taken out of the catalog. What it CAN do is refuse
   * at the call, with an error the model can act on. Without that, the failure surfaces as
   * `mcp-federation: session is closed (<reason>)` — which reads like a transient fault, so the
   * model searches, selects the same tool, fails, and searches again, burning the rest of the run on
   * a server that cannot work until a human re-authorizes it.
   *
   * The gate is checked BEFORE the permission check for one reason: "this server is disconnected"
   * is true regardless of who is asking, and reporting a permission failure to a principal who does
   * have the permission would send them looking in the wrong place.
   *
   * This is ALSO where operator REVOCATION is enforced, not just liveness: a connection deleted,
   * disabled, narrowed (allowlist or write list), or otherwise changed since admission has no way to
   * be un-registered (see this doc's own paragraph above), so every one of those must be caught here
   * instead, on every call, by re-reading the connection's current row.
   * `assistant/external-mcp-oauth.ts`'s `createExternalMcpConnectionGate` is the composition root
   * that does both jobs — the original liveness check plus this revocation re-check
   * (`assistant/external-mcp-revocation.ts`'s `rosterRefusalFor`) — and it is NOT a `ToolPolicy` deny:
   * see that gate's own doc for why a handler-side refusal, not a policy one, is what lets the model
   * see WHY rather than a fixed "denied by policy" string.
   *
   * @param call - The tool's identity as admitted (remote name, declared annotations) plus the
   *   connection's origin, so the gate can tell a preset (no row to compare against) from a roster
   *   connection (re-checked against its current row every call).
   * @throws Whatever the composition root's terminal error is — for OAuth connections,
   * `assistant/external-mcp-oauth.ts`'s `ExternalMcpReauthRequiredError`, whose message tells the
   * model in words not to retry. For a revoked roster connection,
   * `assistant/external-mcp-revocation.ts`'s `ExternalMcpConnectionRevokedError`.
   */
  readonly assertConnectionUsable?: (connectionId: string, call: FederatedCallTarget) => void | Promise<void>;
  /**
   * Called when a live call throws {@link McpAuthFailedError} — the remote itself rejected our
   * authorization (HTTP 401), discovered mid-session rather than at boot. Optional; when absent,
   * the `McpAuthFailedError` propagates unchanged, which is a `McpProtocolError` and reads to a
   * model like any other transient transport fault (see `assertConnectionUsable` above for why that
   * shape invites a retry loop).
   *
   * A composition root that KNOWS what "authorization" means for this connection (an OAuth-backed
   * row, today — `assistant/external-mcp-oauth.ts`) wires this to record the durable state — so
   * `assertConnectionUsable`'s cheap row read catches the NEXT call instead of this module reaching
   * the network again — and to throw the same terminal, non-retryable error that path already uses.
   * Always throws; this module does not decide what replaces the original error.
   */
  readonly onAuthFailed?: (connectionId: string, error: McpAuthFailedError) => Promise<never>;
  /**
   * G3 (`trust.ts` R3): asks a human to Confirm or Cancel ONE protected action (permanent
   * deletion, delivery to real people, or assistant privacy/instructions/access changes), before
   * anything reaches the remote. Read-only hints alone do not determine confirmation. Wired by the composition root to the held-open
   * MCP-UI card (`assistant/external-mcp-call-confirmation.ts`).
   *
   * Optional only so a root with no human in the loop still type-checks: when it is absent, every
   * tool whose confirmation is not `"none"` is refused at the call and nothing is sent — fail closed,
   * never "run it anyway".
   */
  readonly confirmCall?: (ctx: ToolExecutionContext & ToolExecutionOptions, request: FederatedPolicyConfirmationRequest) => Promise<FederatedCallConfirmationOutcome>;
}

export interface FederatedRegistrationResult {
  readonly registrations: ToolRegistration[];
  /** The full accounting of what was admitted and refused, for the caller to log. */
  readonly report: FederatedAdmissionReport;
}

/** Binds Tovu's one CMS permission evaluator and translates workspace metadata to Jini scope.
 * Existing liveness, confirmation and 401 hooks remain host-owned; none becomes a permissive default.
 * @complexity O(1), no I/O at construction.
 */
export function toJiniFederationDeps({ deps }: { deps: FederationDeps }): JiniFederationDeps {
  return {
    messages: tovuFederationMessages, errorCode: "EXTERNAL_MCP", scope: deps.workspaceId,
    permissionGate: ({ context, permission, entityType, entityId }) => requireToolPermission({
      authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId,
      principalId: context.principal.id, permission,
    }, { entityType, entityId }),
    ...(deps.assertConnectionUsable ? { assertConnectionUsable: ({ connectionId, call }: { connectionId: string; call: FederatedCallTarget }) => deps.assertConnectionUsable!(connectionId, call) } : {}),
    onAuthFailed: async ({ connectionId, error }) => {
      // Both transports use the package's auth error identity; the terminal host hook receives it unchanged.
      if (deps.onAuthFailed) return deps.onAuthFailed(connectionId, error);
      throw error;
    },
    ...(deps.confirmCall ? { confirmCall: ({ context, request }: Parameters<NonNullable<JiniFederationDeps["confirmCall"]>>[0]) => deps.confirmCall!(context, request) } : {}),
  };
}

/** Adapts the admitted surface without listing again; Jini preserves its frozen-arguments and trust gates. */
export function buildFederatedMcpRegistrations(params: {
  tools: readonly RemoteToolDescriptor[]; session: McpSessionPort; config: FederatedMcpConnectionConfig;
  deps: FederationDeps; nativeToolIds: ReadonlySet<string>;
}): FederatedRegistrationResult {
  const toolByName = new Map(params.tools.map(tool => [tool.name, structuredClone(tool)]));
  const classify = (name: string, input: unknown) => federatedApprovalClassFor({ ...toolByName.get(name), input });
  const needsApproval = (name: string, input: unknown) => !['read', 'edit'].includes(classify(name, input));
  const deps: FederationDeps = { ...params.deps, ...(params.deps.confirmCall ? {
    // A mandatory destructive/publish approval must never be skipped by a remembered grant.
    confirmCall: (ctx, request) => params.deps.confirmCall!(ctx, needsApproval(request.remoteName, request.arguments)
      ? { ...request, destructive: true, approvalClass: classify(request.remoteName, request.arguments) } : request),
  } : {}) };
  const built = buildJiniRegistrations({ ...params, deps: toJiniFederationDeps({ deps }) });
  return { ...built, registrations: built.registrations.map((registration, index) => {
    const admitted = built.report.admitted[index]!;
    // Remote declarations only veto read-only admission; they never grant it.
    return { ...registration, ...(needsApproval(admitted.remoteName, {}) ? { descriptor: { ...registration.descriptor, readOnly: false } } : {}), handler: async (ctx, options = {}) => {
      // The package still owns admission, frozen transport arguments, liveness and authorization.
      // This host adapter adds the owner's CMS publication/trash policy until Jini has a policy port.
      const input = ctx.input ?? {};
      if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ToolInputError({ message: 'Federated tool arguments must be an object.' });
      const args = structuredClone(input) as Record<string, unknown>;
      const sharedConfirmation = federatedCallConfirmationForAction({ remoteName: admitted.remoteName, annotations: admitted.declaredAnnotations, args });
      if (needsApproval(admitted.remoteName, args) && sharedConfirmation === 'none') {
        // Recheck before asking as well as inside the original handler after the answer. A
        // confirmation never substitutes for admission, liveness or the permission evaluator.
        await deps.assertConnectionUsable?.(params.config.connectionId, { remoteName: admitted.remoteName, declaredAnnotations: admitted.declaredAnnotations, origin: params.config.origin });
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: FEDERATED_TOOL_PERMISSION }, { entityType: FEDERATED_ENTITY_TYPE, entityId: params.config.connectionId });
        if (!deps.confirmCall) throw new ToolInputError({ message: `EXTERNAL_MCP_NO_CONFIRMATION_CHANNEL: ${admitted.toolId}: this action requires human approval. Nothing was sent.` });
        const outcome = await deps.confirmCall({ ...ctx, ...options }, {
          connectionId: params.config.connectionId, connectionLabel: params.config.label, toolId: admitted.toolId,
          remoteName: admitted.remoteName, arguments: structuredClone(args), destructive: true, approvalClass: classify(admitted.remoteName, args),
          declaredAnnotations: admitted.declaredAnnotations, origin: params.config.origin,
          description: admitted.description, inputSchema: admitted.inputSchema,
          writeShapedInputs: writeShapedInputNames({ args }),
        });
        if (!outcome.confirmed) return outcome.result;
        if (ctx.signal.aborted) return { executed: false, cancelled: false, reason: 'abandoned' };
      }
      return registration.handler({ ...ctx, input: args }, options);
    } };
  }) };
}

/** Enumerates once at connect; Jini owns admission and the host supplies permission/policy ports. */
export async function federateSession(params: {
  session: McpSessionPort; config: FederatedMcpConnectionConfig; deps: FederationDeps; nativeToolIds: ReadonlySet<string>;
}): Promise<FederatedRegistrationResult> {
  // Keep one enumeration; both boot and hot reload must pass through the host policy adapter.
  const tools = await params.session.listTools();
  return buildFederatedMcpRegistrations({ ...params, tools });
}
