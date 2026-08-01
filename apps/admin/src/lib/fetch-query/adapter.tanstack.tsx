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
 * keeps `catch (e) { e instanceof Error ? ... }` out of 38 components — the
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
 * `staleTime: 0` — revalidate on mount by default. The win this module is
 * bought for is deduping and cross-component sharing, NOT serving stale
 * records; a per-query `staleTime` opts specific reads into caching where the
 * data genuinely does not move.
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
      queries: { staleTime: 0, retry: false, refetchOnWindowFocus: false },
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

export function useFetchQuery<T>({ key, fetch, enabled = true, staleTime }: FetchQueryOptions<T>): QueryResult<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: fetch,
    enabled,
    ...(staleTime === undefined ? {} : { staleTime }),
  });

  // TanStack reports a disabled query as `pending`, same as a first load. Our
  // contract folds both into `loading` ("no data, nothing to show yet"), which
  // is what a caller actually branches on.
  const status: QueryResult<T>["status"] =
    query.status === "error" ? "error" : query.status === "success" ? "success" : "loading";

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    data: query.data,
    error: query.error ? toError(query.error, "request failed") : null,
    status,
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
  const call = useCallback((input: TInput) => mutateAsync(input), [mutateAsync]);

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
