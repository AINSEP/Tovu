# REPORT-A — Stage A full VERIFY (report only; no source edits)

Host: vm, 4 cores, Node v24.22.0. Tovu HEAD at start: `bbf0cb61` (branch overnight = origin/cloud/overnight-1024-tovu). Jini: cloud/overnight-1024-jini cloned fresh. Run 06:41Z → ~08:55Z.

**Setup deviations (ENV, not product bugs):** apps/site-chat and apps/desktop have their own lockfiles → each needed its own `npm ci` (not in COMMON.md SETUP); without it 11 site-chat test files fail with `Cannot find module 'react'` and desktop typecheck/tests fail on missing `electron`. After `npm ci` (--ignore-scripts) site-chat = 247/247 pass; desktop preload built OK. No Postgres server / no Chromium → all `*.postgres.test.ts` and browser tests fail (ENV).


## Summary table (Tovu node:test; counts are TAP "# tests/pass/fail/skipped" = every subtest incl. nested)

| suite | tests | pass | fail | skipped | NEW | PRE-EXISTING | ENV |
|---|---|---|---|---|---|---|---|
| web-1 assistant+cli+contracts+__tests__ | 4572 | 4543 | 26 | 3 | 18 | 1 | 7 |
| web-2 platform | 2736 | 2652 | 57 | 8 | 8 | 1 | 71 |
| web-3 server/inbound | 4787 | 4757 | 23 | 7 | 21 | 0 | 3 |
| web-4 server (non-inbound) — INCOMPLETE | ≥1659 results (no summary: killed at 2400s timeout) |  | 24 not-ok seen |  | 22 | 0 | 0 |
| web-5 features (1st quarter of sorted list) | 2962 | 2930 | 26 | 6 | 4 | 0 | 22 |
| web-6 features (2nd) | 4497 | 4479 | 18 | 0 | 2 | 0 | 16 |
| web-7 features (3rd) | 3916 | 3910 | 2 | 4 | 0 | 1 | 1 |
| web-8 features (4th) | 3128 | 3118 | 6 | 4 | 6 | 0 | 0 |
| agent-plugins+packages/sdk+development/scripts+eslint-rules (site-chat counted separately) | 2279 | 2255 | 23 | 1 | 12 | 0 | 11 |
| site-chat (apps/site-chat, after `npm ci` there) | 247 | 247 | 0 | 0 | 0 | 0 | 0 |
| admin vitest 4 (apps/admin) | 13541 | 13511 | 28 | 2 | see below | – | – |
| desktop gates | tests: 48/49 pass in the failing file (1 fail), full node+tsx run failed | | | | | | |

### Honest limits
- Shard 4 (server/ non-inbound, 421 files) HUNG on `assistant-chat-recovery-bounds` in the first attempt (idle at 07:29, killed); the re-run with `--test-timeout=90000` was killed by the 2400 s cap during 'publish-content media' having reported ≥1659 results — **its tail was not run; shard 4 is NOT a pass.** Not-ok seen: 24.
- Tovu coverage (`coverage:all-files` needs a full instrumented `test:cov` run, ~50+ min) was NOT run — time cap. No Tovu line/branch numbers exist in this report.
- Classification NEW/ENV/PRE-EXISTING is regex-based on the failure name + first error line; the 3 'known' failures: 'real call sites' (purpose-scoped-mailer) did not appear verbatim (not in this run's failures — may be fixed or masked), 'never-store' (shard 7) + 'real round trip' (shard 1) appeared.
- Failure clusters look correlated (e.g. 'provider connection-higgs declares no supported grants', `Unknown TOVU_MEDIA_BLOB_STORE 's3'`, many `Expected values to be strictly equal` in public-http/consent tests, 'initSite seeds no authored pages', admin i18n-parity tests): plausibly a handful of root causes and/or Tovu↔linked-Jini branch skew. Not verified.
- Shard globs: /tmp/shards/N.txt file lists = 1: assistant+cli+contracts+src/__tests__; 2: platform; 3: server/inbound; 4: server minus inbound; 5-8: features/**, sorted file list split in four equal parts. Each ran `node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks`, TAP in /tmp/shardN.tap (not committed).

## Admin vitest (apps/admin, `--maxWorkers=2`): 824 files (14 failed), 13541 tests: 13511 pass / 28 fail / 2 skip
Failing files (all classified NEW pending check): composer-selected-skills, conversation-title, AssistantDock.chat-settings, consent-i18n, EmailTabs (4), trash-i18n, assistant-chats-dependencies, use-assistant-chats, admin-screens-manifest (`matches listAdminAgentScreens() exactly`), and others under i18n-parity (`has no untranslated copy`: AssistantDock, ai-assistant, visitor-tools, deployment, email, email-tabs, security), AG-UI stream translator (text delta / interruption / RUN_FINISHED / boundary markers), bubble-theme (dark/light accent palette), 404-run-terminalize.

## Desktop gates (apps/desktop `npm run --silent gates`, after `npm ci` + build:preload)
- tree-quiet PASS; typecheck PASS (4 tsconfigs); complexity PASS (178 files, 4 grandfathered, 0 new); js-backslide PASS
- tests FAIL: 1 test — `src/site-dir-store.test.ts:538` 'initSiteDir creates a complete blank site with the requested name through Tovu's actual CLI' — actual `[{id:'page-blog'}]`, expected `[]` (49 tests in file: 48 pass). NEW.
- coverage FAIL: refuses to report because the suite failed (`check-coverage: the test suite itself did not pass`) — no coverage numbers.

## Jini vitest (per package, `--maxWorkers=2 --minWorkers=1`; vitest 2.x needs both flags)
```
admin: files 208 tests 2803 pass 2803 fail 0 skip 0 suiteFail 0 filesErr 0
agent-plugins: files 92 tests 1437 pass 1435 fail 0 skip 2 suiteFail 0 filesErr 0
agent-runtime: files 173 tests 4164 pass 4163 fail 0 skip 1 suiteFail 0 filesErr 0
agentic: files 71 tests 1474 pass 1474 fail 0 skip 0 suiteFail 0 filesErr 0
analytics: files 7 tests 145 pass 145 fail 0 skip 0 suiteFail 0 filesErr 0
artifacts: files 14 tests 204 pass 204 fail 0 skip 0 suiteFail 0 filesErr 0
capability-providers: files 19 tests 221 pass 221 fail 0 skip 0 suiteFail 0 filesErr 0
chat: files 258 tests 3710 pass 3709 fail 0 skip 1 suiteFail 0 filesErr 0
cli: files 31 tests 574 pass 574 fail 0 skip 0 suiteFail 0 filesErr 0
cms: files 305 tests 4200 pass 4199 fail 1 skip 0 suiteFail 1 filesErr 0
   F ('cms/src/__tests__/subpath-isolation.contract.test.ts', 'keeps every CMS subpath isolated at runtime and installation', 'AssertionError: expected [ …(2) ] to deeply equal []')
commerce: files 2 tests 4 pass 4 fail 0 skip 0 suiteFail 0 filesErr 0
core: files 98 tests 1488 pass 1488 fail 0 skip 0 suiteFail 0 filesErr 0
daemon: files 153 tests 3562 pass 3562 fail 0 skip 0 suiteFail 0 filesErr 0
db: files 87 tests 698 pass 695 fail 3 skip 0 suiteFail 4 filesErr 0
   F ('db/src/__tests__/import-isolation.test.ts', 'database import isolation scans every production TypeScript file and confines optional dep', 'AssertionError: expected [ Array(1) ] to deeply equal []')
   F ('db/src/__tests__/loads-without-driver.test.ts', "@jini-ai/db in an install with no database driver present documents the vault's optional p", "AssertionError: expected '^0.6.10' to be '^0.5.6' // Object.is equality")
   F ('db/src/__tests__/loads-without-driver.test.ts', '@jini-ai/db in an install with no database driver present exports exactly the subpaths und', "AssertionError: expected [ 'core', 'kernel', …(16) ] to deeply equal [ 'core',
desktop-host: files 77 tests 663 pass 662 fail 0 skip 1 suiteFail 0 filesErr 0
devops: files 63 tests 1001 pass 1001 fail 0 skip 0 suiteFail 0 filesErr 0
diagnostics: files 45 tests 770 pass 770 fail 0 skip 0 suiteFail 0 filesErr 0
http-kit: files 25 tests 531 pass 531 fail 0 skip 0 suiteFail 0 filesErr 0
infra: files 11 tests 64 pass 64 fail 0 skip 0 suiteFail 0 filesErr 0
integrations: files 85 tests 1938 pass 1938 fail 0 skip 0 suiteFail 0 filesErr 0
mcp: files 71 tests 1338 pass 1338 fail 0 skip 0 suiteFail 0 filesErr 0
memory: files 15 tests 329 pass 329 fail 0 skip 0 suiteFail 0 filesErr 0
oauth: files 39 tests 705 pass 705 fail 0 skip 0 suiteFail 0 filesErr 0
platform: files 127 tests 2716 pass 2709 fail 1 skip 6 suiteFail 1 filesErr 0
   F ('platform/src/secrets/__tests__/exports.test.ts', 'retains published subpaths and declares adapter dependencies as optional peers', "AssertionError: expected { '@jini-ai/core': '^0.6.12' } to deeply equal { '@jini-ai/core': 
plugins: files 48 tests 692 pass 692 fail 0 skip 0 suiteFail 0 filesErr 0
protocol: files 9 tests 92 pass 92 fail 0 skip 0 suiteFail 0 filesErr 0
registry: files 18 tests 342 pass 342 fail 0 skip 0 suiteFail 0 filesErr 0
sandbox: files 16 tests 123 pass 123 fail 0 skip 0 suiteFail 0 filesErr 0
search: files 12 tests 319 pass 319 fail 0 skip 0 suiteFail 0 filesErr 0
server: files 23 tests 411 pass 410 fail 0 skip 1 suiteFail 0 filesErr 0
sidecar: files 15 tests 206 pass 204 fail 0 skip 2 suiteFail 0 filesErr 0
sqlite: files 4 tests 8 pass 8 fail 0 skip 0 suiteFail 0 filesErr 0
ui-kit: files 15 tests 199 pass 199 fail 0 skip 0 suiteFail 0 filesErr 0
ui: files 630 tests 8680 pass 8680 fail 0 skip 0 suiteFail 0 filesErr 0
user-management: files 87 tests 1100 pass 1100 fail 0 skip 0 suiteFail 0 filesErr 0
vibecoding: files 19 tests 301 pass 301 fail 0 skip 0 suiteFail 0 filesErr 0
```
Totals above: failures only in cms (known pre-existing: subpath-isolation), db (3 tests: import-isolation optional dep; loads-without-driver vault peer range '^0.6.10' vs expected '^0.5.6' and subpath list), platform (secrets/exports: optional-peer range `@jini-ai/core ^0.6.12` differs from expected). The db/platform ones look like version-pin drift (NEW; same family as the known cms one). Packages with no vitest files executed show 0 files (e.g. none listed).
agent-plugins: passed 1435/1437 in the plain run; under `--coverage` 1 test in `lifecycle/__tests__/unit/retire-bundled.unit.test.ts` failed once → possible flake (unconfirmed, not re-run).


## Typecheck (tsc --noEmit -p)

| tsconfig | errors | first 5 |
|---|---|---|
| tsconfig.json | 0 (exit 0) | – |
| tsconfig.tests.json | 344 (exit 2) | apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(858,17): error TS7022: 'tools' implicitly has type 'any' because it does not<br>apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(859,36): error TS7006: Parameter 'tool' implicitly has an 'any' type.<br>apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(860,35): error TS7006: Parameter 'tool' implicitly has an 'any' type.<br>apps/website/src/cli/__tests__/unit/export-l149.unit.test.ts(27,7): error TS2322: Type '(input: ExportSiteOptions) => Promise<{ outputDir: s<br>apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch-provider.unit.test.ts(374,61): error TS2339: Property 'val |
| apps/admin/tsconfig.json | 0 (exit 0) | – |
| apps/site-chat/tsconfig.json | 0 (exit 0) | – |
| apps/desktop/tsconfig.main.json | 0 (exit 0) | – |
| apps/desktop/tsconfig.preload.json | 0 (exit 0) | – |
| apps/desktop/tsconfig.renderer.json | 0 (exit 0) | – |
| apps/desktop/tsconfig.live-verify.json | 0 (exit 0) | – |
| packages/sdk/tsconfig.json | 0 (exit 0) | – |
| development/tsconfig.scripts.json | 0 (exit 0) | – |
| development/tsconfig.e2e.json | 0 (exit 0) | – |
| Jini: `pnpm -r --no-bail exec tsc --noEmit` | 0 `error TS` in 40 packages | only failure is examples/minimal-host (has no tsconfig → tsc prints help; harness artifact, not a type error) |
| apps/site-chat | run BEFORE site-chat `npm ci` — 0 errors reported; unverified-after-install | |

Note: `tsconfig.tests.json` (test files) has 344 errors, 232 TS2322, 44 TS2345; top files: server/inbound/public-http/http/site/__tests__/render.test.ts (46), features/post/__tests__/cover-image.test.ts (41), widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts (25), render-featured-image.unit.test.ts (20). Prod tsconfigs are clean.

## Complexity (eslint `complexity:10` + `sonarjs/cognitive-complexity:10`, non-test src; standalone config in /tmp, no repo edit; limits: counts function-level only, ignores inline disables, test files excluded)
### Tovu (apps/*/src + packages/*/src)
files linted 2927, parse errors 0; functions over CCN>10: 17; over cognitive>10: 12; distinct functions flagged: 24
| file:line | CCN | cognitive |
|---|---|---|
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:260 | 29 | 21 |
| apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts:41 | 13 | 20 |
| apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts:13 | ≤10 | 19 |
| apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts:180 | 16 | 13 |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:149 | 15 | 13 |
| apps/admin/src/features/consent/CookieConsent.tsx:125 | 14 | ≤10 |
| apps/website/src/features/consent/settings-link.ts:43 | 11 | 14 |
| apps/website/src/server/runtime/composition/deps.ts:1101 | 13 | ≤10 |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:121 | 12 | ≤10 |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts:220 | ≤10 | 12 |
| apps/website/src/server/runtime/composition/plugin-credential-cards.ts:49 | ≤10 | 12 |
| apps/admin/src/components/AssistantDock/AssistantDock.tsx:302 | 11 | ≤10 |
| apps/admin/src/features/consent/CookieConsent.tsx:91 | 11 | ≤10 |
| apps/site-chat/src/vanilla-tool-confirmation.ts:11 | 11 | ≤10 |
| apps/website/src/features/agent-plugins/mail-adapter-registry.ts:167 | ≤10 | 11 |
| apps/website/src/features/custom-credentials/credential-save-tool.ts:79 | 11 | ≤10 |
| apps/website/src/features/domain-dns/dns-changes.ts:95 | 11 | ≤10 |
| apps/website/src/features/email-templates/render.ts:125 | ≤10 | 11 |
| apps/website/src/features/identity/api-key-secret.ts:158 | 11 | ≤10 |
| apps/website/src/features/object-storage/registry.ts:169 | ≤10 | 11 |
| apps/website/src/features/post/html-plain-text.ts:21 | 11 | ≤10 |
| apps/website/src/platform/site-dir/read-site-dir.ts:59 | 11 | ≤10 |
| apps/website/src/server/inbound/admin-http/routes/members/request-magic-link.ts:62 | ≤10 | 11 |
| apps/website/src/server/runtime/composition/app.ts:1952 | 11 | ≤10 |
### Jini (packages/*/src)
files linted 3024, parse errors 0; functions over CCN>10: 14; over cognitive>10: 4; distinct functions flagged: 16
| file:line | CCN | cognitive |
|---|---|---|
| packages/chat/src/core/accepted-input.ts:171 | 11 | 17 |
| packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts:170 | ≤10 | 13 |
| packages/daemon/src/agent-executor/launch.ts:1168 | 11 | 13 |
| packages/chat/src/react/components/MessageRow.usage.ts:10 | 12 | ≤10 |
| packages/chat/src/react/tool-call-display.ts:74 | ≤10 | 12 |
| packages/daemon/src/agent-executor/events.ts:891 | 12 | ≤10 |
| packages/agent-plugins/src/lifecycle/automatic-use.ts:182 | 11 | ≤10 |
| packages/agentic/src/skills/install/install-service.ts:35 | 11 | ≤10 |
| packages/chat/src/core/question-answer.ts:29 | 11 | ≤10 |
| packages/chat/src/core/turn-usage.ts:82 | 11 | ≤10 |
| packages/daemon/src/agent-executor/launch.ts:531 | 11 | ≤10 |
| packages/daemon/src/agent-executor/live-session-state.ts:50 | 11 | ≤10 |
| packages/daemon/src/agent-executor/mcp-bridge.ts:519 | 11 | ≤10 |
| packages/daemon/src/http/message-relay.ts:20 | 11 | ≤10 |
| packages/oauth/src/discovery.ts:198 | 11 | ≤10 |
| packages/platform/src/mail/provider.ts:71 | 11 | ≤10 |

## Coverage
- Tovu: NOT RUN (see limits).
- Jini platform (vitest v8, json-summary): lines 100%, branches 99.88%, functions 99.73%, 0 files under 100% lines. (Limit: v8 coverage counts executed lines in files vitest loaded/included by src/**; says nothing about assertion quality.)
- Jini cms/agent-plugins/db: no summary written (cms and agent-plugins had a failing test; db failing; first run lacked reportOnFailure). chat: coverage run hit 420 s cap (exit 124). ui not attempted. Not a pass.

## Guard + baseline
- Jini `pnpm guard`: **104 violations** — HW3-module-state 40, L0-unlisted-package 16, R10-chatpane-public-surface 13, SI-domain 11, L1-layer-edge 11, R13-model-fallback-freshness 6, SI-dependency 4, N1-consumer-identity 3, HW2-vendor-adapter 3, N2-consumer-path 1, HW8-provider-url 1, HW1-env-default 1 (HW1: '18 total; 1 new'). Full list: run `pnpm guard` in Jini.
- Tovu `check:test-baseline`: script has no repo-wide baseline file (repo-test-failure-baseline.json is missing → FAIL 'baseline file not found'); against route-test-failure-baseline.json with the concatenated shard TAPs it lists unbaselined failures (expected given the above). Not meaningful.

## Stage B input — ranked
1. Test failures (NEW): see list below (website) + admin 28 + desktop 1 + Jini db 3 / platform 1.
2. Type errors: only `tsconfig.tests.json` (344). Prod clean in Tovu and Jini.
3. Complexity: Tovu 24 functions >10 (worst 0012_secrets_vault.ts:260 CCN 29/cog 21); Jini 16 functions.

## NEW failures (input for Stage B) — ranked: test failures > type errors > complexity

Classification is heuristic (name/error regex): ENV = postgres server / Chromium / psql missing; PRE-EXISTING = the three known names; everything else is NEW **until a human checks** — several clusters below look like ONE root cause (Tovu vs the linked Jini branch skew, or inherited state), not 100 bugs.


### web-1 assistant+cli+contracts+__tests__ — 18 NEW

- `apps/website/src/assistant/__tests__/content-read-post-filters.test.ts` — t02: content_read.content_post accepts optional query/status/fields from the list schema — _Expected values to be strictly equal:_
- `apps/website/src/assistant/__tests__/content-read-tool.test.ts` — content_read.menu publishes optional canonical id and documents its legacy selector — _"Cannot read properties of undefined (reading 'includes')"_
- `apps/website/src/assistant/__tests__/content-read-tool.test.ts` — the execution gate accepts canonical and legacy menu selectors and rejects conflicts before reading — _The input did not match the regular expression /Conflicting inputs 'menuId' and 'id'/. Input:_
- `apps/website/src/assistant/__tests__/credential-guidance.unit.test.ts` — daemon and BYOK pin the same credential-card policy — _Expected values to be strictly equal:_
- `apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts` — complete production catalog classifies every reader and exercises every scoped read on B — _66 cross-site tools, 82 EXCLUDED tools; unclassified/overlapping domains: visitor-tools: visitor_tools_list, visitor-tools: visitor_tool_sav_
- `apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts` — beginConnect persists the discovered protected resource (typed endpoints) — _"provider 'connection-higgs' declares no supported grants"_
- `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` — every surfaceExchanges.open(...) call names a toolId constant this scan can resolve — _Expected values to be strictly deep-equal:_
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts` — deployment_execute_static_publish waits for one human approval over HTTP before publishing — _expected a real publish to have happened: {"published":false,"cancelled":false,"code":"CONSENT_REVIEW_REQUIRED","error":"Review cookie conse_
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts` — SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently — _Expected values to be strictly deep-equal:_
- `apps/website/src/assistant/__tests__/tool-input-chat-regressions.test.ts` — raw page writers leave slug resolution to the shared host adapter — _The input did not match the regular expression /Unknown input 'slug'.*Declared inputs:.*id/. Input:_
- `apps/website/src/assistant/__tests__/tool-registrations.members.test.ts` — members_request_magic_link: delivers {delivered:true} for a valid email and sends mail — _'mail must contain a sign-in URL'_
- `apps/website/src/assistant/__tests__/tool-registrations.members.test.ts` — members_request_magic_link: a string redirectPath in the input is threaded through to the write serv — _'mail must contain a sign-in URL'_
- `apps/website/src/assistant/__tests__/tool-search-keywords.operator-requests.test.ts` — every operator request with a tool finds it in the top 3 of search_tools — _Expected values to be strictly deep-equal:_
- `apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts` — a stale uncertain executor still finalizes with saved work — _Expected values to be strictly equal:_
- `apps/website/src/cli/__tests__/integration/init-storage.integration.test.ts` — init --storage pglite: the data dir is at head with the template seeded, no SQLite files, lock relea — _a new PGlite site stays blank after its first boot_
- `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` — tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI,  — _introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help_
- `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` — tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions — _Expected values to be strictly deep-equal:_
- `apps/website/src/contracts/core/__tests__/integration/child-process-coverage-env-wiring.test.ts` — apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts: every child spawn feeds  — _'apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts must import the real coverage helper'_

### web-2 platform — 8 NEW

- `apps/website/src/platform/db/__tests__/parity/vault-boundary-parity.test.ts` — a transfer copies the same tables as before minus the retired ones — _Expected values to be strictly deep-equal:_
- `apps/website/src/platform/db/__tests__/parity/vault-boundary-parity.test.ts` — vault boundary parity [sqlite] — _'1 subtest failed'_
- `apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts` — recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails — _Expected values to be strictly equal:_
- `apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` — no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) — _New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead._
- `apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts` — applies on an empty database and matches schema.postgres.ts at head — _Expected values to be strictly deep-equal:_
- `apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts` — 0000_legacy_baseline on Postgres (PGlite) — _'1 subtest failed'_
- `apps/website/src/platform/db/migrations/__tests__/search-index-retired-step.test.ts` — [sqlite] 0028 is the head, pinned, and creates its table once — _0028 is the head_
- `apps/website/src/platform/db/migrations/__tests__/search-index-retired-step.test.ts` — [pglite] 0028 is the head, pinned, and creates its table once — _0028 is the head_

### web-3 server/inbound — 21 NEW

- `apps/website/src/server/inbound/assistant/__tests__/message-attachment-delivery.unit.test.ts` — the daemon exchanges both current-message refs for exact pixels and native CLI image paths — _'the attachments should be accepted'_
- `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` — handlebars-worker.ts loads no database, blob-store or agent packages — _'handlebars-worker.ts loaded 155 rendering modules (budget 150)'_
- `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` — liquid-worker.ts loads no database, blob-store or agent packages — _'liquid-worker.ts loaded 113 rendering modules (budget 110)'_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts` — live HTML is gated and static export returns 409 without changing the live delivery mode — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts` — cached OFF cannot bypass consent after publishing ON when the next policy read fails — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts` — live defaults show consent; exports omit defaults, honor owner ON/OFF and block published ON — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` — static page route: a real page renders with Cache-Control: no-store, no session needed — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` — partial route: a real partial renders no-store; an unknown partial and a non-static theme are refuse — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` — templated route: 'entry' renders as the post route, no-store — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` — templated route: home, products and product templates each render with their own route context, no-s — _home_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts` — the transfer catalog loses exactly the six commerce tables and gains the named later columns — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts` — the manifest classifies every other table's columns as before — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts` — catalogs against the pre-strip tree (4570fce9d) — _'2 subtests failed'_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts` — integration: GET / 500s with a generic 'Site error' when an unexpected exception is thrown — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts` — integration: GET /:slug places the terms block right after the entry's content, inside the article a — _<html><meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39; &#39;unsafe-inline&#39;; object-src &#39;none&#39;; styl_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts` — GET /: a failing lookup of the page claiming / answers the generic 500 — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts` — GET /: a members-only page claiming / is not shown to an anonymous visitor, who gets the default hom — _Expected values to be strictly equal:_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts` — GET /_more/1/12?…: a see-more URL with a form-result query answers the batch as a private response — _'control: a plain batch is not private'_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts` — GET /:slug and / -- an unknown member cookie cannot expose gated content — _invalid sessions must get the anonymous denial_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts` — GET /:slug and / -- an expired member cookie cannot expose gated content — _invalid sessions must get the anonymous denial_
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts` — GET / 500s with a generic 'Site error' when an unexpected exception is thrown — _the exact bare fallback body, not merely a 500 status_

### web-4 server (non-inbound) — INCOMPLETE — 22 NEW

- `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — a pending Ask card answered: preserves one card and the same turn across the default probe window — _Expected values to be strictly equal:_
- `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — a pending Ask card dead: preserves one card and the same turn across the default probe window — _'Invalid state: Controller is already closed'_
- `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — a quiet stream without live proof waits five minutes, finalizes once and keeps its saved text — _'test timed out after 90000ms'_
- `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — a stalled boot status probe is bounded before adopting an uncertain attempt — _'test timed out after 90000ms'_
- `apps/website/src/server/__tests__/assistant-chats-routes.test.ts` — creates, lists, renames and deletes a conversation — _Expected values to be strictly equal:_
- `apps/website/src/server/__tests__/assistant-chats-routes.test.ts` — names an untitled conversation from its first user message — _Expected values to be strictly equal:_
- `apps/website/src/server/__tests__/assistant-chats-routes.test.ts` — an unusable first message leaves the chat namable by the next one — _Expected values to be strictly equal:_
- `apps/website/src/server/__tests__/assistant-chats-skill-title.unit.test.ts` — skill-only first user message uses its name, while user prose still uses the normal title heuristic — _Expected values to be strictly equal:_
- `apps/website/src/server/__tests__/identity-routes.test.ts` — REQ-07: AUTH_ME returns the owner principal with '*' in its effective permission set — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts` — an outbox drain in the agent daemon no longer swallows events: both the daemon's own event and the s — _the daemon's drain claimed these rows and published them to its own subscriber-less bus, so the serving process never saw them_
- `apps/website/src/server/__tests__/integration/credentials-real-composition.unrun.integration.test.ts` — [unrun] source-control credentials [sqlite]: create → rename keeps the sealed token → a duplicate la — _'expected HTTP 201, got 400: {"error":"VALIDATION","detail":"connection.providerId must be one of: "}'_
- `apps/website/src/server/__tests__/integration/credentials-real-composition.unrun.integration.test.ts` — [unrun] source-control credentials [pglite]: create → rename keeps the sealed token → a duplicate la — _'expected HTTP 201, got 400: {"error":"VALIDATION","detail":"connection.providerId must be one of: "}'_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [sqlite]: request mails one link, complete activates the member and persis — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [sqlite]: a link is single-use, and an unknown token is refused — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [sqlite]: known, unknown and disabled emails get byte-identical responses; — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [sqlite]: the sixth request for one email within the hour is 429 with Retr — _limit@example.com_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [sqlite]: a signed-in member never gets admin access, even holding the "*" — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [pglite]: request mails one link, complete activates the member and persis — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [pglite]: a link is single-use, and an unknown token is refused — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [pglite]: known, unknown and disabled emails get byte-identical responses; — _Expected values to be strictly deep-equal:_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [pglite]: the sixth request for one email within the hour is 429 with Retr — _limit@example.com_
- `apps/website/src/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` — [unrun] member magic link [pglite]: a signed-in member never gets admin access, even holding the "*" — _Expected values to be strictly deep-equal:_

### web-5 features (1st quarter of sorted list) — 4 NEW

- `apps/website/src/features/__tests__/features-no-server-imports.boundary.test.ts` — no production file under src/features/ imports src/server/, Express, or the admin app — _src/features/INFO.md: features must not import server/framework code. Offending edges:_
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts` — the package packs through the real installer's packer, and carries no credential material — _Expected values to be strictly deep-equal:_
- `apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts` — every core table with a secret-shaped column is excluded from the copy — _Expected values to be strictly deep-equal:_
- `apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts` — real core tree has only reviewed pattern exceptions, each with its exact current total — _Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs:_

### web-6 features (2nd) — 2 NEW

- `apps/website/src/features/identity/__tests__/wiring.test.ts` — createInMemoryIdentityRouteDeps: identityReady grants pages.edit_html to the built-in admin policy a — _the owner policy stays exactly its seeded wildcard_
- `apps/website/src/features/identity/__tests__/wiring.test.ts` — createSqliteIdentityRouteDeps: identityReady grants pages.edit_html to admin in a pre-theme.edit wor — _the owner policy stays exactly its seeded wildcard_

### web-8 features (4th) — 6 NEW

- `apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts` — fetch_published_page: renders a real route of this site through the real composition root — _The expression evaluated to a falsy value:_
- `apps/website/src/features/trash/__tests__/tool-registrations.test.ts` — both enums are exactly the bespoke permission-map kinds plus every registry kind — no more, no fewer — _Expected values to be strictly deep-equal:_
- `apps/website/src/features/webhooks/__tests__/seal-aad-invariant.test.ts` — REGRESSION: every real SecretSealerPort.seal() call site under apps/website/src supplies aad today — _expected zero seal() call sites without aad, got: [_
- `apps/website/src/features/webhooks/__tests__/seal-aad-invariant.test.ts` — the CLI exits successfully and prints OK when the real repository has no seal violations — _check:seal-aad — 1 .seal() call site(s) do not verifiably supply aad:_
- `apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts` — buildWidgetsDeps: maps every field to its write-path name, by identity, including the idGen -> ids r — _Expected "actual" to be reference-equal to "expected":_
- `apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts` — buildWidgetHostPorts: published-post lookups use the bound postRepo, and fall back to the caller's r — _Expected values to be strictly equal:_

### agent-plugins+packages/sdk+development/scripts+eslint-rules (site-chat counted separately) — 12 NEW

- `content/agent-plugins/s3-compatible/__tests__/credential-card.test.mjs` — non-secret connection fields are declared explicitly — _"Cannot read properties of undefined (reading 'map')"_
- `content/agent-plugins/s3-compatible/__tests__/env-declaration.test.mjs` — the bundled mapping is available without provider activation and preserves optional fields — _"Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'."_
- `content/agent-plugins/s3-compatible/__tests__/env-declaration.test.mjs` — every missing-variable combination preserves the original error bytes and ordering synchronously — _Expected values to be strictly deep-equal:_
- `content/agent-plugins/s3-compatible/__tests__/media-store.integration.test.mjs` — env-selected S3 media store end to end: uploadMedia() writes to S3-compatible storage, and the real  — _"Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'."_
- `content/agent-plugins/s3-compatible/__tests__/media-store.integration.test.mjs` — env-selected S3 media store exports one CLIENT span per object call through the host's wrapFetch: st — _"Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'."_
- `content/agent-plugins/s3-compatible/__tests__/media-store.integration.test.mjs` — env-selected S3 media store records a transport failure on its span by error type — _"Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'."_
- `development/scripts/__tests__/dead-path-sweep.test.ts` — dead-path sweep: no path reference outside the known-broken register resolves to nothing — _a path reference under development/scripts or the db tooling points at a file that does not exist_
- `development/scripts/__tests__/dead-path-sweep.test.ts` — generated coverage artifacts are not reported as dead paths — _"development/coverage/lcov.unit.info's parent directory should exist"_
- `development/scripts/__tests__/openapi-contract-fixtures.test.ts` — OpenAPI contract: all 29 original mismatches reach the documented condition with real HTTP inputs — _'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and de_
- `development/scripts/__tests__/repair-site.test.ts` — repair-site.ts: dry run (no --apply) prints the plan and writes NOTHING — _Expected values to be strictly equal:_
- `development/scripts/__tests__/repair-site.test.ts` — repair-site.ts: --apply writes real, readable marker files — _expected exit 0, got output:_
- `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` — SDK external type contracts are declared package dependencies for standalone consumers — _Expected values to be strictly equal:_
STAGE A DONE 08:51Z — wall ≈ 2h12m (06:41Z start); tokens ≈ 0.15M of 1.8M cap (no subagents).
