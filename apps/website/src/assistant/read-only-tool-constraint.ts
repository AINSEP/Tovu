/**
 * @file The read-only tool constraint, carried BY THE EXECUTION rather than checked once at the
 * route that started it.
 *
 * ## The hole this closes
 *
 * `@jini-ai/mcp`'s `execute_readonly_delegated_tool` annotates itself `readOnlyHint: true` and asks
 * the daemon to refuse anything not registered read-only (`@jini-ai/http-kit`'s `requireReadOnly`).
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
 * `ToolExecutor.execute` is positional — `(principal, run, toolId, input, signal, emitSurface)` —
 * so a constraint added as a seventh argument would be forgotten by the next decorator somebody
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
 * answered, and it answers it by asking `@jini-ai/core`'s `isReadOnlyTool` — the single
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

import { isReadOnlyTool, type Principal, type RunRef, type SurfaceEmitter, type ToolRegistry } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

/**
 * A `Principal` narrowed to tools that only read.
 *
 * A distinct field rather than an extra `Principal.roles` entry: `roles` is what a `ToolPolicy`
 * branches on, and a synthetic role would silently join that decision for every registration in the
 * process. This field is inert to everything except {@link refuseNonReadOnlyDispatch}.
 */
export interface ReadOnlyConstrainedPrincipal extends Principal {
  readonly toolAccess: "read-only";
}

/** Attenuates `principal` for one execution: it may now invoke only tools registered read-only. */
export function constrainPrincipalToReadOnlyTools(principal: Principal): ReadOnlyConstrainedPrincipal {
  return { ...principal, toolAccess: "read-only" };
}

/**
 * Whether `principal` is carrying the read-only attenuation.
 *
 * Reads the field structurally, so a principal that travelled through layers typed as the plain
 * kernel `Principal` (every decorator between here and the route) still answers truthfully.
 *
 * @complexity O(1).
 */
export function principalIsReadOnlyConstrained(principal: Principal): boolean {
  return (principal as Partial<ReadOnlyConstrainedPrincipal>).toolAccess === "read-only";
}

/**
 * Refusal text for a read-only-constrained dispatch of a tool that is not registered read-only —
 * including one that is not registered at all, which is the same answer for the same reason
 * (nothing corroborates that it only reads). Deliberately worded like
 * `@jini-ai/http-kit`'s own `readOnlyRefusalMessage` so a caller refused at either layer reads the
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

/**
 * THE read-only dispatch decision. Every consumer asks this; none re-implements it.
 *
 * @param options.principal - The principal the dispatch carries. Unconstrained ⇒ always `null`.
 * @param options.toolId - The id actually about to be dispatched, which is NOT necessarily the id
 *   the caller named — that difference is the whole reason this function exists.
 * @param options.registry - Descriptors to resolve `toolId` against; `undefined` ⇒ refuse.
 * @returns `null` when the dispatch may proceed, otherwise the refusal text to report.
 * @complexity O(1) for an unconstrained principal (one property read — every pre-existing call);
 *   O(n) in registered tool count for a constrained one, since `ToolRegistry` exposes enumeration
 *   rather than lookup by id.
 */
export function refuseNonReadOnlyDispatch(options: {
  readonly principal: Principal;
  readonly toolId: string;
  readonly registry: Pick<ToolRegistry, "list"> | undefined;
}): string | null {
  if (!principalIsReadOnlyConstrained(options.principal)) return null;
  if (options.registry === undefined) return READ_ONLY_UNCHECKABLE_MESSAGE;
  const descriptor = options.registry.list().find((candidate) => candidate.id === options.toolId);
  if (isReadOnlyTool(descriptor)) return null;
  return readOnlyToolRefusalMessage(options.toolId);
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
  return `this call failed and its automatic recovery was NOT attempted: ${refusal}. The failure reported alongside this message is unchanged — nothing was written. Retry through execute_delegated_tool if the write is intended.`;
}

export interface ReadOnlyToolConstraintDeps {
  /**
   * The SAME registry `inner` was built over — descriptors only; this gate never reaches a handler.
   *
   * Required-but-nullable rather than optional, so wiring this decorator forces an explicit answer
   * to "what do I check against?" A caller that genuinely has none gets a gate that refuses every
   * constrained dispatch ({@link READ_ONLY_UNCHECKABLE_MESSAGE}), never one that waives them.
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
 * @returns A drop-in `ToolExecutor`; `resumeConfirmation`/`cancel`/`getAuditRecord` delegate
 *   straight through, matching `withToolAttemptAudit`'s own shape.
 * @complexity One extra property read per unconstrained call; one registry scan per constrained one.
 */
export function withReadOnlyToolConstraint(inner: ToolExecutor, deps: ReadOnlyToolConstraintDeps): ToolExecutor {
  return {
    execute: async (
      principal: Principal,
      run: RunRef,
      toolId: string,
      input: unknown,
      signal?: AbortSignal,
      emitSurface?: SurfaceEmitter,
    ): Promise<ToolExecutionResult> => {
      const refusal = refuseNonReadOnlyDispatch({ principal, toolId, registry: deps.registry });
      // Refused BEFORE `inner` — no audit record is minted by the kernel executor, no handler runs,
      // and nothing durable happens. `denied` rather than a throw: this is an authorization outcome
      // the `ToolExecutionResult` union already models, so every caller (the audit decorator, the
      // recovery loop, `@jini-ai/http-kit`'s status mapping) handles it without a special case.
      // `executionId` is minted here because there is no kernel execution to borrow one from.
      if (refusal !== null) return { executionId: randomUUID(), status: "denied", error: refusal };
      return inner.execute(principal, run, toolId, input, signal, emitSurface);
    },
    resumeConfirmation: (executionId, decision) => inner.resumeConfirmation(executionId, decision),
    cancel: (executionId) => inner.cancel(executionId),
    getAuditRecord: (executionId) => inner.getAuditRecord(executionId),
  };
}
