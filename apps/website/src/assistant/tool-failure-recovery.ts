import type { Principal, RunRef, SurfaceEmitter, ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";
import { buildFormSurface, type SurfaceField, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import type { ToolFailureDiagnostic } from "../contracts/core/tool-failure-diagnostics.js";
import {
  askOnce,
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  type SurfaceExchange,
  type SurfaceExchangeStore,
} from "../contracts/core/tool-surface-exchanges.js";
import { readOnlyRemedyRefusalMessage, refuseNonReadOnlyDispatch } from "./read-only-tool-constraint.js";

/**
 * @file The CONSUMER of `contracts/core/tool-failure-diagnostics.ts`'s `ToolFailureDiagnostic`
 * contract — the generic ask -> apply -> retry-once loop that contract's own header describes as the
 * payoff for adopting it ("one generic loop ... can handle a failure mode nobody wrote code for, using
 * the identical mechanism that already handles one somebody did"). Before this file, `hint`/
 * `remedyToolId` were read by nobody but the MODEL, acting on prose in a tool's own catalog
 * description (`custom_credential_verify`/`custom_credential_make_request`'s "ask the human ...
 * retry ONCE" wording). This file makes the same recovery a real mechanism that runs whether or not
 * the model happens to follow that prose.
 *
 * ## The seam: a `ToolExecutor` decorator, not a tool
 *
 * `withToolFailureRecovery` wraps `@jini-ai/daemon`'s `ToolExecutor` — the SAME kind of drop-in
 * `tool-executor-audit.ts`'s `withToolAttemptAudit` already is, for the same reason: this is the one
 * layer that (a) sees every completed tool result BEFORE it reaches the model, (b) is handed the
 * live `emitSurface` a handler would use to raise a human-facing surface, and (c) can re-invoke a
 * tool — the remedy, then the original again — with the SAME `principal`/`run`/`signal` the first
 * call had. No domain module (a `tool-registrations.ts`) has all three: a domain handler sees only
 * its OWN result, not another domain's `remedyToolId`. The tool-registration layer was considered and
 * rejected for exactly that reason — `custom_credential_set_username` is a different domain from
 * whatever OTHER tool a future diagnostic might name, and this loop has to work for a diagnostic
 * nobody has written yet, not just this one.
 *
 * Composed OUTSIDE `withToolAttemptAudit` in `agent-daemon-server.ts` (audit wraps the bare executor;
 * this wraps the audited one) so the remedy call and the retry are each their own audited attempt,
 * not lost inside one outer "completed" row — see that file's own wiring comment.
 *
 * ## What triggers it
 *
 * Only a `status: 'completed'` execution (a handler that returned normally) is even inspected — a
 * thrown error has no structured output to carry a diagnostic in, and `ToolFailureDiagnostic` was
 * never meant to model that case (see that file's own header, facet 1). The completed output is
 * walked (bounded, see {@link findActionableDiagnostic}) for the first plain object carrying BOTH a
 * string `hint` AND a string `remedyToolId`. `hint` with no `remedyToolId` is deliberately NOT
 * actionable here — the general contract's own header says as much ("no registered tool can supply
 * the fix yet ... still worth surfacing to a human who can act on it by hand"): a human reading the
 * model's own report of the failure is that "by hand" path; this loop only exists for the case where
 * a tool id names something IT can do about it.
 *
 * ## What it asks for, and why that can never be a secret
 *
 * The loop does not know what a `hint` means — it is prose. What it CAN know, structurally, is the
 * remedy tool's own published {@link ToolDescriptor.inputSchema}: which fields it requires, and which
 * of those the ORIGINAL failing call's input already supplies (by matching key name — e.g. both
 * `custom_credential_make_request` and `custom_credential_set_username` name a `label`). Whatever is
 * required but not already known is the ONE thing worth asking a human for — see
 * {@link planRemedyCall}. This is deliberately narrow: more than one unknown field, or a field whose
 * schema type isn't plain text, means this loop has no safe, generic way to ask for it, and it backs
 * off entirely rather than invent a shape.
 *
 * That narrowness is what keeps a secret out of this loop's own text field, BY CONSTRUCTION, not by a
 * rule someone has to remember: `custom_credential_set_token`'s entire schema is `{label}`, and
 * `label` is already known from the original call — so `planRemedyCall` computes ZERO fields to ask
 * for, and this loop calls it with nothing but the carried-forward `label`. The token itself, if that
 * tool is ever named as a `remedyToolId`, would still only ever reach the server the way that tool's
 * OWN handler already collects it (its own masked form, opened when THIS loop invokes it) — never
 * through a field this loop rendered, and never through a model-issued call's params. See
 * `credentialed-request.ts`'s header for the incident this reasoning was written against.
 *
 * ## The one-cycle guard — structural, not a counter
 *
 * `execute` below calls `inner.execute` up to three times (the original call, the remedy call, the
 * retry) and NEVER calls itself or the wrapper it returns. There is therefore no code path by which a
 * hint surfacing on the remedy call's own result, or on the retry's result, can trigger a second ask
 * -> apply -> retry cycle: the scan-for-a-diagnostic step only ever runs once per external
 * `execute()` invocation, because it is written exactly once, outside any loop or recursion. A future
 * edit would have to ADD a call from inside this function back into itself to reintroduce a second
 * cycle — it cannot happen by a counter being reset, a flag being missed, or any other stateful
 * mistake, because no state is involved at all.
 *
 * ## What it never does
 *
 * - Never suppresses the original failure: every early return hands back `result` — the exact object
 *   `inner.execute` produced for the original call, provider body and status included — untouched.
 *   The one return that is not byte-identical still carries that exact `output`: a remedy refused
 *   because this execution is read-only-constrained adds an `error` explaining that the recovery was
 *   not attempted (see `read-only-tool-constraint.ts`), because returning the original silently would
 *   be its own lie — "nothing was written" and "nothing was ever going to be tried" are different
 *   facts, and the caller can only act on the second one if it is told.
 * - Never runs a remedy that writes on behalf of a caller that asked for reads only. The dispatch
 *   below would be refused by `withReadOnlyToolConstraint` in any case — that gate is the
 *   enforcement, and it sits innermost precisely so it does not depend on this file remembering —
 *   but this loop asks the same single question first so no human is ever prompted for an answer
 *   that would then be thrown away.
 * - Never invents an answer: a declined, dismissed, expired, or blank response to the recovery surface
 *   is treated as "do not proceed," not as licence to guess.
 * - Never adds cost to the overwhelmingly common no-hint case: the scan is one bounded, pure walk of
 *   an already-in-memory value, no I/O, no surface, no second call.
 *
 * Architectural role: `src/assistant` composition-layer adapter, mirroring `tool-executor-audit.ts`'s
 * own role — depends on the domain-agnostic surface-exchange contract and the kernel's own
 * `ToolExecutor`/`ToolRegistry` shapes, never on any domain feature.
 */

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

/** Bounds {@link findActionableDiagnostic}'s walk of a handler's output — generous for any real tool
 *  result in this codebase (a handful of fields, one or two levels of nesting) while keeping an
 *  adversarially large or deep result cheap to give up on rather than a source of unbounded work. */
const MAX_DIAGNOSTIC_SCAN_DEPTH = 6;
const MAX_DIAGNOSTIC_SCAN_NODES = 500;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The one shape this loop treats as actionable — both fields present, both non-empty strings. `hint`
 *  alone (no `remedyToolId`) is deliberately excluded; see this file's header. */
type ActionableToolFailureDiagnostic = Required<Pick<ToolFailureDiagnostic, "hint" | "remedyToolId">>;

function isActionableDiagnostic(value: Record<string, unknown>): value is ActionableToolFailureDiagnostic {
  return typeof value.hint === "string" && value.hint.length > 0 && typeof value.remedyToolId === "string" && value.remedyToolId.length > 0;
}

/**
 * Walks a completed tool call's raw output for the first nested object carrying an actionable
 * diagnostic (see {@link isActionableDiagnostic}) — domain-agnostic by construction: it knows nothing
 * about `authDiagnostic`, credentials, or any other field name a concrete diagnostic type happens to
 * nest itself under, only the two-field SHAPE the general contract defines.
 *
 * @param output - `ToolExecutionResult.output` from a `'completed'` execution.
 * @returns The diagnostic, or `undefined` if none is found within the bounded walk.
 * @complexity O(min(n, {@link MAX_DIAGNOSTIC_SCAN_NODES})) where n is the output's own node count.
 */
function findActionableDiagnostic(output: unknown): ActionableToolFailureDiagnostic | undefined {
  let visited = 0;

  function walk(value: unknown, depth: number): ActionableToolFailureDiagnostic | undefined {
    if (depth > MAX_DIAGNOSTIC_SCAN_DEPTH || visited >= MAX_DIAGNOSTIC_SCAN_NODES) return undefined;
    visited += 1;

    if (isPlainObject(value)) {
      if (isActionableDiagnostic(value)) return { hint: value.hint, remedyToolId: value.remedyToolId };
      for (const child of Object.values(value)) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  }

  return walk(output, 0);
}

type JsonPrimitive = string | number | boolean | null;

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** What this loop has worked out it can safely do about one diagnostic — see {@link planRemedyCall}. */
interface RemedyPlan {
  readonly remedyToolId: string;
  /** Required fields the remedy tool's own schema names that the ORIGINAL call's input already
   *  supplies, carried forward verbatim so the human is never asked to repeat something already
   *  known (e.g. the credential's `label`). Restricted to JSON primitives — see {@link planRemedyCall}. */
  readonly carryForward: Readonly<Record<string, JsonPrimitive>>;
  /** The ONE remaining required field to ask a human for, when the remedy tool needs one the original
   *  call did not supply. Absent when every required field is already known (e.g.
   *  `custom_credential_set_token`'s `{label}`-only schema) — see this file's header for why that
   *  case is exactly what keeps a secret out of this loop's own form. */
  readonly askFor?: { readonly key: string; readonly prompt: string };
}

/**
 * Works out whether — and how — this loop can safely build a call to `remedyToolId`, from nothing but
 * that tool's own published `inputSchema` and the ORIGINAL failing call's input. Returns `undefined`
 * whenever the shape does not fit the one pattern this loop knows how to act on safely: this is the
 * function that decides "not cleanly possible" for one diagnostic, without ever guessing past it.
 *
 * @param input.descriptor - The remedy tool's registry descriptor, or `undefined` if `remedyToolId`
 *   is not actually registered (a diagnostic naming a tool that does not exist).
 * @param input.originalInput - The input the ORIGINAL (failing) call was made with.
 * @returns `undefined` if: the remedy tool isn't registered or has no object-shaped `inputSchema`;
 *   more than one of its required fields is unknown (no single honest question covers all of them);
 *   a required field already known is not a JSON primitive (nothing to safely re-forward); or the one
 *   unknown field's own schema type is not plain-text-shaped (this loop never invents how to render an
 *   unfamiliar field kind).
 * @complexity O(k) in the remedy schema's own required-field count (small, fixed per tool).
 */
function planRemedyCall(input: { remedyToolId: string; descriptor: ToolDescriptor | undefined; originalInput: unknown }): RemedyPlan | undefined {
  const { remedyToolId, descriptor, originalInput } = input;
  if (!descriptor || !isPlainObject(descriptor.inputSchema)) return undefined;

  const schema = descriptor.inputSchema;
  const required = Array.isArray(schema["required"]) ? (schema["required"] as unknown[]).filter((k): k is string => typeof k === "string") : [];
  const properties = isPlainObject(schema["properties"]) ? schema["properties"] : {};
  const knownInput = isPlainObject(originalInput) ? originalInput : {};

  const missing = required.filter((key) => !(key in knownInput));
  // More than one unknown field: there is no single honest question that supplies all of them at
  // once without guessing at how they relate — back off rather than force a multi-field form onto a
  // contract that only ever promised one hedged hint.
  if (missing.length > 1) return undefined;
  const askKey = missing[0];

  const carryForward: Record<string, JsonPrimitive> = {};
  for (const key of required) {
    if (key === askKey) continue;
    const value = knownInput[key];
    // A required field the original call DID supply, but not as a plain value — refuse to guess how
    // to re-forward it rather than risk passing something malformed or unintended to the remedy tool.
    if (!isJsonPrimitive(value)) return undefined;
    carryForward[key] = value;
  }

  if (askKey === undefined) return { remedyToolId, carryForward };

  const propSchema = properties[askKey];
  if (!isPlainObject(propSchema)) return undefined;
  const type = propSchema["type"];
  const isTextLike = type === "string" || (Array.isArray(type) && type.every((t) => t === "string" || t === "null"));
  // Only a plain-text answer can be collected generically, with no invented rendering — a number,
  // boolean, enum, or nested-object field is left alone rather than guessed at.
  if (!isTextLike) return undefined;

  const description = propSchema["description"];
  const prompt = typeof description === "string" && description.trim() !== "" ? description : askKey;
  return { remedyToolId, carryForward, askFor: { key: askKey, prompt } };
}

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
function buildRecoveryFormResource(input: { exchangeId: string; hint: string; remedyToolId: string; askFor?: { key: string; prompt: string } }): UIResource {
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

/** What the human decided, or the fact that nothing usable came back — never a guess in either
 *  direction. `answerValue` is present only when `askFor` was set AND the submission was non-blank;
 *  see this function's own blank-answer branch for why that is treated as "skip," not "guess." */
type RecoveryDecision = { readonly proceed: false } | { readonly proceed: true; readonly answerValue?: string };

/**
 * Sends the recovery surface and waits for the human's answer — plain `askOnce`, matching
 * `custom_credential_make_request`'s own DELETE-gate precedent (`resolveMakeRequestDeleteDecision`)
 * rather than `askThenReport`: this loop's surface is an ask ABOUT what to try next, not a rendering
 * of a secret's own submission state, so there is nothing here `askThenReport` was built to correct.
 *
 * @complexity O(1) plus whatever `askOnce` itself costs.
 */
async function resolveRecoveryDecision(exchange: SurfaceExchange, ui: UIResource, askForKey: string | undefined): Promise<RecoveryDecision> {
  const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  if (answer.status !== "received") return { proceed: false };
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { proceed: false };
  if (askForKey === undefined) return { proceed: true };

  const raw = answer.params[askForKey];
  const answerValue = typeof raw === "string" ? raw.trim() : "";
  // Never invent an answer: a blank submission is treated as "do not proceed," not as a value to try.
  if (answerValue === "") return { proceed: false };
  return { proceed: true, answerValue };
}

export interface ToolFailureRecoveryDeps {
  /** The SAME instance `agent-daemon-server.ts` mounts `registerMcpUiToolCallsRoute` with — a
   *  different one would leave this loop's own recovery surface unreachable, exactly the failure mode
   *  `tool-surface-exchanges.ts`'s own `AssistantSurfaceDeps` doc warns about for every other
   *  consumer of this store. */
  readonly surfaceExchanges: SurfaceExchangeStore;
  /** Read-only: this loop only ever calls {@link ToolRegistry.list} to look up a remedy tool's own
   *  published `inputSchema` — never a handler, and never anything requiring authorization to read. */
  readonly registry: Pick<ToolRegistry, "list">;
}

/**
 * Wraps `inner` with the generic ask -> apply -> retry-once recovery loop described in this file's
 * header. A drop-in `ToolExecutor` — every method other than `execute` delegates straight through,
 * matching `tool-executor-audit.ts`'s own `withToolAttemptAudit` shape.
 *
 * @complexity The no-hint path (the overwhelming majority) is one `inner.execute` call plus one bounded
 *   output scan — O(1) beyond `inner`'s own cost. The recovery path adds at most two further
 *   `inner.execute` calls (the remedy, the retry) and one surface round trip.
 */
export function withToolFailureRecovery(inner: ToolExecutor, deps: ToolFailureRecoveryDeps): ToolExecutor {
  return {
    execute: async (
      principal: Principal,
      run: RunRef,
      toolId: string,
      input: unknown,
      signal?: AbortSignal,
      emitSurface?: SurfaceEmitter,
    ): Promise<ToolExecutionResult> => {
      const result = await inner.execute(principal, run, toolId, input, signal, emitSurface);

      // SILENCE STAYS FREE: everything but a completed call whose output carries an actionable
      // diagnostic returns `result` exactly as `inner` produced it — no extra work, no surface, no
      // added latency. This is the overwhelmingly common case.
      if (result.status !== "completed") return result;
      const diagnostic = findActionableDiagnostic(result.output);
      if (!diagnostic) return result;
      // No channel to ask through (a headless/synthetic caller) — never guess, never suppress.
      if (!emitSurface) return result;

      // A read-only execution may not be recovered by a remedy that writes. `withReadOnlyToolConstraint`
      // would refuse the dispatch below regardless — it is the enforcement, and it does not depend on
      // this line — but a refusal discovered THERE arrives only after a human has already been asked to
      // fill in a form whose answer is then thrown away. Asking the same question here, from the same
      // single decision function, means the human is never asked, and the caller gets a refusal that
      // says what happened instead of an unexplained "nothing changed".
      const readOnlyRefusal = refuseNonReadOnlyDispatch({ principal, toolId: diagnostic.remedyToolId, registry: deps.registry });
      if (readOnlyRefusal !== null) return { ...result, error: readOnlyRemedyRefusalMessage(readOnlyRefusal) };

      const descriptor = deps.registry.list().find((d) => d.id === diagnostic.remedyToolId);
      const plan = planRemedyCall({ remedyToolId: diagnostic.remedyToolId, descriptor, originalInput: input });
      // This diagnostic's shape doesn't fit the one pattern this loop can safely act on — see
      // `planRemedyCall`'s own doc for every reason that can be. Reported honestly by doing nothing,
      // not by forcing a guess.
      if (!plan) return result;

      const exchange = deps.surfaceExchanges.open({ toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: principal.id }, emitSurface);
      const ui = buildRecoveryFormResource({ exchangeId: exchange.id, hint: diagnostic.hint, remedyToolId: diagnostic.remedyToolId, askFor: plan.askFor });

      const closeOnAbort = () => exchange.close();
      signal?.addEventListener("abort", closeOnAbort, { once: true });
      let decision: RecoveryDecision;
      try {
        decision = await resolveRecoveryDecision(exchange, ui, plan.askFor?.key);
      } finally {
        signal?.removeEventListener("abort", closeOnAbort);
      }
      // Declined, dismissed, expired, or a blank answer — the ORIGINAL failure is still the truth.
      if (!decision.proceed) return result;

      const remedyInput: Record<string, unknown> = { ...plan.carryForward };
      if (plan.askFor && decision.answerValue !== undefined) remedyInput[plan.askFor.key] = decision.answerValue;

      // ---- STRUCTURAL ONE-CYCLE GUARD ----
      // Both calls below go straight to `inner` — never back through this function or the object it
      // returns. Whatever either one returns, including a fresh hint+remedyToolId of its own, is never
      // fed back into the scan above: that scan is written exactly once, above this comment, and
      // nothing here loops or recurses into it again. See this file's header.
      const remedyResult = await inner.execute(principal, run, diagnostic.remedyToolId, remedyInput, signal, emitSurface);
      // The fix itself did not complete (denied, threw, timed out, ...) — nothing changed, so retrying
      // the original would only reproduce the same failure. Return the ORIGINAL result, untouched.
      if (remedyResult.status !== "completed") return result;

      // Retry the ORIGINAL call exactly once, with its exact original input. Whatever this returns —
      // success or a fresh failure — is this wrapper's final answer.
      return inner.execute(principal, run, toolId, input, signal, emitSurface);
    },
    resumeConfirmation: (executionId, decision) => inner.resumeConfirmation(executionId, decision),
    cancel: (executionId) => inner.cancel(executionId),
    getAuditRecord: (executionId) => inner.getAuditRecord(executionId),
  };
}
