import {
  type AuthorizeFn,
  requireToolPermission,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { FederatedMcpConnectionConfig, McpSessionPort } from "./ports.js";
import {
  admitRemoteTools,
  assertNoNativeCollision,
  FEDERATED_ENTITY_TYPE,
  FEDERATED_TOOL_PERMISSION,
  wrapUntrustedResult,
  type FederatedAdmissionReport,
} from "./trust.js";

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
 */

/** What `federate` needs from a composition root. A narrow slice of `RouteDeps`, deliberately —
 * federation touches no repo, no clock, no id generator, and asking for the whole bag would imply
 * otherwise. */
export interface FederationDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
}

export interface FederatedRegistrationResult {
  readonly registrations: ToolRegistration[];
  /** The full accounting of what was admitted and refused, for the caller to log. */
  readonly report: FederatedAdmissionReport;
}

/**
 * Builds the `ToolRegistration`s for one federated connection from its already-listed tool surface.
 *
 * Split from the connect/list I/O on purpose: this function is pure given a session, so every trust
 * rule and every handler behaviour is testable without a transport.
 *
 * @param params.tools - The remote's advertised surface, verbatim and untrusted.
 * @param params.session - The live session, used only to forward `tools/call`.
 * @param params.config - The site owner's connection config — the trusted side of admission.
 * @param params.nativeToolIds - Every id already registered natively, for the R1 collision assertion.
 * @throws {Error} If a federated id would collide with a native one, or the connection id is invalid.
 * @complexity O(t) in the advertised tool count.
 * @overallScore 100
 */
export function buildFederatedMcpRegistrations(params: {
  tools: Parameters<typeof admitRemoteTools>[0]["tools"];
  session: McpSessionPort;
  config: FederatedMcpConnectionConfig;
  deps: FederationDeps;
  nativeToolIds: ReadonlySet<string>;
}): FederatedRegistrationResult {
  const { session, config, deps } = params;
  const report = admitRemoteTools({ tools: params.tools, config });

  assertNoNativeCollision(
    report.admitted.map((tool) => tool.toolId),
    params.nativeToolIds,
  );

  const registrations = report.admitted.map((tool): ToolRegistration => {
    const handler: ToolHandler = async (ctx) => {
      // ONE evaluator, run before anything crosses the network — not after, so a denied principal's
      // arguments are never even sent to a third party. `entityId` is the connection, so a
      // deployment can grant per-connection rather than all-or-nothing.
      await requireToolPermission(deps, {
        principalId: ctx.principal.id,
        permission: FEDERATED_TOOL_PERMISSION,
        entityType: FEDERATED_ENTITY_TYPE,
        entityId: config.connectionId,
      });

      const result = await session.callTool({
        // The REMOTE name, not the namespaced id — namespacing exists for Tovu's registry, and a
        // remote must never see, or be able to depend on, Tovu's naming.
        name: tool.remoteName,
        arguments: normalizeArguments(ctx.input),
        signal: ctx.signal,
      });

      // R7. Every federated result reaches the model inside an untrusted-data boundary, including
      // the remote's own `isError` claim — which is reported as data rather than acted on, because
      // a remote lying about its own success is not a case this side can adjudicate.
      return {
        federated: { connectionId: config.connectionId, tool: tool.remoteName, remoteReportedError: result.isError === true },
        untrusted: wrapUntrustedResult({
          connectionLabel: config.label,
          remoteName: tool.remoteName,
          result: { content: result.content, structuredContent: result.structuredContent },
          maxResultBytes: config.maxResultBytes,
        }),
      };
    };

    return {
      descriptor: { id: tool.toolId, description: tool.description, inputSchema: tool.inputSchema },
      // Pass-through, matching `buildDomainRegistrations`'s identical choice and for the identical
      // ADR-021 §2 reason: the handler above IS this tool's one gate, and a `ToolPolicy` check would
      // be a second evaluator of the same rule.
      policy: { authorize: () => "allow" },
      handler,
    };
  });

  return { registrations, report };
}

/**
 * Connects nothing and lists nothing itself — takes a session, drains its tool list, and returns
 * registrations. The one place `listTools` is called, so `trust.ts` R5's "frozen at connect" is a
 * property of the code rather than a convention: there is no other path that could re-list.
 *
 * @throws {Error} If `listTools` rejects — a connection that cannot enumerate is not usable, and
 * `bootstrap.ts` is where that is turned into "carry on without federation".
 * @complexity O(t) in the advertised tool count.
 * @overallScore 100
 */
export async function federateSession(params: {
  session: McpSessionPort;
  config: FederatedMcpConnectionConfig;
  deps: FederationDeps;
  nativeToolIds: ReadonlySet<string>;
}): Promise<FederatedRegistrationResult> {
  const tools = await params.session.listTools();
  return buildFederatedMcpRegistrations({ ...params, tools });
}

/**
 * Narrows `ToolExecutionContext.input` to the `arguments` object a `tools/call` carries.
 *
 * Undefined and `{}` both become `{}` — MCP servers routinely publish parameterless tools, and the
 * kit's own `requireNoInput` establishes that "omit it or pass `{}`" is this codebase's convention
 * for one. Anything else is refused rather than coerced: forwarding an array or a string as
 * `arguments` would produce a remote-side error the model cannot act on, and silently dropping it
 * would teach the model its argument was accepted.
 */
function normalizeArguments(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be an object — federated MCP tools take a JSON object of arguments, or omit input entirely");
  }
  return input as Record<string, unknown>;
}
