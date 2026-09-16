/**
 * @file The shared "say the real reason" mechanism for model-facing tool failures (2026-09-16).
 *
 * ## The bug this exists to close
 *
 * `@jini-ai/daemon`'s `ToolExecutor` tags any rejection that is not `instanceof ToolInputError` as
 * `errorKind: 'internal'`, and `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts an
 * `'internal'` failure into a message-stripped `{ code: "INTERNAL_ERROR", message: "an internal
 * error occurred" }` 500. Every typed domain error a tool handler throws — "that member does not
 * exist", "you lack `member.manage`", "that campaign is already sent" — therefore reached the model
 * as the SAME opaque 500 a genuine crash produces.
 *
 * A model told only "500" cannot recover, cannot explain itself, and cannot stop repeating the
 * failing call. It guesses, and the user sees nonsense. The owner's standing ruling is "always say
 * the real reason."
 *
 * ## Why this is shared rather than copied per domain
 *
 * The first fix (`features/widgets/tool-registrations.ts`'s `toModelFacingWidgetsError`) solved it
 * for one domain by hand. But the single most common redacted failure is not domain-specific at
 * all: `requireToolPermission` — the kit's own shared helper, called from 37 files in this codebase
 * — throws `@jini-ai/cms/core`'s `ForbiddenError`, which extends plain `Error`. One shared class,
 * thrown from one shared helper, redacted at one shared transport. Six hand-written copies of the
 * same `instanceof` ladder would be six places for the next domain to forget.
 *
 * This module owns the two moving parts (the rule ladder and the handler-map wrap) and nothing
 * else; each domain still supplies its OWN rule list, because which of a domain's errors are safe
 * to say out loud is a domain decision this file must not make for it.
 *
 * ## The security contract — an ALLOWLIST, never a blanket unwrap
 *
 * These results reach a model that may be acting for an anonymous visitor. "Say the real reason"
 * is not "leak the internals". {@link reclassifyToolError} therefore reclassifies ONLY errors
 * matching a rule the domain explicitly listed, and returns everything else UNCHANGED — still
 * `'internal'`, still redacted. Opting an error class in is a deliberate, reviewable act.
 *
 * A rule belongs on a domain's list only when the message is safe and meaningful to its caller:
 * not-found, forbidden, validation-failed, conflict, quota-exceeded — messages built from the
 * caller's OWN input and the domain's own vocabulary. A message carrying a stack trace, an internal
 * filesystem path, a SQL fragment, credential material, or another tenant's data must never be
 * listed, no matter how useful it would be to debug with. Where the two goals conflict, the safe
 * option wins and the error stays redacted.
 *
 * ## Architectural role
 *
 * `contracts/core`, domain-agnostic — it names no member, form, webhook, campaign, post, or
 * credential concept, so any feature can adopt it without this file growing an edge back into that
 * feature. Pure: no I/O, no state, no logging.
 */
import { ForbiddenError, type ToolHandler } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

/**
 * One entry in a domain's allowlist: an error class, and the stable code prefix its message is
 * published to the model under.
 *
 * The code is prepended before a `: ` separator (`MEMBERS_NOT_FOUND: member 'x' was not found`) so
 * a model — and a test — can match on a stable token without parsing prose, mirroring the prefix
 * convention `features/widgets/tool-registrations.ts` already shipped.
 *
 * `guidance`, when present, is appended after the message. Use it only for a failure where the
 * caller's next action is not obvious from the message alone (a version conflict that needs a
 * re-read, say); a not-found needs no coaching.
 */
export interface ModelFacingErrorRule {
  /** The class to match with `instanceof`. Declared to accept any constructor shape so a domain can
   *  list an error class whose constructor takes extra fields. */
  readonly error: abstract new (...args: never[]) => Error;
  /** The stable code published before `: `. Conventionally `<DOMAIN>_<REASON>`, SCREAMING_SNAKE. */
  readonly code: string;
  /** Optional recovery guidance appended after the message. */
  readonly guidance?: string;
}

/**
 * The code every domain publishes an authorization refusal under, parameterized by domain prefix.
 *
 * Exists because `ForbiddenError` is the ONE class in this ladder that no domain declares: the kit's
 * `requireToolPermission` throws it on every domain's behalf. Deriving the rule here rather than
 * retyping `{ error: ForbiddenError, code: "X_FORBIDDEN" }` in six files means a later decision to
 * reconcile this code with the HTTP arm's own `FORBIDDEN` is a one-line change here, not a sweep.
 *
 * NOTE (2026-09-16): the model-facing and HTTP arms disagree on this code today — the HTTP mappers
 * return `FORBIDDEN` while the model-facing arm returns `<DOMAIN>_FORBIDDEN`. That drift predates
 * this file (see `features/widgets/tool-registrations.ts`'s `toModelFacingWidgetsError` doc, which
 * documented it for Widgets) and is owned elsewhere. This helper deliberately matches the SHIPPED
 * model-facing convention rather than inventing a third spelling.
 *
 * The refusal message `requireToolPermission` builds names the principal, the permission, and the
 * `authorize()` reason — no data, no internals. Surfacing it tells a model whether to stop asking
 * or to ask a human for access; redacting it tells it only that something broke.
 *
 * @param domainPrefix - The domain's SCREAMING_SNAKE prefix, e.g. `MEMBERS`.
 * @returns The rule to place in that domain's allowlist.
 * @complexity O(1).
 */
export function forbiddenRule(domainPrefix: string): ModelFacingErrorRule {
  return { error: ForbiddenError, code: `${domainPrefix}_FORBIDDEN` };
}

/**
 * Re-classifies one rejection against a domain's allowlist, so a listed domain error reaches the
 * model as a `ToolInputError` carrying its real message instead of a redacted `INTERNAL_ERROR`.
 *
 * Rules are evaluated IN ORDER and the first `instanceof` match wins, so a domain listing both a
 * subclass and its superclass must place the subclass first — the same ordering discipline any
 * hand-written `instanceof` ladder carries, made explicit here because an array hides it less than
 * a chain of `if`s does.
 *
 * An already-`ToolInputError` rejection is returned untouched: it is already correctly classified,
 * and re-wrapping it would double a code prefix that a `withSchemaOnRejection` wrap may have
 * already attached.
 *
 * @param err - The rejection, of unknown type — anything a handler can throw.
 * @param rules - The domain's allowlist. Anything unmatched is returned UNCHANGED and stays
 * redacted; see this file's header for why that default is the security-relevant half.
 * @returns The value to re-throw: a `ToolInputError` for a matched rule, otherwise `err` itself.
 * @complexity O(r) in the rule count, on the failure path only.
 */
export function reclassifyToolError(err: unknown, rules: readonly ModelFacingErrorRule[]): unknown {
  if (err instanceof ToolInputError) return err;
  for (const rule of rules) {
    if (err instanceof rule.error) {
      const message = `${rule.code}: ${err.message}`;
      return new ToolInputError(rule.guidance ? `${message}. ${rule.guidance}` : message);
    }
  }
  return err;
}

/**
 * Wraps EVERY handler in a domain's map with {@link reclassifyToolError}, returning a new map.
 *
 * Wrapping the whole map once — rather than reclassifying at each call site — is the point. This
 * codebase's dominant defect is a correct primitive with an unwired call site, and a per-call-site
 * reshape is exactly that defect waiting to happen: `features/post/tool-registrations.ts` had a
 * correct `toModelFacingUpdateError` wired into ONE of its handlers while its siblings kept
 * throwing the same class straight through to the redactor. A map-level wrap cannot have a missed
 * arm, because it has no arms.
 *
 * The wrap is transparent on the success path: the handler's own return value is passed through
 * untouched, and only the `catch` does work.
 *
 * @param handlers - The domain's handler map, keyed by tool id.
 * @param rules - The domain's allowlist, applied identically to every handler.
 * @returns A new map with the same keys; the input map is not mutated.
 * @complexity O(h) handlers wrapped once at build time; O(r) per failed call, none per successful one.
 */
export function withModelFacingErrors(
  handlers: Record<string, ToolHandler>,
  rules: readonly ModelFacingErrorRule[]
): Record<string, ToolHandler> {
  return Object.fromEntries(
    Object.entries(handlers).map(([toolId, handler]) => [
      toolId,
      async (ctx: Parameters<ToolHandler>[0]) => {
        try {
          return await handler(ctx);
        } catch (err) {
          throw reclassifyToolError(err, rules);
        }
      },
    ])
  );
}
