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
 * 1. Write `adapter.local.tsx` exporting the same four names, backed by
 *    `useState`/`useEffect` and a `Map` (or any other library).
 * 2. Change the one `export ... from './adapter.tanstack'` line below.
 * 3. `npm uninstall @tanstack/react-query`, and drop the allowance for
 *    `adapter.tanstack.tsx` from `eslint.config.mjs`'s `no-restricted-imports`
 *    rule.
 *
 * No call site changes. That claim holds because (a) `types.ts` imports
 * nothing from any library, and (b) the ESLint rule fails the build if
 * anything outside the adapter imports TanStack directly — so there can be no
 * straggler quietly holding the dependency in place. Deleting that rule is
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

export { FetchQueryProvider, useCachedLoader, useFetchMutation, useFetchQuery, useInvalidate } from "./adapter.tanstack";

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
