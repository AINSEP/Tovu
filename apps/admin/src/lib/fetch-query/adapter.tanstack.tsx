/**
 * @file The ONE file permitted to import `@tanstack/react-query`.
 *
 * Enforced mechanically, not by convention: `eslint.config.mjs` bans that
 * import everywhere else in `apps/admin`, so a stray direct import fails lint
 * rather than quietly re-coupling the app to the library. That rule is what
 * makes the rip-out procedure in `index.ts` a guarantee instead of a hope — if
 * it ever gets removed, this file stops being a boundary and becomes just
 * another module that happens to import a library.
 *
 * Everything here is translation. No admin-domain logic belongs in this file;
 * a swap to a different implementation should be able to ignore it entirely
 * and re-satisfy `FetchQueryAdapter` from scratch.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  FetchMutationOptions,
  FetchQueryOptions,
  MutationResult,
  QueryKey,
  QueryResult,
} from "./types";

/**
 * `unknown` is what a rejected promise actually gives us, and the contract
 * promises callers an `Error`. Normalising here rather than at each call site
 * keeps `catch (e) { e instanceof Error ? ... }` out of 40 components — the
 * exact boilerplate this module exists to delete.
 */
function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" && value.trim() ? value : fallback);
}

/**
 * Defaults chosen for a multi-operator admin, where the server is the source
 * of truth and someone else may have changed a record in another tab.
 *
 * `staleTime: 10_000` (owner decision, TM-TOVU-2026-08-12-A request-volume audit,
 * 2026-08-12 — was `0` from this module's original authoring; changed here, not
 * per-query, because the owner wants the DEFAULT changed, not an opt-in). `0`
 * meant every query was stale the instant it mounted, so navigating away from a
 * screen and back — or closing a detail panel and reopening the same record —
 * refetched from the network at full cost every time, identical to a first
 * visit (measured: `apps/admin/src/__measurements__/request-volume.measurement
 * .test.tsx`'s "remount / re-navigation" suite, redirects 1->1 and collections
 * entry-editor reopen 3->3 requests under the old default). That is very likely
 * what the operator-facing "admin keeps re-requesting things" complaint this
 * audit was answering was actually observing post-migration, not the request-
 * amplification the migration itself already fixed.
 *
 * Why ten seconds specifically: it covers the pattern this is meant to fix —
 * open a record, read it, close it, reopen it; or bounce to another screen and
 * straight back. 5s was considered and rejected as too short to reliably span
 * "read it, then come back," which would forfeit most of the benefit at nearly
 * identical freshness cost. 30s was the owner's first instinct and was pulled
 * back deliberately: this is a global default across all 11 migrated features
 * that has never run against real operator behaviour, so the conservative first
 * move keeps the exposure window to ten seconds. Raising it later is cheap now
 * that the harness measures the before/after directly. The exposure being
 * bounded is what makes any of these values defensible — the app already shows
 * no other-operator change while a screen stays mounted (no polling,
 * `refetchOnWindowFocus: false`), so the only window this opens is "someone
 * else changed X and you navigate back to X within it."
 *
 * `10_000` does NOT weaken write-driven correctness: `invalidateQueries`
 * (every `invalidates`/`useInvalidate()` site) calls `refetchQueries({ type:
 * "active" })` immediately and never consults `staleTime` — confirmed both by
 * reading `query-core`'s `queryClient.js`/`query.js` and by re-running
 * deliverable A's per-action request counts unchanged after this edit (see
 * the commit that made this change for the verification record). A read that
 * genuinely must show fresh data on every single mount, not just after a
 * write, should opt OUT via a per-query `staleTime: 0` rather than this
 * default being lowered back for everyone. Nothing needs that today — zero
 * call sites pass a per-query `staleTime` anywhere in this codebase as of
 * this change, so the first screen that ever does will be the FIRST call
 * site, not a continuation of an existing pattern.
 *
 * `retry: false` — deliberate. `api.ts`'s `request()` throws a typed `ApiError`
 * carrying the server's own status and code, and the admin's screens report
 * that message verbatim. Silent retries would delay every genuine 4xx by three
 * round trips to re-derive an answer the first response already gave, and a
 * 403 or a validation error is not going to succeed on attempt two.
 */
function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function FetchQueryProvider({ children }: { children: ReactNode }) {
  // `useMemo` and not a module-level singleton: a client created at module
  // scope is shared by every test in a file and leaks one case's cache into
  // the next, which is the standard way this setup produces tests that pass
  // alone and fail in a suite.
  const client = useMemo(createClient, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// TanStack reports a disabled query as `pending`, same as a first load. Our
// contract folds both into `loading` ("no data, nothing to show yet"), which
// is what a caller actually branches on.
//
// Disabling does NOT clear a cached failure, though, and TanStack keeps
// `data` from the last success even after a LATER fetch attempt errors (the
// failure only flips `status`/`error`; nothing clears `data`). That leaves
// two distinct cached-failure shapes once disabled, not one:
//
//   - Never succeeded (`data` is `undefined`): passing the error through
//     broke this module's own stated contract ("stays `loading` with no
//     request in flight") and, on the pilot screen, made a gesture-gated
//     cell render a stale failure before the operator had gestured at all —
//     a lazy read reporting a failure nobody asked it to retry, and one it
//     cannot dismiss because nothing is "retrying" from its point of view.
//     Reports `loading`, `error: null`.
//   - Succeeded before, then broke on a later background refresh (`data` is
//     defined): the data is still the best answer available and worth
//     rendering, so `status` stays `success` — but silently dropping the
//     error here would let a caller present known-stale, known-broken data
//     as an unqualified success with no way to detect it. Reports
//     `success`, and — unlike the never-succeeded case — the real `error`,
//     so a caller that wants to flag "may be stale" can, without losing the
//     right to just keep showing `data` if it doesn't care.

/**
 * Folds TanStack's own `status` plus this hook's `disabled`/`hasData` reads into the module's
 * three-value contract — the nested ternary this used to be, flattened to a top-level function per
 * this pass's extraction rule (§2 of the complexity-ceiling brief): nested ternaries carry a real
 * cognitive-complexity nesting penalty a flat `if` chain of the same branch count does not, which is
 * the entire reason `useFetchQuery` scored high here despite doing no more actual branching.
 */
export function resolveFetchQueryStatus<T>(disabled: boolean, hasData: boolean, tanstackStatus: "pending" | "error" | "success"): QueryResult<T>["status"] {
  if (disabled) return hasData ? "success" : "loading";
  if (tanstackStatus === "error") return "error";
  if (tanstackStatus === "success") return "success";
  return "loading";
}

/**
 * The `error` half of the same disabled/never-succeeded-vs-succeeded-before fold `resolveFetchQueryStatus`
 * documents above — split into its own function rather than kept as a second nested ternary for the
 * same reason.
 */
export function resolveFetchQueryError(rawError: unknown, disabled: boolean, hasData: boolean): Error | null {
  if (!rawError) return null;
  if (disabled && !hasData) return null;
  return toError(rawError, "request failed");
}

export function useFetchQuery<T>({
  key,
  fetch,
  enabled = true,
  staleTime,
  refetchOnWindowFocus,
}: FetchQueryOptions<T>): QueryResult<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: fetch,
    enabled,
    ...(staleTime === undefined ? {} : { staleTime }),
    ...(refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus }),
  });

  const disabled = !enabled;
  const hasData = query.data !== undefined;

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    data: query.data,
    error: resolveFetchQueryError(query.error, disabled, hasData),
    status: resolveFetchQueryStatus(disabled, hasData, query.status),
    isFetching: query.isFetching,
    refetch,
  };
}

export function useFetchMutation<TInput, TOutput>({
  run,
  invalidates,
}: FetchMutationOptions<TInput, TOutput>): MutationResult<TInput, TOutput> {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const key of invalidates ?? []) {
        // Not awaited: invalidation marks entries stale and lets mounted
        // observers refetch on their own schedule. Awaiting it would hold
        // `mutate()`'s promise open until every dependent read finished,
        // turning "the save succeeded" into "the save succeeded AND the list
        // finished reloading" — a slower, and different, claim.
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });

  // `mutateAsync` rather than `mutate`: the contract promises a promise that
  // rejects, so callers can `try/catch` a write inline. Bare `mutate` swallows
  // the rejection into state only.
  const { mutateAsync, reset } = mutation;
  const call = useCallback(
    (input: TInput) => {
      const promise = mutateAsync(input);
      // Both documented usages have to be safe, and returning `mutateAsync`
      // bare only made one of them safe: a caller following the "ignore it and
      // read `status`/`error`" form got an `unhandledrejection` on every failed
      // write. Attaching a handler marks THIS promise handled; the same promise
      // is still returned, so `await`/`.catch()` callers see the rejection
      // exactly as before. The derived promise is discarded on purpose.
      void promise.catch(() => {});
      return promise;
    },
    [mutateAsync],
  );

  const status: MutationResult<TInput, TOutput>["status"] =
    mutation.status === "pending"
      ? "pending"
      : mutation.status === "success"
        ? "success"
        : mutation.status === "error"
          ? "error"
          : "idle";

  return {
    mutate: call,
    status,
    error: mutation.error ? toError(mutation.error, "request failed") : null,
    reset,
  };
}

/** Imperative invalidation for events that arrive from outside React — the
 *  settings SSE change feed being the live example. */
export function useInvalidate(): (key: QueryKey) => void {
  const client = useQueryClient();
  return useCallback(
    (key: QueryKey) => {
      void client.invalidateQueries({ queryKey: key });
    },
    [client],
  );
}
