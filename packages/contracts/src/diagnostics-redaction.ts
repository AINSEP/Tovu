import { redactLocalText } from "@jini-ai/diagnostics/local-text";
import { redactedError } from "@jini-ai/diagnostics/observability/node";

import { TOVU_ERROR_REDACTION_OPTIONS } from "./secret-redaction.js";

/**
 * @file Tovu's wrapper over Jini's diagnostics redactors. Jini stays product-neutral, so it cannot know
 * the `tovu_ak_` application-key shape; every Tovu caller that logs or reports an error goes through
 * here so that shape is injected (`extraPatterns`) on every call instead of being remembered per call
 * site. The pattern itself is `TOVU_ERROR_REDACTION_OPTIONS`, the same one `formatErrorForLog` uses.
 */

type LocalTextOptions = Omit<NonNullable<Parameters<typeof redactLocalText>[1]>, "extraPatterns">;

/**
 * `redactLocalText` (credentials + home paths in child/native output) plus Tovu's key shapes.
 * @complexity O(n) for n text characters.
 */
export function redactTovuLocalText({ text }: { text: string }, optional: LocalTextOptions = {}): string {
  return redactLocalText({ text }, { ...optional, extraPatterns: TOVU_ERROR_REDACTION_OPTIONS.extraPatterns });
}

/**
 * `redactedError` (message + stack for error trackers) plus Tovu's key shapes.
 * @complexity O(n) in message + stack length.
 */
export function redactedTovuError({ error }: { error: unknown }, { exactSecrets }: { exactSecrets?: readonly string[] | undefined } = {}): Error {
  return redactedError({ error }, { exactSecrets, extraPatterns: TOVU_ERROR_REDACTION_OPTIONS.extraPatterns });
}
