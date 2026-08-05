import type { RowMenuItem } from "@jini-ai/admin/react";

import type { AdminRedirect, RedirectImportRule } from "../../lib/api";
import type { MutationStatus, QueryKey } from "../../lib/fetch-query";

/**
 * @file Pure logic for the `redirects` feature — everything that computes a value rather than
 * rendering one. Follows the convention `features/posts/rules.ts` establishes: no React, no
 * hooks, importable and directly testable.
 *
 * `KEYS` lives here rather than inside a hook file because three separate hook files
 * (`use-redirects`, `use-hit-count-cell`, `use-import-redirects-form`) each need one branch of it.
 * A cache-identity constant copied per hook is exactly the drift `lib/fetch-query/types.ts`'s own
 * `QueryKey` doc warns about — a hand-typed second `["redirects"]` silently stops matching the
 * first the moment one of them is edited.
 */

/** One cache identity per resource, defined once so a write's `invalidates` and a read's `key`
 *  cannot drift apart — the failure mode being an invalidation that silently matches nothing and a
 *  list that never refreshes. */
export const KEYS = {
  list: ["redirects"] as QueryKey,
  hits: (redirectId: string): QueryKey => ["redirects", redirectId, "hits"],
};

/**
 * The status a "Disable"/"Enable" row action moves a rule TO — the inverse of its current status.
 *
 * @complexity Time/space: O(1).
 */
export function nextRedirectStatus(currentStatus: string): string {
  return currentStatus === "active" ? "disabled" : "active";
}

/**
 * Shapes the create-redirect form's raw `FormData` into `api.createRedirect`'s input — the create
 * mutation's payload, extracted so the shaping is testable without submitting a real form.
 *
 * @complexity Time/space: O(1) — four fixed field reads.
 */
export function buildCreateRedirectPayload(form: FormData): {
  matchType: string;
  fromPattern: string;
  toTarget: string;
  statusCode: number;
} {
  return {
    matchType: String(form.get("matchType") ?? "exact"),
    fromPattern: String(form.get("fromPattern") ?? ""),
    toTarget: String(form.get("toTarget") ?? ""),
    statusCode: Number(form.get("statusCode") ?? 301),
  };
}

/** The callbacks a redirect row menu needs. Passed in rather than imported so this module stays
 *  free of state, mirroring `posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface RedirectRowMenuHandlers {
  onToggleStatus: (rule: AdminRedirect) => void;
  onRequestDelete: (rule: AdminRedirect) => void;
}

/**
 * The row-action menu for one redirect rule.
 *
 * The label is the reason this is exported: it reads the rule's CURRENT status to decide between
 * "Disable" and "Enable", a branch that was otherwise reachable only by rendering the table and
 * opening a popover. "Delete" only OPENS the confirmation; the delete itself is
 * `useRedirects().confirmDelete`, gated on `ConfirmDialog` — same split as `posts/rules.ts`'s
 * `postRowMenuItems`.
 *
 * @complexity Time/space: O(1) — two fixed entries, no iteration.
 */
export function redirectRowMenuItems(rule: AdminRedirect, handlers: RedirectRowMenuHandlers): RowMenuItem[] {
  return [
    {
      key: "toggle",
      label: rule.status === "active" ? "Disable" : "Enable",
      onSelect: () => handlers.onToggleStatus(rule),
    },
    {
      key: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => handlers.onRequestDelete(rule),
    },
  ];
}

/** One write's status/error — the two fields these derivations need from `useFetchMutation`'s
 *  `MutationResult`, named locally so this module does not have to import the whole type. */
export interface WriteState {
  status: MutationStatus;
  error: Error | null;
}

/**
 * True while any of the screen's independent writes (create/toggle/delete) is in flight — gates
 * the row-menu guard and the submit button's "Saving…" label.
 *
 * @complexity Time/space: O(w) in the number of writes (currently 3, fixed).
 */
export function isAnyWritePending(writes: readonly WriteState[]): boolean {
  return writes.some((write) => write.status === "pending");
}

/**
 * The first still-active write failure, in WRITE-ARRAY order rather than recency.
 *
 * Order matters: three independent mutations each keep their own error until reset, so returning
 * by recency would let a failed Create's banner persist on screen after a later, entirely
 * successful Disable — blaming an operation that worked. `clearOtherWriteErrors` (in
 * `use-redirects.hooks.ts`) is this rule's other half: it clears every write's error except the
 * one just started, so at most one of these ever holds a stale failure at a time.
 *
 * @complexity Time/space: O(w) in the number of writes.
 */
export function firstWriteError(writes: readonly WriteState[]): Error | null {
  return writes.find((write) => write.error)?.error ?? null;
}

/**
 * The error banner's source of truth: an active write's own failure takes precedence over a
 * background list-refresh failure, and the list failure is suppressed entirely while a write is
 * running — a failed background list refresh keeps `listError` set while the table still shows its
 * last good data, and rendered unconditionally that error would become the banner the operator
 * sees the instant they click Disable, reading as "your Disable failed" when the write is merely in
 * flight and the stale message belongs to an earlier refresh. It returns afterwards if the list is
 * genuinely still failing, which is honest rather than hidden.
 *
 * @complexity Time/space: O(1).
 */
export function visibleRedirectsError(params: {
  writeError: Error | null;
  saving: boolean;
  listError: Error | null;
}): Error | null {
  return params.writeError ?? (params.saving ? null : params.listError);
}

/** Discriminated parse result for the bulk-import textarea. */
export type ImportPayloadParseResult = { ok: true; rules: RedirectImportRule[] } | { ok: false; error: string };

/**
 * Client-side shape check for the bulk-import textarea: valid JSON, and an array. Nothing deeper —
 * the server remains the actual validator and reports per-item failures in its own `207`;
 * duplicating that schema client-side would be a second source of truth for it (see
 * `useImportRedirectsForm`'s `run:` comment).
 *
 * @complexity Time/space: O(1) beyond `JSON.parse`'s own cost in input length.
 */
export function parseImportPayload(raw: string): ImportPayloadParseResult {
  let rules: unknown;
  try {
    rules = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (!Array.isArray(rules)) {
    return { ok: false, error: "Must be a JSON array of rule objects." };
  }
  // Unchecked by design (see `useImportRedirectsForm`'s `run:` comment). `Array.isArray` narrows
  // `unknown` to `any[]`, which the mutation's input type accepted silently before this
  // extraction; this states it instead.
  return { ok: true, rules: rules as RedirectImportRule[] };
}
