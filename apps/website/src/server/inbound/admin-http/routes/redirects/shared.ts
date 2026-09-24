import type { Response } from "express";

import { EntityNotLiveError } from "@jini-ai/cms/core";

import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "#src/features/redirects/index";

/**
 * @file Shared error-response mapping for the `redirects` admin write routes.
 *
 * `create.ts` and `update.ts` each map the same four write-chokepoint error classes onto the same
 * status/code pairs, in their own repeated `if (err instanceof X) {...}` chain. Factored out once
 * both needed it; `update.ts` also has `RedirectNotFoundError`, which it prepends itself since
 * `create.ts` (there is no existing redirect yet) never throws it.
 */

/** One entry in a redirects route's `catch` block: which thrown error class maps to which HTTP
 *  status/code pair. */
export interface RedirectErrorMapping {
  readonly matches: (err: unknown) => boolean;
  readonly status: number;
  readonly code: string;
}

/**
 * Writes the first matching mapping's status/code, or a generic 500 if none match.
 *
 * @complexity O(n) in the mapping table length, which is a small fixed list per caller.
 */
export function respondToRedirectError(res: Response, err: unknown, mappings: readonly RedirectErrorMapping[]): void {
  const message = err instanceof Error ? err.message : String(err);
  for (const mapping of mappings) {
    if (mapping.matches(err)) {
      res.status(mapping.status).json({ error: message, code: mapping.code });
      return;
    }
  }
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/** The write-chokepoint errors both `create.ts` and `update.ts` map identically. */
export const REDIRECT_WRITE_ERROR_MAPPINGS: readonly RedirectErrorMapping[] = [
  // S7 (web-high fix plan 2026-09-24) — first, ahead of the others: a rule in the Trash rejects
  // with a fixed code regardless of which OTHER field the caller tried to change. Redirects are
  // never tombstoned-state (only `EntityLiveness`'s "trashed"), so one fixed code is complete here.
  { matches: (e) => e instanceof EntityNotLiveError, status: 409, code: "ENTITY_IN_TRASH" },
  { matches: (e) => e instanceof RedirectValidationError, status: 400, code: "REDIRECT_VALIDATION_ERROR" },
  { matches: (e) => e instanceof RedirectTargetNotAllowedError, status: 400, code: "REDIRECT_TARGET_NOT_ALLOWED" },
  { matches: (e) => e instanceof RedirectConflictError, status: 409, code: "REDIRECT_CONFLICT" },
  { matches: (e) => e instanceof RedirectLoopError, status: 409, code: "REDIRECT_LOOP_DETECTED" },
];
