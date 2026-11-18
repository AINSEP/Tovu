# hooks-sweep-2 (Tovu)

Branch `wave3/hooks-sweep-2`, cut from `origin/refactor/terra` = `ada11733f`. Companion Jini branch of the same name (cut from `4c1892368`). Node 24.11.1. Setup: `npm ci` (root, apps/admin, apps/site-chat), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (Jini checkout named `Jini`, built with `pnpm --no-bail -r build`, exit 0), `npm run build` in `packages/contracts` and `packages/sdk`. Vitest `--maxWorkers=2`.

## Done

The three FREE Tovu sites left by hooks-sweep-1 were all in `apps/admin/src/features/providers/Providers.tsx` (`useAdminThemeBoundary`, `useAdminLocale`, `useProvidersHook`). Done together with the tab-body split the sweep-1 report asked for:
- `Providers` is now a small hook shell: `({ useProvidersHook = useProviders, hooks = defaultProvidersHooks, ...props })`, `hooks` = `{ useAdminThemeBoundary, useAdminLocale }` (exported `defaultProvidersHooks`). It renders `ProvidersView`, which holds the old body and receives the already-resolved values. The `resolveProvidersHook` resolver and its complexity-ceiling comment are gone (the default now sits on the shell, not the body).
- The four tab-bar entries moved to `providersTabs({ locale })` so `ProvidersView` stays under the size debt value of the old `Providers`.
- Output test (`__tests__/Providers.unit.test.tsx`, new `describe`): fake `useAdminThemeBoundary` puts a `data-fake-boundary` attribute on `.providers-page`, fake `useAdminLocale` is called, the heading renders.
- The other 46 FREE Tovu sites of the inventory were converted by hooks-sweep-1, which is already in `refactor/terra`; the 235 owned sites were left untouched.

Commit (pushed to `origin/wave3/hooks-sweep-2`): see "Commits".

## Gates (exact command -> result)

| command | result |
|---|---|
| `cd apps/admin && npx tsc --noEmit` | clean |
| `cd apps/admin && npx vitest run --maxWorkers=2 src/features/providers` | 4 files, 34 tests pass |
| `node development/scripts/check-hook-injection.mjs` | ok; 238 direct calls at base -> 235; `--update` only removed the 3 Providers entries (0 insertions in the diff) |
| `npm run check:size` | ok (202 violations, 192 debt entries, 10 accepted); the stale `Providers#1` 123-line entry was deleted, `ProvidersView` is below it |
| `npm run check:complexity` | ok: 43 entries |
| `npm run check:architecture` | FAILED, identical on the unmodified base (checked in a clean worktree of `origin/refactor/terra`): 124 "NEW cross-feature edge" lines and 3 regressed metrics, all `apps/website`; not touched here |
| `npm run check:errors` | passed (817 findings); prints "9 entries improved or are gone", not compared against base |
| push | `git push -u origin wave3/hooks-sweep-2` succeeded without `--no-verify`; the desktop pre-push hook did not block (no `apps/desktop` change) |

## Left / next step
- Nothing FREE left in Tovu. Owned sites (235) belong to their plans.
- `check:architecture` is red on base; not this run's concern.
- Overlaps: only `apps/admin/src/features/providers/**` and the two debt files `development/hook-injection-debt.json`, `development/scripts/size-debt.json`.
