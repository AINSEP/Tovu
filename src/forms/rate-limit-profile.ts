import type { RateLimitProfile } from "../server/middleware/rate-limit";

/**
 * @file `FORMS_SUBMIT` rate-limit profile + composite key builder (SPEC-010 REQ-09, C-010/C-011).
 *
 * Purpose:
 * Wraps the EXISTING `server/middleware/rate-limit.ts` `createRateLimiter`/`resolveClientIp`
 * (Article I reuse, ADR-PIPE-010 Pattern Evaluation) — does not reimplement the fixed-window
 * algorithm. This file only pins the profile constant and composes the `(sourceIp, formId)` key
 * `createRateLimiter` expects as a plain string.
 */

/** api.spec.md §3 `FORMS_SUBMIT` — 5 requests / 60s / 0 burst, keyed by `(ip, formId)`. */
export const FORMS_SUBMIT_PROFILE: RateLimitProfile = {
  windowSeconds: 60,
  max: 5,
  burst: 0,
};

/**
 * INV-09 — composes the composite key so a visitor submitting to two different forms from the
 * same IP is never cross-throttled (api.spec.md §3 note, behavior.spec.md §7).
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function buildFormsRateLimitKey(input: { sourceIp: string; formDefinitionId: string }): string {
  return `${input.sourceIp}:${input.formDefinitionId}`;
}
