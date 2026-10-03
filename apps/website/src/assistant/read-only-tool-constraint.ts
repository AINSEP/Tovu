// Implementation and generic rationale: Jini/packages/daemon/src/read-only-tools.ts.
/**
 * @file The read-only tool constraint, carried BY THE EXECUTION rather than checked once at the
 * route that started it.
 *
 * ## The hole this closes
 *
 * `@jini-ai/mcp`'s `execute_readonly_delegated_tool` annotates itself `readOnlyHint: true` and asks
 * the daemon to refuse anything not registered read-only (`@jini-ai/daemon/http`'s `requireReadOnly`).
 * That route check is correct and still runs. It is also, on its own, defeated by the very next
 * layer: Tovu composes its `ToolExecutor` out of decorators (`agent-daemon-server.ts`), and a
 * decorator can dispatch a tool id the CALLER never named. `withToolFailureRecovery` does exactly
 * that — a `custom_credential_verify` call (genuinely read-only) fails, its diagnostic names
 * `custom_credential_set_username` as the remedy, and the loop calls that id, which durably writes
 * a Tovu-side column. A caller that explicitly chose the read-only gateway caused a write. That is
 * worse than having no read-only gateway at all: it launders a write past the caller's own gate.
 *
 * ## Why the constraint rides on the `Principal`
 *
 * `ToolExecutor.execute` carries `{ principal, run, toolId, input }` plus execution options —
 * so a separate request constraint would be forgotten by the next decorator somebody
 * writes, silently, and fail OPEN. `principal` is the one argument no decorator can drop: it is the
 * identity the call authorizes under, and a decorator that withheld it would break authorization
 * loudly rather than quietly widen it. So the constraint is modelled as what it actually is — an
 * ATTENUATED AUTHORITY, a principal permitted to invoke only tools that read — and
 * {@link constrainPrincipalToReadOnlyTools} is applied once, by `agent-daemon-server.ts`'s
 * host-owned `resolvePrincipal`, to the principal every dispatch in that execution then carries.
 *
 * ## Where it is enforced
 *
 * {@link withReadOnlyToolConstraint} wraps the BARE `createToolExecutor` — the innermost position in
 * the decorator stack. Every dispatch by every outer decorator, including ones not written yet, must
 * pass through it to reach a handler, so this is a gate on the class of defect (a decorator
 * dispatching an id the caller did not name) rather than on the one instance the audit found.
 *
 * ## One rule, one edit
 *
 * {@link refuseNonReadOnlyDispatch} is the ONLY place the question "may this dispatch proceed?" is
 * answered, and it answers it by asking `@jini-ai/core`'s `isReadOnlyTool` through `@jini-ai/daemon/read-only-tools` — the single
 * read-only determination the route and `@jini-ai/cms`'s wiring already consult. Its other two
 * consumers (the executor gate below, and `tool-failure-recovery.ts`'s pre-dispatch check, which
 * exists so a human is never asked to fill in a form whose answer would then be refused) call this
 * function; neither re-implements it. Changing what the constraint means is one edit, here.
 *
 * Fail-closed in all three directions, deliberately: an unregistered id, a registered id with no
 * read-only classification, and an absent registry are each a refusal. Silence is never read as
 * safety — the same posture `@jini-ai/core`'s `ToolDescriptor.readOnly` doc sets for its own
 * omitted flag.
 *
 * Architectural role: `src/assistant` composition-layer adapter, alongside `tool-executor-audit.ts`
 * and `tool-failure-recovery.ts` — depends on the kernel's `Principal`/`ToolRegistry`/`ToolExecutor`
 * shapes and on no domain feature.
 */
import { randomUUID } from "node:crypto";
import type { Principal, ToolRegistry } from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";
import {
  constrainPrincipalToReadOnlyTools as constrainDaemonPrincipal,
  refuseNonReadOnlyDispatch as refuseDaemonNonReadOnlyDispatch,
  readOnlyRemedyRefusalMessage as formatDaemonReadOnlyRemedyRefusal,
  withReadOnlyToolConstraint as withDaemonReadOnlyToolConstraint,
  type ReadOnlyToolMessages,
} from "@jini-ai/daemon/read-only-tools";

/**
 * Keep the host's principal API while Jini owns the attenuation rule.
 * A distinct toolAccess field leaves roles unchanged: a synthetic role would join every
 * ToolPolicy decision. Structural checking in daemon preserves the constraint across layers
 * typed as plain Principal; only the read-only dispatch decision interprets this field.
 * Copy the principal so a read-only request cannot constrain an unrelated caller's identity.
 * @param principal - The original caller identity; roles remain unchanged.
 * @returns A copied principal carrying the read-only tool constraint.
 * @complexity O(n) time and space over n principal properties.
 */
export function constrainPrincipalToReadOnlyTools(principal: Principal): ReturnType<typeof constrainDaemonPrincipal> {
  return constrainDaemonPrincipal({ principal });
}

/**
 * Refusal text for a read-only-constrained dispatch of a tool that is not registered read-only —
 * including one that is not registered at all, which is the same answer for the same reason
 * (nothing corroborates that it only reads). Deliberately worded like
 * `@jini-ai/daemon/http`'s own `readOnlyRefusalMessage` so a caller refused at either layer reads the
 * same remedy.
 */
export function readOnlyToolRefusalMessage(toolId: string): string {
  return `tool "${toolId}" is not registered as read-only — this execution was started through a read-only gateway and may run only tools whose registration declares readOnly; call it through execute_delegated_tool instead`;
}

/** Refusal text for a read-only-constrained dispatch this process cannot check, because the gate was
 *  wired without the registry. Refusing is the only safe answer — running an unverifiable call would
 *  be the exact laundering this module exists to stop. */
export const READ_ONLY_UNCHECKABLE_MESSAGE =
  "this execution was started through a read-only gateway but the read-only constraint cannot be checked — withReadOnlyToolConstraint was wired without a ToolRegistry, so the call is refused";

const messages: ReadOnlyToolMessages = {
  unverifiableMessage: READ_ONLY_UNCHECKABLE_MESSAGE,
  toolRefusalMessage: ({ toolId }) => readOnlyToolRefusalMessage(toolId),
};

/**
 * THE read-only dispatch decision. Every consumer asks this; none re-implements it.
 *
 * @param required.principal - The principal the dispatch carries. Unconstrained ⇒ always `null`.
 * @param required.toolId - The id actually about to be dispatched, which is NOT necessarily the id
 *   the caller named — that difference is the whole reason this function exists.
 * @param required.registry - Descriptors to resolve `toolId` against; `undefined` ⇒ refuse.
 * Generic classification and its rationale now live in Jini/packages/daemon/src/read-only-tools.ts;
 * this adapter supplies Tovu's wording.
 * @returns `null` when the dispatch may proceed, otherwise the refusal text to report.
 * @complexity O(1) for an unconstrained principal (one property read — every pre-existing call);
 *   O(n) in registered tool count for a constrained one, since `ToolRegistry` exposes enumeration
 *   rather than lookup by id.
 */
export function refuseNonReadOnlyDispatch(required: {
  readonly principal: Principal;
  readonly toolId: string;
  readonly registry: Pick<ToolRegistry, "list"> | undefined;
}, optional: Record<string, never> = {}): string | null {
  return refuseDaemonNonReadOnlyDispatch({ ...required, messages }, optional);
}

/**
 * What a recovery loop reports when it declines to run a remedy under a read-only execution.
 *
 * The original failure is still returned in full alongside this — the point is that the caller must
 * not be left believing nothing was ever going to be attempted. "Read-only path silently swallows
 * the remedy" is a different lie from "read-only path performs a write", not an improvement on it.
 *
 * @param refusal - Whatever {@link refuseNonReadOnlyDispatch} returned, quoted verbatim so the two
 *   surfaces never describe the same refusal two different ways.
 */
export function readOnlyRemedyRefusalMessage(refusal: string): string {
  return formatDaemonReadOnlyRemedyRefusal({
    refusal,
    formatMessage: ({ refusal }) =>
      `this call failed and its automatic recovery was NOT attempted: ${refusal}. The failure reported alongside this message is unchanged — nothing was written. Retry through execute_delegated_tool if the write is intended.`,
  });
}

export interface ReadOnlyToolConstraintDeps {
  /**
   * Same registry as the bare executor; descriptors only, never a handler reference.
   * Required-but-nullable forces wiring to answer what verifies the call: undefined
   * deliberately refuses every constrained dispatch rather than waiving the gate.
   */
  readonly registry: Pick<ToolRegistry, "list"> | undefined;
}

/**
 * Wraps `inner` so no read-only-constrained execution can dispatch a tool that writes — whichever
 * layer chose the id.
 *
 * Compose it INNERMOST, directly around `createToolExecutor`: every outer decorator has to come
 * through here to reach a handler, which is what makes this a gate on the defect class rather than
 * on one known decorator. An unconstrained principal reaches `inner` byte-identically, so every
 * pre-existing path — `execute_delegated_tool` included — is untouched.
 *
 * Tovu binds denial IDs and wording; the generic enforcement and its rationale now live in
 * Jini/packages/daemon/src/read-only-tools.ts. Deny before inner without a handler or kernel
 * audit record; denied is the existing authorization result, not a new throw. Mint a denial ID
 * because there is no inner execution ID to borrow.
 * @returns A drop-in `ToolExecutor`; `resumeConfirmation`/`cancel`/`getAuditRecord` delegate
 *   straight through, matching `withToolAttemptAudit`'s own shape.
 * @complexity One extra property read per unconstrained call; one registry scan per constrained one.
 */
export function withReadOnlyToolConstraint(inner: ToolExecutor, deps: ReadOnlyToolConstraintDeps): ToolExecutor {
  return withDaemonReadOnlyToolConstraint({
    inner,
    registry: deps.registry,
    idGenerator: { newId: () => randomUUID() },
    messages,
  });
}
