### jini:packages/oauth/src/refresh.ts
- **Over:** `createTokenRefresher` 130
- **Phase:** now · **Batch:** size-26
- **Tests:** `tests/token-refresh.test.ts`, `tests/refresh.f1.test.ts`, `tests/args-convention.test.ts` (`pnpm --filter @jini-ai/oauth exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `skewMs`, `leaseWaitMs`, `leasePollMs`, `sleep`, `inFlight`, `refreshOnce`, `return {` | refresher wiring + single-flight (stays) |
| B | `markNeedsReauthBestEffort`, `performRefresh` | redeem the refresh token and persist / mark reauth |
| C | `awaitLeaseHolder` | wait for another holder's lease result |

- **Splits** (module level above `createTokenRefresher`):
  1. HELPER `createRefreshPerformer({ deps }: CreateRefreshPerformerInput): (key: string, current: OAuthTokenSet) => Promise<string>` ← `const markNeedsReauthBestEffort = async (key: string, reason: string)` (with its "Preserve the terminal OAuth signal" comment) and `const performRefresh = async (key: string, current: OAuthTokenSet)`; returns `performRefresh`. `deps: OAuthRequiredArgs<TokenRefresherDeps>`.
  2. HELPER `awaitLeaseHolder({ deps, key, leaseWaitMs, leasePollMs, skewMs, sleep }: AwaitLeaseHolderInput): Promise<…same as today…>` ← body of `const awaitLeaseHolder = async ({ key }, _optionalArgs = {})` (with its "Poll durable storage" comment). Main keeps `const awaitLeaseHolder = ({ key }: { readonly key: string }, _optionalArgs = {}) => awaitLeaseHolderUntilResolved({ deps, key, leaseWaitMs, leasePollMs, skewMs, sleep });` — name the module helper `awaitLeaseHolderUntilResolved` to avoid shadowing.
  3. Main: `const performRefresh = createRefreshPerformer({ deps });`.
- **Importers to update:** none.
- **After:** file ~185; `createTokenRefresher` ~65; helpers ~45 / ~30.
- **Risks / notes:** `inFlight` must stay per refresher (it does). Same awaits, same order.
