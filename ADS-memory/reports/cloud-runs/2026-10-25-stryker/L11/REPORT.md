# L11 — Tovu website: assistant + contracts + platform (Stryker, measure-only)

## 1. Headline
- Tool: StrykerJS 9.6 + `tap-runner` (node:test via tsx, Node 24.22), L7's proven config; `coverageAnalysis: off`, `mutator.excludedMutations: [StringLiteral]`, `disableTypeChecks`, concurrency 2 × 2 parallel workers. One `stryker run` per source file with `testFiles` scoped to that file's own unit/integration tests (not the whole suite).
- **140 source files / 9 594 mutants measured** (killed+timeout 6 264, survived 905, no-coverage 588; non-scored ≈ compile/ignored). Overall **score 80.6 %** (killed ÷ (killed+survived+no-cov)).
  - `assistant/` 41 files, 3 973 mutants → **75.9 %**
  - `contracts/` 33 files, 1 146 mutants → **88.2 %**
  - `platform/` 66 files, 4 475 mutants → **83.0 %**
- Wall: ≈ 2 h 57 m (16:49 → ~19:46 UTC, incl. ~25 min of setup mistakes below). Rough tokens: ~0.2 M of the 1 M budget. No source or test edits; nothing under `.stryker-tmp` committed.
- Setup note (cost me ~10 min): first launch failed because `@jini-ai/*` wasn't linked — Jini must be cloned+built and `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini` run before any Tovu test file loads.

## 2. Suspected source bugs / red baselines (top)
No source bug found by mutation. But **three pre-existing RED tests on this branch** (verified standalone, not caused by Stryker), two of them security pins:
1. `assistant/__tests__/mcp-ui-tool-calls.test.ts` — *"SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently"* FAILS: the live mcp-ui allowlist contains **`members_delete`**, which the pinned expected set does not list. Either the pin wasn't updated (likely) or the allowlist was widened without the owner-visible pin step. Worth a human look.
2. `assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` — *"every surfaceExchanges.open(...) call names a toolId constant this scan can resolve"* FAILS on 3 new call sites: `assistant/site/visitor-confirmations.ts:42` (`binding.executionId`), `features/member-login/oidc-login.ts:175` and `:238` — i.e. new surface-exchange `open()` calls whose tool id the completeness scan can't resolve, so the allowlist-completeness guarantee is currently unverified for them.
3. Known/previously-listed reds also seen: `external-mcp-oauth.test.ts` "beginConnect persists the discovered protected resource (typed endpoints)"; `mcp-ui-tool-calls-route.ask-choice.integration` "real round trip…"; `purpose-scoped-mailer-call-sites` integration; `cross-site-read-catalog.test.ts`; postgres-only tests (no Postgres here). Stryker needs a green baseline per test file, so these files were **dropped from the mutation run** (see §6), which lowers coverage of the files they own.
- Sandbox artifact: `platform/site-dir/__tests__/unit/sites-home.unit.test.ts` passes standalone (32/32) but fails inside the Stryker sandbox (`.stryker-tmp` under the repo breaks its test-home-isolation assumptions) → `sites-home.ts` (15.9 %) and `sites-project-references.ts` are **under-measured**, not weak.

## 3. Per-file table (worst first) — full 140-row table in `data/per-file-table.md`
Files < 80 % that are measured on their own direct tests (reliable rows):

| file | mutants | killed | surv | no-cov | score |
|---|---|---|---|---|---|
| assistant/daemon-access.ts | 79 | 33 | 20 | 11 | 51.6 % |
| platform/http/egress-policies.ts | 74 | 31 | 31 | 0 | 50.0 % |
| contracts/headless/assistant-tool-approval-policy.ts | 66 | 23 | 13 | 0 | 63.9 % |
| platform/secrets/vault-meta-rules.ts | 239 | 56 | 44 | 91 | 29.3 % |
| platform/site-dir/nested-sites-root.ts | 55 | 20 | 21 | 7 | 41.7 % |
| platform/site-dir/boot-site-dir.ts | 74 | 35 | 12 | 15 | 56.5 % |
| assistant/public-assistant-availability.ts | 33 | 16 | 5 | 6 | 59.3 % |
| assistant/tool-recovery-preset.ts | 64 | 30 | 15 | 4 | 61.2 % |
| assistant/content-target-inputs.ts | 253 | 130 | 41 | 39 | 61.9 % |
| platform/site-dir/init-site.ts | 246 | 136 | 45 | 30 | 64.5 % |
| assistant/ask-choice-tool.ts | 376 | 181 | 38 | 59 | 64.9 % |
| assistant/mcp-ui-tool-calls.ts | 20 | 13 | 6 | 1 | 65.0 % |
| assistant/tool-catalog-query.ts | 99 | 56 | 25 | 1 | 68.3 % |
| assistant/run-start-context.ts | 100 | 63 | 25 | 3 | 69.2 % |
| assistant/execution-mode-settings.ts | 78 | 30 | 10 | 0 | 75.0 % |
| contracts/core/rate-limit/rate-limit.ts | 21 | 15 | 5 | 0 | 75.0 % |
| assistant/tool-approval-policy.ts | 242 | 163 | 47 | 0 | 75.6 % (incl. 17 timeouts) |
| contracts/core/public-page-security-headers.ts | 23 | 7 | 2 | 0 | 77.8 % |
| contracts/core/human-confirm.ts | 158 | 103 | 16 | 10 | 79.7 % |
| platform/markdown/frontmatter.ts | 57 | 40 | 11 | 0 | 78.4 % |

**Unreliable rows (wrong/indirect tests or sandbox failure — do not read as weak/strong):** `assistant/tool-registrations.ts` (0 %, 204 no-cov: only assembly-pin tests import it), `contracts/core/model-facing-tool-errors.ts`, `contracts/headless/assistant-subagents-policy.ts`, `assistant-permanent-deletes-policy.ts`, `platform/site-dir/layout.ts` (all tested only through server/ wiring tests or barrel tests), `platform/site-dir/sites-home.ts`, `contracts/headless/secret-form-cards.ts` (type-only). Contracts/headless policies are mostly constant tables; their tests live in `server/**` and were not in the scoped set.
Strong (≥ 95 %): vault-kinds 98.7, vault-credential-inventory 97.6, endpoint-safety 96.9, byok-credential 96.3, external-mcp-revocation 96.2, subagent-settings/chat-delete-grant/secret-redaction/credential-token/gated-mutations token+composition/upload-limits/native-approval-memory (100 %).

## 4. Triaged survivors (a = real test gap, b = equivalent, c = noise)
- **assistant/daemon-access.ts** (a, SECURITY): the route allowlist regexes (`/^\/api\/runs\/[^/]+$/`, `…\/cancel$/`, `/api/tools/…`, `/api/components/…`, `/api/active`) survive removal of the `^` and/or `$` anchors (12 Regex survivors) → no test sends a prefixed (`/x/api/active`) or suffixed (`/api/active/extra`, `/api/runs/id/other`) path that must be refused. Add negative-path tests. Plus 3 ConditionalExpression survivors.
- **platform/http/egress-policies.ts** (a, SECURITY/SSRF): `SINGLE_HOP_HTTPS_EGRESS_POLICY` — `allowedSchemes: ["https"]→[]`, `denyPrivateAddresses: true→false`, `devHostAllowlist` and all size/time constants (`60*1024*1024` etc., 10 ArithmeticOperator) survive: the policy constants are never asserted by value or exercised through a blocked-private-address call. Add a policy-shape pin test and one private-IP/http-scheme refusal per policy.
- **contracts/core/human-confirm.ts** (a, SECURITY): `requireChatDeleteGrant({ surfaces, toolId, principalId })` → `{}` survives at L83 and L105 — the delete-grant check's arguments (which tool / which principal) aren't asserted; a mutated call checking nothing specific passes. Assert the grant is looked up with the exact toolId+principalId (and denied for another principal). Also L103 `!outcome.confirmed || answer.status !== "received"` conditional survives.
- **assistant/external-mcp-vault.ts** (a, SECURITY/crypto context binding): 19 ConditionalExpression survivors in the vault-context guard (`context.workspaceId/ownerKey/kind/principalId/binding` each `!==` → `false` survives): no test mismatches each field individually and expects `VaultError{code:"context"}`; L35 `kind !== "mcp-env" && kind !== "mcp-auth"` guard also untested.
- **platform/secrets/vault-meta-rules.ts** (a, SECURITY): 91 no-coverage + 44 survived. `assertRecoveryMeta` (L26–37), the normalization-status/label/run-field allowlists (`NORMALIZATION_STATUSES`, `MIGRATION_LABEL_FIELDS`, `SUCCESS_RUN_FIELDS`, `FAILURE_RUN_FIELDS`, `CREDENTIAL_FREE_TEXT_FIELDS` → `[]` all survive) and `legacyAad` rejection (L27) are not exercised by `vault-meta-rules.unit.test.ts`.
- **assistant/permanent-delete-settings.ts** (a, SECURITY): shape validation survivors L31–33 — `allowedToolIds.length > PERMANENT_DELETE_TOOLS.length`, duplicate-id (`Set.size`) and unknown-id (`.every→.some`) checks have no negative test (an over-long list, duplicates, or one unknown id among valid ones is accepted).
- **assistant/permanent-delete-tool-gate.ts** (4 surv, 84 %): measured with registration tests; the gate's deny branches need direct tests (not triaged line-by-line).
- **contracts/headless/assistant-tool-approval-policy.ts** (a): `capabilityId !== 'page.click'` branch, the `hasOwn` unknown-capability throw (L47) and `DIRECT_PAGE_HANDLES` set → `[]` survive: page.click vs direct-handle approval classification isn't pinned.
- **assistant/tool-approval-policy.ts** (47 surv): `execution-setting` matcher (`namespace === && key ===` → `||`/`true`, L23), `http-method` matcher (L26), `plan`/`direct` confirmation short-circuit L41 (5 ConditionalExpression/LogicalOperator), and the `restore-over-existing` regexes (L105: `replaces?`→`replaces`, `.{0,40}`→`.`) — approval rule matchers lack boundary/negative cases.
- **assistant/content-target-inputs.ts** (a): L19–21/36 id-prefix → entity-type routing (`seo_`, `pages_`, `content_post_`, `media_`) conditions survive → wrong entity type for a tool id goes undetected; no-cov L55,61-62,68-70,77-79,110-112,123.
- **assistant/ask-choice-tool.ts** (a): optional-field spreads (`parsed.description`, `multiSelect.hint`, `additionalSubmitActions`) L182–207 survive both ways; no-cov L184, 206-207, 254, 420-446 (the whole result-normalization tail — the "real round trip" test that would cover it is red).
- **assistant/mcp-ui-tool-calls.ts** (a, SECURITY): `PLUGIN_TOOL_ID = /^p_[a-z0-9_]+__[a-z0-9_]+$/` — 6 Regex survivors (anchors, `+` quantifiers, char class); the plugin-tool-id allowlist matcher is only tested with happy ids because its own pin test is red.
- **assistant/tool-recovery-preset.ts**, **run-start-context.ts**, **tool-catalog-query.ts**, **public-assistant-availability.ts** (L23–27 BYOK-protocol/model validation never exercised → the "assistant available to public" gate is unverified for missing model/unknown provider) — (a), medium risk.
- **platform/site-dir/nested-sites-root.ts** (a): `nested && holdsSites(...)` L25 conditions/`&&→||` survive; no-cov L48, 61-62. **boot-site-dir.ts**: `closeSiteDirBoot` (L84–88, composed vs boot.store close) and L128, 201-218 no-cov (b/a mix; shutdown path).
- **init-site.ts**: name-length validation L115 (`trimmed.length===0 || > MAX_NAME_LENGTH`) conditions all survive; no-cov L175-178, 311, 435-436, 458-469.
- **platform/server-logs/log-buffer.ts**: `<=`→`<` boundary at L69, compaction `head > 1_024 && head*2 > items.length` L97 → mostly (b)/boundary; **platform/markdown/frontmatter.ts**: quote-stripping regexes L36 and `startsWith("---")` L48 (a, low risk).
- **rate-limit.ts** (5 surv), **execution-mode-settings.ts** (10), **public-page-security-headers.ts** (2), **agent-permission-mode.ts** (3): boundary/equality survivors — (a) low–medium; per-file detail in `data/survivors-and-nocov.txt` (first 10 survivors + mutator tallies + no-cov line ranges for **every** file).

## 5. No-coverage ranges (code no scoped test executes)
Per-file ranges are in `data/survivors-and-nocov.txt` (`NOCOV lines:`). Largest: `vault-meta-rules.ts` 29-37, 49, 55-56, 69, 75-76, 86-94, 101-117; `daemon-access.ts` 28-29, 43-44, 52-58 (before re-selecting tests: 33 no-cov, final 11); `ask-choice-tool.ts` 184, 206-207, 254, 420-446; `content-target-inputs.ts` 55, 61-62, 68-70, 77-79, 110-112, 123; `init-site.ts` 175-178, 311, 435-436, 458-469; `boot-site-dir.ts` 128, 201-218; `human-confirm.ts` 198, 202-205; `public-assistant-availability.ts` 23-27; `nested-sites-root.ts` 48, 61-62; `tool-recovery-preset.ts` 50, 83, 88-89.

## 6. NOT RUN / not meaningfully measured
- No importing test found by import-path scan: `assistant/site-guide-pointer.ts`, `assistant/duplicate-resource-registry.ts`, `assistant/credential-store-fields.ts`, `contracts/core/soft-delete.ts`, `platform/site-dir/seed-starter-title.ts` (the last three: scan returned a server/ test set whose initial run timed out at 5 min; `contracts/core/site-key-state.ts`: scan matched the whole `apps/website/src` dir). **All five unmeasured** — soft-delete and site-key-state are data-integrity code worth a manual rerun with the right test file.
- Baseline-red test files dropped (so these files are measured on fewer tests): `external-mcp-oauth.test.ts` (→ `external-mcp-oauth.ts` **not run**: remaining tests also failed the dry run), `mcp-ui-tool-calls.test.ts` + `mcp-ui-allowlist-completeness.test.ts` (§2), `mcp-ui-tool-calls-route.ask-choice.integration`, `cross-site-read-catalog.test.ts`, `purpose-scoped-mailer-call-sites.integration`, all `*.postgres.test.ts` (no Postgres), `sites-home.unit.test.ts` (sandbox).
- Not attempted (clock/ordering): everything under `assistant/` not listed in `data/per-file-table.md` (≈ 90 files: durable-runs/, persistence/, mcp-federation/, site/, most `*-tool.ts`, byok-provider-turn, agents, etc.), `contracts/core/{commands,embeds}` bodies, `contracts/core/tool-metadata/*`, `contracts/site-assistant/`, `platform/db/{sqlite,postgres,kernel,repos}/*` except the credential/oauth repos listed, `platform/db/{chat,content,journal}-kernel.ts`, `platform/mail/*` (partial), `platform/oauth/*` except endpoint-safety, `platform/headless-browser/`, `platform/dev-supervisor/` partial, `platform/routing/adapter.ts`, `platform/site-dir/{local-site-*,duplicate-pglite-*,site-databases,seed-site-themes,...}`. `platform/observability/` only config/otel (index last, per instructions).
- Large `.tsx` and generated files excluded (`content-database.generated.ts`, drizzle/migrations).

## 7. What these numbers do NOT catch
- `disableTypeChecks`: type-level mutants that would fail `tsc` are counted as survivors/killed by runtime only. StringLiteral mutants excluded → error-message text, ids, route strings, tool-id literals, i18n keys are unmeasured (many of the gates here are string-keyed allowlists!).
- `coverageAnalysis: off` + file-granular tap runner: a mutant is "killed" if *any* scoped test file fails or times out (17 timeouts in tool-approval-policy count as kills); kills by unrelated tests inflate the score; tests outside the scoped set (e.g. `server/**` wiring tests that exercise the policy files) were not run, so files tested only indirectly show low scores here that reality may exceed (and vice-versa nothing is proven about end-to-end behaviour).
- Equivalent mutants not individually proven; only the first 10 survivors per file were listed. Integration tests that touch the real filesystem (`site-dir`) ran in a copied sandbox, which may differ from a normal checkout.
- Concurrency 2×2 on 4 cores; timeouts (timeoutMS 20 s ×3) could mis-classify slow-test mutants.

## 8. Top 10 tests to write first (risk-ranked)
1. `daemon-access` — negative-path tests for every allowlisted route (prefix/suffix/extra segment/wrong method) so the `^…$` anchors are pinned.
2. `egress-policies` — pin `SINGLE_HOP_HTTPS_EGRESS_POLICY` & siblings (https-only, `denyPrivateAddresses`, byte/time caps) and one refused private-IP/plain-http request per policy.
3. `human-confirm` — assert `requireChatDeleteGrant` receives exactly `{toolId, principalId}` and a grant for principal A doesn't authorize B (L83/L105, L103 branch).
4. `external-mcp-vault` — table test mutating each context field (workspaceId, ownerKey/serverId, kind, principalId, binding) and expecting `VaultError{code:"context"}`; unsupported kind.
5. `vault-meta-rules` — cover `assertRecoveryMeta`, `legacyAad` rejection and each allowlisted field set (accepts only listed fields/statuses).
6. `permanent-delete-settings` — reject over-long, duplicate and unknown-id `allowedToolIds`; accept valid subsets.
7. Fix the red `mcp-ui-tool-calls` allowlist pin (`members_delete`) and the `mcp-ui-allowlist-completeness` scan (3 new `open()` sites), then add regex-boundary tests for `PLUGIN_TOOL_ID`; re-run Stryker on `mcp-ui-tool-calls.ts`.
8. `tool-approval-policy` + `assistant-tool-approval-policy` — negative cases for the `execution-setting`/`http-method` matchers, `restore-over-existing` regex boundaries, `page.click` vs direct handles, unknown capability throw.
9. `content-target-inputs` — one assertion per id-prefix → entityType mapping (`seo_`, `pages_`, `content_post_`, `media_`, `library_read`) and the slug-alias rules; plus `ask-choice-tool` result-normalization tail (L420–446) once the round-trip test is green.
10. `public-assistant-availability` (missing model / unknown BYOK provider → unavailable), `nested-sites-root`/`init-site` name & root validation, and write/locate real tests for the five unmeasured files (soft-delete, site-key-state, credential-store-fields, seed-starter-title, external-mcp-oauth).

L11 DONE 2026-10-25T19:45Z — wall ≈ 2 h 57 m, rough tokens ≈ 0.2 M
