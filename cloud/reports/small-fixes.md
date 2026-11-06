# Small fixes — in progress

Job small-fixes; branch `cloud/small-fixes` only. Started 2026-11-06 02:55 UTC, hard stop 04:55 UTC.
Base: Tovu current `origin/cloud/combine` at `5358aa594fb6e8c0ca107b1106fbf9ae43871d50`; sibling Jini base `b0cc1371b5e739f9cd1b26f14aa5a21a82416b60`.

1. Large choice answers: fixed and tested in Jini (`b8153eba7`).
2. DeepSeek authentication classification: fixed and tested in Jini (`b8153eba7`).
3. Upload/extraction limits: Jini 50 MiB policy implemented (`4165a61b3`); host wiring and bounded attachment reads in progress.
4. Disabled plugin guidance: Jini and Tovu implementation in progress; no activation/execution gates changed.
5. Replaced media: implemented. All public rendition spellings use `public, no-cache`; existing ETags revalidate live-source URLs, including matching/stale version queries, stable ids and editable/retired slugs. Original and gated media retain `private, no-store`.

Cache validation: before implementation, the new regression failed on the year-long immutable header and the original three cache cases passed. After implementation, four cache integration tests, eleven site media tests and twelve original-route tests passed. The broader affected route run had 77 tests: 56 passed, 21 failed, zero skipped. A representative real-PNG generation case also failed 500 vs 200 with the exact base route restored temporarily; modified route was restored and SHA-verified afterward. The unchanged in-memory adapter lacks `saveRenditionIfSource`, which the existing rendition guard requires. Listed, not fixed outside this job.

Read cost: no additional repository or blob reads per origin request. Existing stored-id rendition path has six repository calls and one blob read, plus optional widget listing; access gating scans workspace posts. Existing conditional GET still loads/hashes bytes, saving transfer rather than reads. `no-cache` increases origin validation frequency. Previously stored immutable browser responses cannot be evicted retroactively by new server headers.

Exact cache test commands from Tovu after `source /workspace/.tovu-build/env.sh` (with loopback network permission):

- `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts`
- Broader affected commands and final verification will be recorded before completion.

BUG FOUND: Existing rendition generation returns 500 in 21 affected tests; a representative failure is verified on the base route. No unrelated fix made.
