import type { PublishCredentialSummary, PublishProviderId } from "./types";

/**
 * @file A tiny fire-and-forget scheduler for "heal this row's account label in the background,
 * without ever blocking or breaking the caller's own read." Built for exactly one caller — the admin
 * publish-credentials GET route's own list handler (`server/routes/admin/system/
 * publish-credentials.ts`) — but kept free of any domain knowledge (no provider vocabulary, no
 * verify/decrypt concept) so it never has to import anything from `static-publish/verify.ts`. That
 * module already imports FROM this feature (`types.ts`'s own header: `publish-credentials` is the
 * lower, canonical module; `static-publish` borrows its provider union, not the other way round), so a
 * reverse import here would open a module cycle this codebase's `check:architecture` gate exists to
 * catch. The caller decides WHICH ids need healing ({@link idsNeedingAccountLabelHeal}, using a
 * `canYieldAccountLabel` predicate it supplies) and WHAT healing an id means (its own `heal` callback,
 * `verifyAfterSave`-shaped); this module only decides WHEN to call it, and never more than once per id
 * at a time.
 *
 * Why this exists — the mechanism it fixes:
 * `publish_credential_sets.account_label` starts `null` on every row and is only ever populated by a
 * human-gated `verifyPublishCredentialById` -> `healAccountLabel` pass (`store.ts`'s own header). That
 * pass already runs automatically on every save (`POST`/`PUT`, unconditionally when a connection is
 * supplied) — so a NEWLY saved credential heals itself immediately — but a row whose very first
 * auto-verify failed (provider unreachable at save time, or a row saved before this wiring existed)
 * stays `null` forever unless a human clicks the per-row "Verify" action. This scheduler closes that
 * gap: the admin GET route calls {@link AccountLabelHealScheduler.triggerFor} with every currently-null,
 * healable row id on every list request, and this module guarantees at most one heal attempt per id is
 * ever in flight, and that a failed or slow attempt can never surface as an error on the READ that
 * triggered it.
 *
 * Deliberately NOT reachable from anywhere agent-facing: only this feature's admin route (a
 * human-gated surface, per `static-publish/verify.ts`'s own "never an agent tool" header) is expected
 * to hold a reference to a scheduler instance. This module cannot enforce that itself — it has no way
 * to — so the boundary is a wiring discipline the CALLER owns, exactly like `verifyAfterSave`'s own doc
 * comment already states for the identical reason.
 */

/**
 * Every id in `credentials` whose `accountLabel` is still unknown AND whose provider can ever produce
 * one — probing a provider `canYieldAccountLabel` already says "no" for (Netlify, Cloudflare Pages,
 * S3-compatible today — see `static-publish/verify.ts`'s own header) would be a wasted network call on
 * a read path for a result that can never arrive, so those rows are excluded here rather than left for
 * the scheduler to attempt and silently no-op.
 * @complexity O(n) in `credentials.length` — one filter pass, no per-row I/O.
 */
export function idsNeedingAccountLabelHeal(credentials: readonly PublishCredentialSummary[], canYieldAccountLabel: (providerId: PublishProviderId) => boolean): string[] {
  return credentials.filter((c) => c.accountLabel === null && canYieldAccountLabel(c.providerId)).map((c) => c.id);
}

export interface AccountLabelHealSchedulerDeps {
  /** Attempts to heal exactly one row — expected to be `verifyAfterSave`-shaped (probe the real
   *  provider, then persist the label if one came back). May reject; a rejection is caught and
   *  reported via `onHealError`, never re-thrown into whatever triggered this heal. */
  heal(id: string): Promise<unknown>;
  /** Called when `heal` rejects (or throws synchronously, despite the documented contract — see
   *  {@link createAccountLabelHealScheduler}'s own doc). Defaults to a `console.error` matching
   *  `publish-credentials.ts`'s own `sendStoreError` fallback-logging convention, so a background heal
   *  failure shows up in the same place an unexpected route error already does. Injectable so a test
   *  can assert on failures without depending on `console` output. */
  onHealError?(id: string, err: unknown): void;
}

export interface AccountLabelHealScheduler {
  /**
   * Fires `deps.heal(id)` for every id in `ids` not ALREADY in flight from a previous call — never
   * awaited, never throws, never returns a rejected (or any) Promise to the caller. Safe to call on
   * every single request: an id already healing is simply skipped; an id whose previous attempt already
   * settled (success OR failure) is eligible again, so a transient failure is not a permanent
   * blacklist.
   * @complexity O(n) in `ids.length` — one Set membership check and, for a new id, one fire-and-forget
   *   call per entry.
   */
  triggerFor(ids: readonly string[]): void;
}

/** Mirrors `publish-credentials.ts`'s own `sendStoreError` fallback (`console.error("[publish-
 *  credentials] ...", err)`), so a background heal failure shows up in the same place an unexpected
 *  route error already does. */
function defaultOnHealError(id: string, err: unknown): void {
  console.error(`[publish-credentials] background account-label heal failed for '${id}'`, err);
}

/** Starts exactly one heal attempt for `id` — the one place this module calls `deps.heal`. Wrapped in
 *  its own `try`/`catch` around the CALL itself, not just a `.catch()` on its return value: `heal` is
 *  documented to always return a Promise (never throw synchronously), but this module must not depend
 *  on every caller honoring that — a synchronous throw here, left unguarded, would escape `triggerFor`
 *  and, at this module's one real call site (a route handler that already sent its response), turn
 *  into exactly the unhandled-async-rejection bug class `server/routes/admin/system/
 *  publish-credentials.ts`'s own `62ca21c7` was written to eliminate from this same file. */
function startHeal(id: string, deps: Required<AccountLabelHealSchedulerDeps>, inFlight: Set<string>): void {
  inFlight.add(id);
  let result: Promise<unknown>;
  try {
    result = deps.heal(id);
  } catch (err) {
    inFlight.delete(id);
    deps.onHealError(id, err);
    return;
  }
  result
    .catch((err: unknown) => deps.onHealError(id, err))
    .finally(() => {
      inFlight.delete(id);
    });
}

/**
 * Builds one scheduler instance. Call ONCE per route registration (like `verifyAfterSave` itself) and
 * reuse it across every request — the in-flight tracking is only useful if it survives between calls.
 * @complexity O(1) to construct.
 */
export function createAccountLabelHealScheduler(deps: AccountLabelHealSchedulerDeps): AccountLabelHealScheduler {
  const resolvedDeps: Required<AccountLabelHealSchedulerDeps> = { onHealError: defaultOnHealError, ...deps };
  const inFlight = new Set<string>();

  return {
    triggerFor(ids: readonly string[]): void {
      // Defense in depth, matching `startHeal`'s own reasoning: this function's one real caller is a
      // route handler that has already sent its response by the time this runs, so NOTHING here may
      // ever throw back into it — not even a bug in this loop itself.
      try {
        for (const id of ids) {
          if (!inFlight.has(id)) startHeal(id, resolvedDeps, inFlight);
        }
      } catch (err) {
        resolvedDeps.onHealError("*", err);
      }
    },
  };
}
