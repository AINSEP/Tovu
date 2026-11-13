### jini:packages/platform/src/asset-cache.ts
- **Over:** `createAssetCache` 123
- **Phase:** now · **Batch:** size-26
- **Tests:** `src/__tests__/asset-cache.test.ts`, `src/__tests__/asset-cache-dispatcher.test.ts`, `src/__tests__/validating-lookup.hostile.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | option locals, `dispatcher`, `inflight`, `fetchAndStore`, `get`, `return` | cache orchestration (stays) |
| B | `readFromDisk`, `writeToDisk` | on-disk cache entries |
| C | `resolveContentType` | MIME choice (reads no locals) |
| D | `assertWithinLimit`, `drainCapped`, `readBodyCapped` | size-capped body read |

- **Splits** (module level above `createAssetCache`):
  1. Lift `function resolveContentType({ headerValue, url })` verbatim to module level (reads only module consts).
  2. HELPER `createAssetDiskStore({ cacheDir }: CreateAssetDiskStoreInput): { readFromDisk; writeToDisk }` ← `async function readFromDisk({ key }, _options = {})` and `async function writeToDisk(key: string, result: AssetCacheResult)` verbatim.
  3. HELPER `createCappedBodyReader({ maxBytes }: CreateCappedBodyReaderInput): { assertWithinLimit; readBodyCapped }` ← `function assertWithinLimit`, `async function drainCapped(` (with its comment), `async function readBodyCapped(` (with its comment).
  4. Main destructures both helpers' results where those functions were declared.
- **Importers to update:** none.
- **After:** file ~255; `createAssetCache` ~58; helpers ≤ 40.
- **Risks / notes:** `asset-cache-dispatcher.test.ts` mocks `../asset-cache.adapter.js` (not this file) — unaffected. The SSRF "Pin SSRF validation" comment stays with `suppliedDispatcher`.
