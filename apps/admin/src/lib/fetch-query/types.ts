/**
 * @file The `fetch-query` contract — deliberately free of any library import.
 *
 * This file is the whole point of the `fetch-query/` directory: it is the
 * vocabulary the admin's 40 fetching files speak, and it names nothing from
 * TanStack Query. Swapping the implementation out (see `index.ts`'s header for
 * the rip-out procedure) must not require touching a single call site, which
 * is only true for as long as no TanStack type leaks through here.
 *
 * If you find yourself wanting to re-export a `UseQueryResult`, an
 * `InfiniteData`, or a `QueryClient` from this module, that is the signal that
 * the abstraction is being bypassed — add the narrow thing you actually need
 * to these types instead.
 */

/**
 * Cache identity for one server resource.
 *
 * An array rather than a string so parameterised resources compose without
 * hand-rolled key formatting: `['redirects']` for the list, `['redirects',
 * id, 'hits']` for one row's counter. Primitive-only by design — an object in
 * a key invites accidental identity mismatches between two structurally equal
 * keys, which reads as "the cache randomly misses".
 *
 * ## Invalidation matches by PREFIX, and that is part of this contract
 *
 * Invalidating `['redirects']` also invalidates `['redirects', id, 'hits']`.
 * Nesting a key under another is therefore a deliberate statement that the
 * child is derived from the parent and should refresh with it — not merely a
 * naming convention.
 *
 * Specified here rather than left as observed behaviour because it is exactly
 * the sort of implicit semantic that silently breaks a replacement adapter: a
 * `Map`-backed one doing exact-key equality would compile, pass a careless
 * review, and quietly stop refreshing derived data. `fetch-query.test.tsx`
 * pins it.
 *
 * The corollary matters when choosing keys: do NOT nest under a shared prefix
 * for resources that merely sound related, or one write will fan out refetches
 * across all of them.
 */
export type QueryKey = readonly (string | number)[];

/** Lifecycle of a read. `loading` is strictly the FIRST load (no data yet); a
 *  background refresh of already-present data is `success` + `isFetching`, so
 *  a revalidating screen never flashes its skeleton back. */
export type QueryStatus = "loading" | "success" | "error";

export interface QueryResult<T> {
  /** `undefined` until the first successful load. */
  data: T | undefined;
  /** Independent of `status` — a disabled query holding data from an earlier
   *  success can be `status: 'success'` with `error` non-null at the same
   *  time, if a LATER background refresh of that same data failed. See
   *  `FetchQueryOptions.enabled`'s doc for the full breakdown. */
  error: Error | null;
  status: QueryStatus;
  /** True whenever a request is in flight, including a background refresh
   *  where `data` is already populated and `status` is `'success'`. Drive
   *  subtle "refreshing" affordances off this; drive skeletons off `status`. */
  isFetching: boolean;
  /** Imperative re-read, ignoring freshness. For an explicit user gesture (a
   *  Refresh button) — routine invalidation after a write belongs in a
   *  mutation's `invalidates`, not a manual call to this. */
  refetch: () => void;
}

export interface FetchQueryOptions<T> {
  key: QueryKey;
  /** Must REJECT on failure. Resolving a sentinel (`[]`, `null`) on error
   *  makes a broken request indistinguishable from a real empty result — the
   *  same contract `ExecutionPort` documents and for the same reason. */
  fetch: () => Promise<T>;
  /**
   * When false, the query does not run. For reads gated on a user gesture or a
   * prerequisite value (`enabled: Boolean(selectedId)`), which is otherwise the
   * classic "fetch with an undefined id" bug.
   *
   * A disabled query never has `status: 'error'`, but whether `error` itself
   * is `null` depends on whether the key ever held data, because the
   * underlying cache does NOT forget a failure when a query is disabled:
   *
   * - Never held data (no earlier run of this key ever succeeded): reports
   *   `loading` and `error: null`, full stop — even if an earlier enabled run
   *   of the same key failed and that failure is still cached. Spelled out
   *   because passing that through meant a gesture-gated cell could render a
   *   stale error before the operator had gestured — a failure they cannot
   *   dismiss and did not ask to retry.
   * - Already holds data worth showing (an earlier run succeeded, even if a
   *   LATER background refresh of it then failed): reports `success` — the
   *   data is still the right thing to render — but `error` is the real
   *   failure, not `null`, so a caller that wants to flag "this may be stale"
   *   can. Silently dropping it here would let known-stale, known-broken data
   *   pass as an unqualified success with no way to tell.
   */
  enabled?: boolean;
  /** How long a cached value is served without a background refresh, in ms.
   *  Omitted means "always revalidate on mount", which is the safe default for
   *  admin data that another operator may have changed. */
  staleTime?: number;
  /** Per-query override for revalidating when the window regains focus. Omitted keeps the client
   *  default (`false` — see `adapter.tanstack.tsx`'s `createClient`). For a screen that can be
   *  changed from ANY other screen, agent tool, or a second desktop instance, and therefore has no
   *  single write path to invalidate it from (the Trash is the first: `2026-09-21-t8f-trash-forms-
   *  plan.md` §C), opt IN with `true` rather than lowering the shared default. */
  refetchOnWindowFocus?: boolean;
}

export type MutationStatus = "idle" | "pending" | "success" | "error";

export interface MutationResult<TInput, TOutput> {
  /**
   * Runs the write. RESOLVES with the result and REJECTS on failure, so a
   * caller that needs the outcome inline (`const created = await mutate(...)`)
   * can await it, while a fire-and-forget caller can ignore it and read
   * `status`/`error` instead.
   *
   * Both forms are safe: the returned promise already carries a rejection
   * handler, so discarding it does NOT raise `unhandledrejection`, and
   * awaiting it still throws. An implementation that returns a bare rejecting
   * promise satisfies the first sentence and breaks the second usage — the
   * default `mutateAsync` of at least one library does exactly that.
   *
   * Pinned by test. An earlier revision of this doc claimed the property was
   * only holdable "by construction" because no jsdom assertion could see it;
   * that was wrong, and twice over — jsdom's `window` event does not fire, but
   * Node's `process.on('unhandledRejection')` does, and discriminates a bare
   * `mutateAsync` from a handler-attached one. A replacement adapter is held to
   * this by the suite, not by trust.
   */
  mutate: (input: TInput) => Promise<TOutput>;
  status: MutationStatus;
  error: Error | null;
  /** Clears `status`/`error` back to idle — for dismissing a stale failure
   *  banner without remounting the form. */
  reset: () => void;
}

export interface FetchMutationOptions<TInput, TOutput> {
  run: (input: TInput) => Promise<TOutput>;
  /**
   * Keys to mark stale once the write succeeds; anything currently mounted
   * under them refetches. This replaces the hand-rolled `await write(); load()`
   * pairing, and fixes its quiet bug: `load()` only refreshes the component
   * that happened to own the loader, while two screens showing the same
   * resource silently drift apart.
   *
   * Not fired on failure — a rejected write changed nothing to invalidate.
   */
  invalidates?: readonly QueryKey[];
}

/**
 * The dependency-injection surface. One object so the provider, the hooks and
 * the imperative invalidator move together when the implementation is swapped
 * — a rip-out changes exactly one binding rather than four exports.
 */
export interface FetchQueryAdapter {
  useFetchQuery: <T>(options: FetchQueryOptions<T>) => QueryResult<T>;
  useFetchMutation: <TInput, TOutput>(
    options: FetchMutationOptions<TInput, TOutput>,
  ) => MutationResult<TInput, TOutput>;
  useInvalidate: () => (key: QueryKey) => void;
}
