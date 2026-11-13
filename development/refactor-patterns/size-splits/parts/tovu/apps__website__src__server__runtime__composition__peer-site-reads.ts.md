### tovu:apps/website/src/server/runtime/composition/peer-site-reads.ts
- **Over:** `createPeerSiteReads` 129 (file 390, under)
- **Phase:** after-move (MIXED: STAY-PRODUCT `CROSS_SITE_*` boundary tables; peer cache mechanics may move) · **Batch:** size-58
- **Tests:** `apps/website/src/server/runtime/composition/__tests__/peer-site-reads.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CHAT_SURFACE_DESCRIPTION`, `CROSS_SITE_READ_DOMAINS`, `CROSS_SITE_EXCLUDED`, `CROSS_SITE_EXCLUDED_TOOLS`, `CrossSiteUnavailable`, `unavailable`, `PeerBag`, `confinedPath`, `assertPeerThemes`, `composePeer`, `readsOnly`, `validatePeerCacheBounds` | cross-site boundary + read-only peer composition (stay) |
| B | inner `const openPeer = async ({ source, paths, request }` | open one peer's databases and compose it, closing handles on failure |
| C | rest of `createPeerSiteReads` (cache, LRU/idle eviction, `resolve`, close) | peer cache (stays) |

- **Splits:**
  1. HELPER `openPeerBag({ source, paths, request, openContent, openChat, now }: OpenPeerBagInput, _options: Record<string, never> = {}): Promise<PeerBag>` (module level, directly above `createPeerSiteReads`) ← body of the inner `openPeer` arrow (~L368-404) with its "Open and compose one read-only peer; failed provisional opens close all acquired handles" doc. `OpenPeerBagInput` = the arrow's current inline param type plus `openContent: typeof openSqliteFileKernel; openChat: typeof openNativeSqlite; now: () => number`. Keep the second options object (the existing `_options = {}` boundary carries over to the helper; CONVENTIONS rule 8).
  2. In `createPeerSiteReads` delete `openPeer` and rewrite its one call site (~L433, in `resolve`) to `entry = await openPeerBag({ source, paths, request: required, openContent, openChat, now });` (the defaulted option values).
- **Importers to update:** none.
- **After:** file ~392; `createPeerSiteReads` ~94; `openPeerBag` ~36.
- **Risks / notes:** Pass the DEFAULTED `openContent`/`openChat`/`now` from the options destructure (tests inject fakes). Only lift: `cachedOrMakeRoom`, `touch`, `remove`, `resolve` share `cache`/`pending`/`closed` mutable state and stay inside.
