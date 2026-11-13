### jini:packages/daemon/src/http/xai.ts
- **Over:** file 510 lines (no function over 100)
- **Phase:** now · **Batch:** size-17
- **Package entry:** not an exports target; `./http` → `src/http/index.ts`. If index.ts re-exports `XaiSearchResponse` (or any moved name) from `./xai.js`, retarget that name to the new module (`rg -n "xai" src/http/index.ts`).
- **Tests:** `rg -l "http/xai|\.\./xai(\.js)?'" src` — run every hit (expected `src/http/__tests__/xai*.test.ts`) + `src/http/__tests__/index.test.ts`. Check `vi.mock` in those files for `./xai.js` before moving.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A (stays) | constants, `XaiInternalErrorContext`, `XaiHttpDeps`, `ResolvedXaiHttpDeps`, dep resolvers, OAuth listener state (`pendingOAuthStates`, `stopListener`, `oauthStartQueues`, `serializeOauthStart`), `redactError`, `toStoredOAuthToken`, `persistToken`, `handleListenerCallback`, all `xai*Route` consts, `parseXaiOauthComplete`, `callXaiSearch`, `registerXaiRoutes` | OAuth flow + routes |
| B | `isRecord`, `nonEmptyString`, `parseOptionalString`, `parseOptionalBoolean`, `parseOptionalStringArray`, `XaiSearchRequest`, `parseXaiSearch`, `XAI_SEARCH_OPTIONAL_FIELDS`, `isProvidedSearchValue`, `XaiSearchResponse`, `outputContentBlocks`, `extractAnswerText`, `urlCitationOf`, `extractUrlCitations`, `buildXSearchTool`, `XaiCallGuard`, `xaiCallFailure`, `postXaiResponses`, `readXaiJson` | Responses-API request/response shaping for `x_search` + body parsing |

- **Splits:**
  1. NEW `xai-search-payload.ts` — unit B verbatim, source order (the `// ----` section banners and every comment move). Exports what xai.ts uses (`isRecord`, `nonEmptyString`, `XaiSearchRequest`, `parseXaiSearch`, `XaiSearchResponse`, `extractAnswerText`, `extractUrlCitations`, `buildXSearchTool`, `XaiCallGuard`, `postXaiResponses`, `readXaiJson`). Imports nothing from xai.ts (confirm `DEFAULT_SEARCH_TIMEOUT_MS` etc. are not read by unit B; per outline they are not).
- **Importers to update:** `src/http/index.ts` only if it names a moved export; tests per rg above.
- **After:** xai.ts ~365; xai-search-payload ~150.
- **Risks / notes:** `callXaiSearch` and `xaiSearchRoute` stay (they need `ResolvedXaiHttpDeps`), so there is no cycle.
