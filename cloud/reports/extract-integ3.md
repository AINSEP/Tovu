# EXTRACT-INTEG3

Status: complete (finished by EXTRACT-INTEG3-B). This report supersedes EXTRACT-INTEG2's claim that its extraction starting pin proved 80 failures prior. The comparison baseline for this job is cloud/combine: Tovu `7cf9658e5`, Jini `e1b1bdbd6`. Work continues on cloud/extract-integ from the requested Tovu `d3dc793299f5cb7a331cad8fe5592efee0c1b56d` and Jini `4de40e0bb766b56118d0335e2c464d679340070d`.

Conservative accounting start: 2026-11-09 21:20 UTC; deadline 23:20 UTC (two hours). Neither main nor cloud/combine is merged or modified. The private brief is not committed. Builds and probes use separate detached combine checkouts in the same container; the existing branch is preserved in each delivery repository.

## Unknowns and compatibility

The six alternating fresh-process serve measurements, boot to first HTTP response, were:

| Trial | Combine serve | Tip serve | Combine init | Tip init |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8.135 s | 8.177 s | 16.100 s | 11.955 s |
| 2 | 10.941 s | 7.742 s | 6.444 s | 6.410 s |
| 3 | 8.120 s | 7.433 s | 7.202 s | 5.990 s |

Every response was HTTP 200. Median serve: combine 8.135 s, tip 7.742 s (tip 4.83% faster); mean: combine 9.065 s, tip 7.784 s (tip 14.13% faster). Each run initializes a fresh genuine site and terminates its server before the next run. Both sides use Node 24.22.1, the source CLI through tsx, the same installed external dependencies, their own built Jini checkout and composed plugin payloads, and the same HTTP polling method. No tests/builds/type-checks ran during timing. Runs alternate combine then tip; observed one-minute load declined from 3.15 to 1.86. The measurements show no >15% extraction boot regression in this container. Fresh process does not mean dropped kernel page cache.

The unchanged preview-switcher live-server case passed at the tip after setup repair, then its whole nine-case file passed. No failing assertion was reproduced at the tip. The combine whole-file run failed that live-server case at its unchanged revision-count assertion, `81 !== 69`, line 148; background boot writes can race that assertion. Earlier tip attempts failed before assertions on missing/stale build artifacts, and are setup evidence, not product regressions.

The real production `readInstalledMcpServers` path read on-disk legacy plugin.json/mcp.json on both sides. The old `extensions.tovu`, `tovuAuthMode`, `tovuDefaultTools` and explicit namespace `tovu` preserved identity `tovu/legacy`, OAuth mode, allow/write grants and reviewed read names. The normalized returned projections were identical. The tip emits a deprecation warning; its parsed output fields are portable. Legacy fixture inputs in the operator-read-only suite remain old-form, so that suite still exercises compatibility.

The enable test's hang was traced before editing it. The old names were supplied directly as an already-parsed server, bypassing plugin.json's compatibility reader. Preview and handler reject with ToolInputError (configured-separately refusal), before emitting any surface. `answerCard` catches/suppresses the handler outcome rejection and awaits only its unresolved card promise. The diagnostic traced zero emitted surfaces with the original seeded-off activation. Only this pre-parsed fixture's two keys were updated; the helper and all assertions remain unchanged. The whole file now passes.

Jini plugin-identity: combine passes 13/13; tip passes 10/13. The three new failures are the exact warning/event-array expectations for parsed shared identity, interrupted prune, and advisory keyword coercion. Extraction adds the legacy metadata warning (and plugin identity on that event); identity/provides and accepted installation still succeed. These are new diagnostic expectation drift, not prior failures. EXTRACT-INTEG3-B updated the three expectations under a coordinator allowance; see below.

## Findings F2/F4

F2: plugin-catalog release tooling now contains the small namespace lookup it uses; it no longer imports agent-plugins/src. Catalog generation before and after the edit, against the same rebuilt artifacts, was byte-identical: SHA-256 `b86fcee83dcd5d29a31f3eefb0a353da9b05519dee99f3b56f26f192611728a1`. The 65 owning catalog tests pass. The tracked catalog itself was restored byte-for-byte; regenerated build artifacts differ from the originally tracked digest catalog, which is not included in this change. Catalog has no build script.

F4: exactly seven authorized comment lines changed in management.ts (five), install.ts (one), source.ts (one). TypeScript transpilation with comments removed yields identical executable JavaScript for all three files. F5 remains unchanged. No guide, card, tool-metadata golden, saved-data fixture, package manifest, lockfile or guard baseline changed.

## Authorized test edits

| Group | File(s) | Exact purpose |
| --- | --- | --- |
| A | assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts | Expect parsed defaultTools; preserve the legacy input fixture. |
| A | features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts | Two pre-parsed fixture keys after tracing the no-card wait. |
| A | server/runtime/composition/__tests__/plugin-host.integration.test.ts | Bundled agent identity namespace jini; runtime-plugin namespace stays tovu. |
| A | features/site-guide/__tests__/plugin-contributions.test.ts | Current bundled agent extension key. |
| A | server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts | Agent-face extension key only; provider runtime extension stays tovu. |
| A | content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs | Explicit namespace jini for the six cases; publisher IDs stay tovu/google-login. |
| A | content/agent-plugin-overlays/composio/__tests__/connection-contract.test.mjs | Current raw authMode key only. Its following guide assertion remains unchanged and outside the edit allowance. |
| B | features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts | Pin 0.6.3 in the manifest and three seed cases. |
| C | features/agent-plugins/__tests__/unit/bundled-{composio-package,github-actions-ops,github-package,supabase-package}.unit.test.ts | Nine specified cases retain their ordering, routing, backup, SQL/approval and connection checks using the guides' existing neutral words. |
| C | content/agent-plugin-overlays/{railway,render}/__tests__/credential-card.test.mjs | Existing guidance must direct deployment through tools and then start a deployment. Guides unchanged. |
| E | content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs | Test helper passes the same apiConnectionCallbackFieldRules as Tovu's host. The sole production parser call, features/api-connections/contribution.ts:73, already passes it. |
| F | assistant/__tests__/mcp-ui-allowlist-completeness.test.ts | One named agent_plugin_connect carve-out beside the existing Jini-owned exchanges. |
| G | assistant/__tests__/approval-single-path.test.ts | Allow the existing features/custom-credentials/tool-registrations.ts host transport only. |
| H | content/agent-plugin-overlays/higgsfield-media/__tests__/higgsfield-media-overlay.test.mjs | Extend the sensor's existing exception with generate_image, generate_video, job_status, in_progress. |
| I | cloud/reports/raw/extract-s4/s40b-a7-red.txt | Replace exactly four fake token-shaped strings with [REDACTED-TEST-VALUE]; scanner unchanged and values not copied. |
| Broad types | features/api-connections/__tests__/surface-connections.host-port.unit.test.ts | Supply the record port's required staged:null; status/service fixtures and assertions stay unchanged. |
| Broad types | server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts | Two already-parsed server keys become authMode/tokenAuth; assertions unchanged. |

Website-relative paths in this table are under apps/website/src. Every other assertion is preserved. Group D is decided: the Google card stays neutral and its assertion was updated in Tovu `b8f508e4`.

The Group G binding is the same `requireHumanConfirm({ctx,surfaces,spec:description},options)` transport used by combine's approvalToolHandler. Both use createApprovalHandler, ask:true, the same post-consent permission/abort checks, and identical decline/expired/abandoned outcomes. The unchanged make-request-delete-confirmation suite passes 23/23 on both sides.

## EXTRACT-INTEG3-B: remaining edits

Start pair: Tovu `b8f508e40`, Jini `7fff92c32`, branch cloud/extract-integ in both. Baseline: cloud/combine, Tovu `7cf9658e5`, Jini `e1b1bdbd6`. Node 24.22.2, Jini linked into Tovu.

| Group | File | Change |
| --- | --- | --- |
| Jini identity | Jini `packages/agent-plugins/src/lifecycle/__tests__/unit/plugin-identity.unit.test.ts` | Three cases now expect the legacy-metadata deprecation warning: once in the parse warnings of the shared-identity case, two `agent-plugin-identity-warning` events (with `pluginId: 'github'`, one per install) ahead of the prune warning, and after the keyword warning. The expected text is the package's own exported `legacyAgentPluginMetadataWarning`. Nothing else changed. 13/13 pass. |
| A + guide | `content/agent-plugin-overlays/composio/__tests__/connection-contract.test.mjs` | `/agent_plugin_connect/` becomes the guide's current neutral sign-in step, "**Sign in.** Connect the account. It provisions the declared connection, shows the secure browser sign-in card". It still proves sign-in goes through the declared connection and its card. Guide unchanged. 1/1 pass. |
| E | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | `createApiConnectionService` now requires `oauth` since Jini `f1e53648` (extraction). The helper passes `apiConnectionOAuthCapabilities` from `apps/website/src/features/api-connections/oauth-bindings.ts`, the same object Tovu's host passes (`host-bindings.ts:67`, `browser-binding.ts:15`). 29/29 pass. |
| H | `content/agent-plugin-overlays/higgsfield-media/__tests__/higgsfield-media-overlay.test.mjs` | Not edited. See "Needs a coordinator ruling". |

The deprecation warning is log-only. Jini returns it in parse `warnings`, and `installed-package-index.ts:111` sends it as an `agent-plugin-identity-warning` event. Tovu's only `onEvent` (`features/agent-plugins/lifecycle.ts:104`) dedupes it and calls `console.warn`. Tovu's MCP-config reader logs config warnings with `console.warn` (`capability-projection.ts`). No Tovu or Jini tool result, card or prompt reads manifest parse warnings. The `warnings` field in `management.ts:241` carries only the set-enabled result's own warnings, not manifest warnings.

## Needs a coordinator ruling

Higgsfield sensor, case "every snake_case tool the overlay cites is a served native tool or a per-plugin tool": the tip reports `GUIDANCE.md: search_tools` and `GUIDANCE.md: describe_tool`. These are Tovu host meta-tool names, not the remote Higgsfield server's tools. The BYOK surface's `search_tools` → `describe_tool` → `execute_delegated_tool` lives in `apps/website/src/server/runtime/composition/modules/assistant-byok.ts:146,700,742,793`. Per the brief, neither the test nor the guide was edited. Guide lines:

- `content/agent-plugin-overlays/higgsfield-media/GUIDANCE.md:155-156`: "1. **You will never see it.** It goes to the host's log. A refused tool is not registered, so `search_tools` cannot find it and `describe_tool` cannot describe it."
- `GUIDANCE.md:185`: "**Symptom:** `search_tools` finds no `mcp__higgsfield__generate_image`; `describe_tool` cannot describe it."

The case passes on combine (release-check TAP). It is NEW, caused by extraction: `a7e7f349e` moved this text into GUIDANCE.md, which the sensor reads.

## Broad test types (item 2)

At the tip with Jini linked, `npm run typecheck:tests` exits 2 with exactly 10 errors. These are the same 10 errors (same file, line, column and code) that combine's release-check run recorded (`cloud/reports/raw/tovu-static-typecheck-tests.txt` on cloud/release-check). Each is in a file that `c51b8e071` changes. `c51b8e071` is an ancestor of cloud/combine and not of this branch. Nothing was cherry-picked; the errors resolve at merge.

| # | Error | c51b8e071 change |
| ---: | --- | --- |
| 1-8 | `cli/__tests__/integration/import-local.integration.test.ts` (27,16) (28,32) (30,40) (31,40) (33,35) (35,13) (35,119) (45,30): TS18047 `'result' is possibly 'null'` | `assert.ok(result, ...)` after both `runImportLocalCommand` calls |
| 9 | `features/plugin-runtime/__tests__/unit/set-enabled-confirmation-ui.unit.test.ts(41,266)`: TS2353 `'scope' does not exist in type 'Omit<AccessApprovalResou...` | drops the inner resource `scope` |
| 10 | `server/inbound/admin-http/routes/system/site-imports.integration.test.ts(70,9)`: TS2741 `Property 'tidy' is missing` | adds `tidy` to the fake backend |

INTEG2 counted 13 on its pin. The other 3 were the extraction fixtures INTEG3 fixed (surface-connections staged:null and token-boot-order keys).

## Final gate at the tip

Tips at gate time: Tovu `ab1b01ab` (raw outputs and this report follow in the delivery commit), Jini `d9fa89a2`. Raw summaries: `cloud/reports/raw/extract-integ3b/`.

| Gate | Result |
| --- | --- |
| 39 Tovu test files: the 37 files of the 81 outcomes, plus INTEG3's two other edited files (node:test, `--test-concurrency=1`, one file at a time) | 19 files fully green. The remaining failing cases are listed below, each against combine. |
| Jini plugin-identity (vitest `--maxWorkers=2 --minWorkers=1`) | 13/13 pass |
| Jini `pnpm guard` | Exit 1. R2 is gone. R10 (ChatPane `Icon`) remains, as on combine. A second violation, R13, is from this container: the Claude Code model-picker cache here lists `claude-fable-5-2` (17 live ids; combine's container listed 16). `fallbackModels` is identical between combine and the tip. Environment, not this branch. |
| Jini `pnpm check:cross-package` | Not completed here. XP1/XP2 report nothing. All 70 XP3 lines are `absolute JINI_DECLARATION_BASELINE_DIR required`. XP3 needs a declaration snapshot built from a separate clean checkout at base `35c4961af`, which did not fit the one-hour cap. Not a pass. |
| Package builds | Jini `pnpm --no-bail -r build` exit 0 at `7fff92c3`. The later Jini change is a test file only. Tovu `@tovu/sdk` built. |
| Tovu production type-check, Jini linked (`npm run typecheck`, includes e2e) | Exit 0, 0 errors |
| Tovu broad test types | 10 errors, all fixed on combine by `c51b8e071` (above) |
| Tool-metadata golden | `apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json` SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`, unchanged |
| Desktop preload build | Not run: `electron` is not installed in this container (`apps/desktop` has no separate install here). The two desktop files ran without it. Their failure is the same `ReferenceError: stopRunningImports is not defined` recorded on combine. |

No full suite ran. Nothing here needed PostgreSQL or IPv6. No test or server process is left running. The temporary combine worktree was removed.

### Corrected table: all 81 outcomes

Combine evidence: "release-check TAP" means the eight web shard TAP streams and the desktop output committed on cloud/release-check, from combine `f4b2d1531`, matched by exact case title. "Detached 7cf9658e5 checkout" means a run today in a detached worktree at combine `7cf9658e5`. It shared this container's root `node_modules`, so it saw the linked tip Jini.

| # | File (website-relative under apps/website/src where shortened) | Case | Group | Tip result | Combine |
| ---: | --- | --- | --- | --- | --- |
| 1 | `assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts` | read defaults match both normalized server identity and exact URL, never only URL | A | pass | passes |
| 2 | `assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts` | each roster read loads the current manifest; URL-only servers never receive read metadata | A | pass | passes |
| 3 | `assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts` | a read-only manifest does not enable the plugin or change grants on first sign-in | A | pass | passes |
| 4 | `assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` | every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | prior | FAIL: Expected values to be strictly deep-equal: | fails (release-check TAP) |
| 5 | `assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` | every allowlisted id opens an exchange or is a named carve-out | F | pass | passes |
| 6 | `features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts` | SKILL.md names the meta-tools the flow uses and the connection's real tool prefix | C | pass | passes |
| 7 | `features/agent-plugins/__tests__/unit/bundled-github-actions-ops.unit.test.ts` | the github skill routes source control/backup apart from deploying with GitHub Actions | C | pass | passes |
| 8 | `features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts` | SKILL.md distinguishes pushing app source from committing a rendered static export | C | pass | passes |
| 9 | `features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts` | site-backup.md: a site backup is plan-then-push, private-only, and never forced | C | pass | passes |
| 10 | `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts` | plugin.json's description tells the model to start with agent_plugin_connect | C | pass | passes |
| 11 | `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts` | SKILL.md calls agent_plugin_connect before any Supabase tool | C | pass | passes |
| 12 | `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts` | SKILL.md drops the old setup: no Settings trip, no restart, no chat-pasted token, no project scoping | C | pass | passes |
| 13 | `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts` | failure-modes.md covers every failure the plan lists | C | pass | passes |
| 14 | `features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts` | SKILL.md (G3): small database changes go through execute_sql, the SQL is shown first, and the confirm card is  | C | pass | passes |
| 15 | `features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts` | bundled ui-ux-design has a valid manifest and is on the seeded-enabled list | B | pass | passes |
| 16 | `features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts` | ui-ux-design seeds correctly for new site | B | pass | passes |
| 17 | `features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts` | ui-ux-design seeds correctly for untouched disabled seed | B | pass | passes |
| 18 | `features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts` | ui-ux-design seeds correctly for operator disabled | B | pass | passes |
| 19 | `features/api-connections/__tests__/vendor-neutrality.test.ts` | no generic seam file names the first provider | prior | FAIL: Expected values to be strictly deep-equal: | fails (release-check TAP) |
| 20 | `features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts` | a declined enable remains a choice when a seeded-off plugin signs in later | A | pass | passes |
| 21 | `server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts` | ../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires  | prior | FAIL: ../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call | fails (release-check TAP) |
| 22 | `server/runtime/composition/__tests__/plugin-host.integration.test.ts` | every bundled agent and site package declares a distinct publisher identity and discovery terms | A | pass | passes |
| 23 | `server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` | a project store that can't open (EACCES on its folder): the site boots, warns, and a settings save is refused, | prior | FAIL:  | fails (release-check TAP) |
| 24 | `content/agent-plugin-overlays/railway/__tests__/credential-card.test.mjs` | Railway guidance opens its own card, deploys only through the tools and never offers an unasked replacement | C | pass | passes |
| 25 | `content/agent-plugin-overlays/render/__tests__/credential-card.test.mjs` | Render guidance opens its own card, deploys only through the tools and never offers an unasked replacement | C | pass | passes |
| 26 | `apps/desktop/src/main-agent-runtime-wiring.test.ts` | quit waits for owned runtime disposal even without sites and disposes once across repeated quits | prior | FAIL: stopRunningImports is not defined | fails (release-check TAP) |
| 27 | `apps/desktop/src/main-shutdown-wiring.test.ts` | before-quit waits on in-flight teardowns, not only on openSites | prior | FAIL: stopRunningImports is not defined | fails (release-check TAP) |
| 28 | `apps/desktop/src/main-shutdown-wiring.test.ts` | Quit during a card Stop waits for its tracked teardown after openSites becomes empty | prior | FAIL: stopRunningImports is not defined | fails (release-check TAP) |
| 29 | `assistant/__tests__/approval-single-path.test.ts` | human approval asking stays in the shared owner and its named host transports | G | pass | passes |
| 30 | `cli/__tests__/integration/adopt-command.integration.test.ts` | the whole point: a marker-less but working site directory is REFUSED by serve, and tovu adopt is what makes it | unknown (INTEG2) | pass | passes |
| 31 | `features/site-guide/__tests__/plugin-contributions.test.ts` | How Tovu works uses stable manifest identity and valid main topics with real workflow gates | A | pass | passes |
| 32 | `features/theme/__tests__/preview-switcher.integration.test.ts` | live server chooses per request; cookie persists, reset clears, canonical and no-store hold; disabled is inert | unknown (INTEG2) | FAIL: 81 !== 69 | passes in release-check TAP; INTEG3 saw the same `81 !== 69` (line 148) on a combine whole-file run |
| 33 | `features/webhooks/__tests__/secret-scan-guard.test.ts` | REGRESSION: the real tracked repo has zero un-allowlisted credential-shaped strings today | I | pass | passes |
| 34 | `platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` | no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) | prior | FAIL: New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead. | fails (release-check TAP) |
| 35 | `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` | handlebars-worker.ts source graph contains no @jini-ai package roots, including deferred imports | prior | FAIL: handlebars-worker.ts names @jini-ai root barrels; use narrow export subpaths: | fails (release-check TAP) |
| 36 | `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` | handlebars-worker.ts loads no database, blob-store or agent packages | prior | FAIL: handlebars-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: | fails (release-check TAP) |
| 37 | `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` | liquid-worker.ts source graph contains no @jini-ai package roots, including deferred imports | prior | FAIL: liquid-worker.ts names @jini-ai root barrels; use narrow export subpaths: | fails (release-check TAP) |
| 38 | `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` | liquid-worker.ts loads no database, blob-store or agent packages | prior | FAIL: liquid-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: | fails (release-check TAP) |
| 39 | `server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts` | AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site renders Tovu D | prior | FAIL: Express request did not finish | fails (release-check TAP) |
| 40 | `server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts` | the agent face (@jini-ai/agent-plugins/charts-recharts) drives this runtime source | A | pass | passes |
| 41 | `server/runtime/composition/__tests__/storage-secret.unit.test.ts` | new-site sealing prepares its identified key file and the default reader reopens it | prior | FAIL: /home/user/Tovu/apps/website/src/features/webhooks/keyring.env.ts:149 | fails (release-check TAP) |
| 42 | `content/agent-plugin-overlays/composio/__tests__/connection-contract.test.mjs` | the hosted connection supports browser sign-in without inline credentials | A + guide | pass | passes |
| 43 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: the bundled contract pins the host link, fixed label, consent and static fallback | A | pass | passes |
| 44 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: each variant passes the real fragment policy with native keyboard navigation and local assets | A | pass | passes |
| 45 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: disabled, unconfigured and foreign-owner providers cannot render a button | A | pass | passes |
| 46 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: arbitrary variant, label and URL props are rejected, including a mixed valid/invalid batch | A | pass | passes |
| 47 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: static mode keeps authored fallback and bundles deduplicated CSS and G artwork references | A | pass | passes |
| 48 | `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` | U1: every bundled public export template passes the single CMS fragment validator | A | pass | passes |
| 49 | `content/agent-plugin-overlays/google-workspace/__tests__/credential-card.test.mjs` | Google sign-in card matches the existing OAuth connection and its selected-file permission | D | pass | passes |
| 50 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | vertical slice: hosted sign-in asks for drive.file only, proves PKCE, and the account_info tool names the acco | E | pass | passes |
| 51 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | PKCE: the verifier sent to the token endpoint matches the S256 challenge of the same attempt (the fake refuses | E | pass | passes |
| 52 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | state: a callback whose state was never issued is refused as invalid-attempt and no code is exchanged | E | pass | passes |
| 53 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | state: a replayed callback is refused as invalid-attempt (consume once) | E | pass | passes |
| 54 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | consent denial: access-denied, nothing exchanged or stored, still not connected | E | pass | passes |
| 55 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | partial scopes: a grant without drive.file is refused as scope-not-granted and no token is served | E | pass | passes |
| 56 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | missing refresh token: a hosted same-account reconnect that omits one keeps the stored refresh token | E | pass | passes |
| 57 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | refresh rotation: a rotated refresh token is stored and the old one is never sent again | E | pass | passes |
| 58 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | invalid_grant: the connection needs a reconnect and the plugin client says "Reconnect required" with a reconne | E | pass | passes |
| 59 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | scopes: a product the catalog does not know is refused, never silently dropped from the sign-in | E | pass | passes |
| 60 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | revoke: a confirmed revocation clears local tokens; a failed one stays "revocation pending", serves no token,  | E | pass | passes |
| 61 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | revoke over the vault token store reaches Google and clears the grant | E | pass | passes |
| 62 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | revoke: Google answering that the token is already revoked counts as confirmed, so a retry can finish | E | pass | passes |
| 63 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | revoke: any other refusal from Google stays pending | E | pass | passes |
| 64 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | desktop: the installed-app sign-in forces consent without incremental grants, and re-consent replaces the old  | E | pass | passes |
| 65 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | hosted incremental: include_granted_scopes=true and a grant carrying earlier scopes is accepted | E | pass | passes |
| 66 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | redaction: no token or client secret reaches status, connection records or the tool output | E | pass | passes |
| 67 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | browser binding (hosted): missing or another browser's proof burns the attempt before exchange | E | pass | passes |
| 68 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | offline access (hosted): a first grant without a refresh token is refused before credential install | E | pass | passes |
| 69 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | browser binding (desktop): missing or another browser's proof burns the attempt before exchange | E | pass | passes |
| 70 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | offline access (desktop): a first grant without a refresh token is refused before credential install | E | pass | passes |
| 71 | `content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs` | hosted consent: a renewable same-account reconnect keeps incremental grants without forcing consent again | E | pass | passes |
| 72 | `content/agent-plugin-overlays/higgsfield-media/__tests__/higgsfield-media-overlay.test.mjs` | every snake_case tool the overlay cites is a served native tool or a per-plugin tool | H | FAIL: the overlay tells agents to call tools that do not exist | passes (release-check TAP) |
| 73 | `development/e2e/__tests__/journey-consolidation.unit.test.ts` | all web bug pins are collected once by the journeys harness | prior | FAIL: 72 !== 73 | not in release-check; fails on detached 7cf9658e5 checkout |
| 74 | `development/e2e/__tests__/journey-consolidation.unit.test.ts` | migration retains all pins, reviewed declaration revisions and why comments | prior | FAIL: A reviewed comment was lost from admin-selection-colors.spec.ts (9dcdfdabf28e427468fe3fcd91120822633b417de152213ac029b3d62b02bc5d) | not in release-check; fails on detached 7cf9658e5 checkout |
| 75 | `development/scripts/__tests__/bundled-agent-plugin-selection.test.ts` | the composed bundled id set is pinned, and no id ships from both content and a package | prior | FAIL: Expected values to be strictly deep-equal: | fails (release-check TAP) |
| 76 | `development/scripts/__tests__/dead-path-sweep.test.ts` | dead-path sweep: no path reference outside the known-broken register resolves to nothing | prior | FAIL: a path reference under development/scripts or the db tooling points at a file that does not exist | fails (release-check TAP) |
| 77 | `development/scripts/__tests__/dead-path-sweep.test.ts` | generated coverage artifacts are not reported as dead paths | prior | FAIL: development/coverage/lcov.unit.info's parent directory should exist | fails (release-check TAP) |
| 78 | `development/scripts/__tests__/hardwiring-debt.test.mjs` | the hardwiring report contains no stale debt rows after ownership fixes land | prior + 1 NEW row | FAIL: three HW5-jini-export rows (admin Login.tsx:22, use-login.hooks.ts:46, SkillRow.tsx:7) plus one HW2-vendor-adapter row at `apps/website/src/server/runtime/composition/plugin-runtime.ts:25` | fails on detached 7cf9658e5 checkout with the same three HW5 rows; the HW2 row is NEW |
| 79 | `development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts` | web dev CLI attaches to the selected running site and opens its admin URL | prior | FAIL: node:internal/modules/esm/resolve:272 | fails (release-check TAP) |
| 80 | `development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts` | desktop dev CLI builds preload before watching and forwards Electron flags on normal exit | prior | FAIL: node:internal/modules/esm/resolve:272 | fails (release-check TAP) |
| 81 | `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` | SDK external type contracts are declared package dependencies for standalone consumers | prior | FAIL: Expected values to be strictly equal: | fails (release-check TAP) |

### Totals against combine

- **Now passing (56):** groups A (14, counting composio once), B (4), C (11), D (1), E (22), F (1), G (1), I (1), which is 55; plus `adopt-command` (unknown in INTEG2; passed 15/15 here). It passes on combine too.
- **Fail on combine as well, same case (22):** cases 4, 19, 21, 23, 26-28, 34-39, 41, 75-77, 79-81 in release-check TAP; cases 73-74 (journey-consolidation, same `72 !== 73` assertion) on the detached combine checkout. The desktop error text matches combine's exactly.
- **Fails on combine, plus one NEW row (1):** case 78, hardwiring-debt. Combine fails it with three HW5 rows. The tip adds `HW2-vendor-adapter` at `plugin-runtime.ts:25`, `export { createPluginRuntimeCore, PluginUninstallPathError } from "@jini-ai/plugins/host/node"`, introduced by extraction commit `9df8907c` (S6 L1c). This is not a test edit within the allowance. Left for a coordinator ruling: allow-list the host re-export, or route it differently.
- **NEW, extraction, needs a ruling (1):** case 72, higgsfield `search_tools` / `describe_tool` (above).
- **Intermittent on both sides (1):** case 32, preview-switcher. Today's tip run failed at the revision-count assertion `81 !== 69`. INTEG3 recorded that same assertion failing on a combine whole-file run, and recorded the tip passing. This is a timing race on both sides, not an extraction regression. My combine re-run was invalid: 9/9 failed on setup, `createPendingAuthorizationStore` undefined, because the linked tip Jini sat under combine source. So that run is not counted as evidence either way.

Outside the primary lane: Jini plugin-identity x3 is fixed (above). Jini guard R2 is fixed by INTEG3 (`7fff92c3`), and R10 is prior. R13 is this container's environment. Broad test types: 10 errors, all prior and fixed by `c51b8e071`.

Not covered: the admin (85 of 883) and unselected website files are still outside this comparison, as the INTEG2 review noted.

## Last green pair and what is left

- Last green focused pair for the edited files: Tovu `ab1b01ab` with Jini `d9fa89a2`. Every test file edited by INTEG3 or this job passes there, except higgsfield (ruling needed). No fully green union pair is claimed.
- Left: (1) the higgsfield ruling; (2) the hardwiring HW2 row ruling; (3) `check:cross-package` XP3 with a pinned-base declaration snapshot; (4) the desktop preload build and the desktop suite in a container with electron installed; (5) the full suites, which belong to a later job.

EXTRACT-INTEG3-B DONE
