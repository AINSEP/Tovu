# Wave-B r3 — website NEW-class test failures (fix run, 2026-11-16, unattended)

Branch `fix/wave-b-r3-web` (from `origin/refactor/terra`), Jini `origin/refactor/terra` (detached, **not modified**, built: 0 failures).
Gates after the work: `tsc -p tsconfig.json` 0, `tsc -p tsconfig.tests.json` 0, eslint on the touched files: 0 new findings (only the pre-existing `max-lines` on `render.ts`).
Of the 36 NEW-class files: **25 pass now, 11 left** (table below). The 13 KNOWN files were not touched.

## Root causes (grouped) and what was done

| # | Root cause | Verdict | Fix (commit) |
|---|---|---|---|
| 1 | Migration 0042 / 84d9382e added `workspaces.version` (and 5 more tables) | tests + stale data | `seed-content.json` regenerated with the sanctioned `generate:seed-content`; boot-site-dir legacy-chain fixture inserts without the new column; resolve-workspace expects `version: 1`; commerce-strip-parity pins 0042's columns in the transfer catalog + classification (352c93d3d, 97ab454cd) |
| 2 | New raw `json_extract/json_each` in `project-keys/attachments.ts`, `project-store.ts`; lifecycle `.prepare(` read as SQLite | **product** (ratchet failing test existed) | `jsonText` dialect helper + bounded in-memory `worksFor` match; `.bind` on the lifecycle hook; baseline lowered for 2 files that shrank via `UPDATE_RAW_SQLITE_BASELINE` (519a7b4b0) |
| 3 | `asyncRoute` returns before its handler finishes; tests awaited the wrapper | tests | settings-events-resume, site-key-state use `.handler` (ecbd98030, 5e7fdada8) |
| 4 | (required, optional) argument rule changed seam shapes | tests | byok `resolveMessages({raw})`, index-boot `checkContentDbSchema({dbPath})`, SMTP `sendMail({mail})`, daemon preflight reply `pluginIds` (22af48960, 78b91e3fe, 050fbaa7e, b43de5d11) |
| 5 | Jini deliberately logs/exports **class labels only** (`describeErrorForLog`, `errorType`): no message, no stack, no unregistered class name | tests (Jini contract; cited in comments) | observability-middleware (log line `'Error'`, span `exception.type` `'Error'`, plus a new assertion that the message never reaches the log), caller-safe `UnlistedError` → `Error` (546ee74c3, 556d5b8cc) |
| 6 | Optimistic-concurrency `version` now on definition responses | tests | forms-response (98d4f0e3e) |
| 7 | Render workers' graph reached `@jini-ai/core` root through `@jini-ai/cms/forms` | **product** (failing test existed) | `render.ts` takes `renderFormCollection` from `forms/html-render`; theme resources split into `features/theme/public-theme-resources.ts` so `font-links.ts` no longer imports the forms registry; module budget now counts each dependency file once (a linked Jini checkout loads a 2nd parse5/entities copy; no budget changed) (e0860bec7) |
| 8 | ADR-070: daemon route `tool-access-lowering-route.ts` imported `admin-http/.../site-share-errors.ts` | **product** (failing test existed) | shared failure lifecycle moved to `server/inbound/shared/admin-failure.ts`; `site-share-errors.ts` re-exports it (02681286b) |
| 9 | `/products` (commerce) composed with `settingsReady: siteTitleReady`, so the storefront catalog waited on the legacy-title pin migration | **product** (AC-12 hung: "Express request did not finish") | commerce now waits on `siteSettingsReady` only (eb265a4ab) |
| 10 | Autosave: a lookup failure that is not "not found" now surfaces (500) instead of parking | tests (intended: resolvePostId comment) | old test now uses a lookup miss; **new** test for the non-miss failure (mutation: swallowing the error in `resolvePostId` makes it fail) (5e7fdada8) |
| 11 | Shipped-theme original lagged `tovu-starter/scripts/theme-toggle.js` (61f05b748) | intended drift | `theme sync-originals` (cf7fbafc2) |
| 12 | Standalone daemon needs one bound site (ADR-070); `import-local` CLI command exists; plugin-catalog on the 0.7.0 line; explicit daemon origin; HOME for key file; product stack frames | tests | component-catalog (partial), introspect, product-telemetry, assistant-daemon-client, storage-secret, theme-preview-refresh (ad2500533, 73ca0c373, 8361dc669, 6bf6da73e) |

Product bugs found: **#2, #7, #8, #9** (+ stale generated seed). Mutation evidence: #2/#7/#8/#9 each had a failing test before the fix and pass after; #10 verified by mutation.

## Left (11 of 36), with reason
- **Blocked by the KNOWN charts-recharts pin** (`[plugin-runtime] bundled initialization failed for 'charts-recharts'` is logged/warned, which these tests count): `static-publish/publish-run`, `admin-http/routes/agent-plugins/agent-plugin-set-enabled`, `admin-http/routes/plugins/browser-provider`, `composition/browser-provider`, `server/__tests__/admin-local-boot-session-route` (extra `console.warn`). Re-run after the pin decision.
- **KNOWN describeErrorForLog family**: `cli/.../serve-command` — the unhandled identity-seed rejection no longer prints the reason (`seedIdentity: a non-built-in role named 'owner'…`); an operator-visible loss, same root as `process-error-guards` / `fatal-boot-failure`. Needs the Jini decision, not a test edit.
- **Policy decision (manual approval by design)**: `deploy-targets/no-vendor-in-core.boundary` (new vendor vocabulary from the enlarged `SELECTED_AGENT_PLUGIN_PACKAGES`: commerce, calendly, google-*, posthog … ≈70 file/vendor pairs, plus real growth `anthropic 100→121`, `github 16→77`), `api-connections/vendor-neutrality` (`bundled-catalog.ts:43,44,53` name google plugin ids; `shared-owner.ts:80` is the English word "Picker"; two tests). Not approved here.
- **component-catalog-routes**: daemon now boots (site fixture + token + callback origin), but discovery needs a live run credential (ADR-070: proxy token alone → 404 "a live run is required"). The real-HTTP happy path needs a started run; not rewritten rather than weaken it.
- **deps-provider-plugin-boot** (EACCES project-store test): running as root, `chmod` does not deny; ENV.
- **platform/db/pg-fixture**: ENV (no postgres/psql).
- Jini-side recommendation (not pushed; Jini untouched): `cms/src/core/form-collection.ts` and `keyset-cursor.ts` import `@jini-ai/core` root; narrow subpaths (`@jini-ai/core/provider-registry`, a `tool-input-errors` export) would remove the barrel for every Tovu consumer, not just the workers.
- `commerce-attention` passed in 3 runs here (flaky/load-dependent in r2).

## Commits on `fix/wave-b-r3-web` (pushed; head `eb265a4ab`)
352c93d3d 519a7b4b0 ecbd98030 546ee74c3 98d4f0e3e 22af48960 78b91e3fe e0860bec7 02681286b b43de5d11 ad2500533 cf7fbafc2 556d5b8cc 97ab454cd 8361dc669 6bf6da73e 050fbaa7e 5e7fdada8 73ca0c373 eb265a4ab (+ this report).

Siblings re-run green: theme (all non-browser), project-keys, site-export/static-publish (except the pin-noise test), plugin-runtime, system/site-share*, shared/, raw-sqlite ratchet, commerce*. The 7 "preview tag" failures in `features/theme` need Playwright browsers (ENV, unchanged).
