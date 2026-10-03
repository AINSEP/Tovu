/**
 * @file `fetch-query` — the admin's server-state interface.
 *
 * Every component that reads or writes server data goes through these four
 * exports. The library behind them is an implementation detail that no call
 * site names, imports, or types against.
 *
 * ## Why the indirection exists
 *
 * The admin had no caching at all: 38 files, 123 `api.*` call sites, each
 * re-fetching on every mount with its own `useState` triple for
 * data/loading/error. The cost was visible — leaving a settings tab and coming
 * back re-ran a 24-process CLI scan on the server. The alternative to a
 * library is hand-rolling per-module memos, which is how that bug got fixed
 * the first time and does not generalise.
 *
 * The indirection is the price of keeping that decision reversible.
 *
 * ## Rip-out procedure
 *
 * 1. Write a replacement adapter exporting the same hooks and provider, backed by
 *    `useState`/`useEffect` and a `Map` (or any other library).
 * 2. Change the hook/provider bindings below; preserve the host callback shapes in `types.ts`.
 * 3. The former adapter was the only permitted TanStack import. Its ESLint restriction kept
 *    callers from bypassing this interface; the same boundary remains necessary with Jini.
 *
 * No call site changes. That claim holds because (a) `types.ts` imports only
 * our shared contract, with no query-library types, and (b) the ESLint rule fails the build if
 * anything outside the adapter imports TanStack directly — so there can be no
 * straggler quietly holding the retired dependency in place. Deleting that rule is
 * what would actually break this guarantee, not deleting the library.
 *
 * ## What does NOT belong here
 *
 * Surfaces driven by `@jini-ai/ui` components. Those take a `port` and call it
 * from inside Jini's own hooks (`useExecutionTab`, and the ~23 other
 * port-injected features), so a Tovu-side React cache never sees the request.
 * Caching for those belongs in the host's port implementation — see
 * `execution-settings.ts`'s `cachedDetection`, which is exactly that, and is
 * not a case of missing this abstraction.

 */

export { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
export { useCachedLoader, useFetchMutation, useFetchQuery, useInvalidate } from "./adapter.tanstack";

export type {
  CachedLoader,
  CachedLoaderOptions,
  FetchMutationOptions,
  FetchQueryAdapter,
  FetchQueryOptions,
  MutationResult,
  MutationStatus,
  QueryKey,
  QueryResult,
  QueryStatus,
} from "./types";
