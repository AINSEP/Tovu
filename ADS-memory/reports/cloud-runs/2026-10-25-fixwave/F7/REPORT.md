# F7 — Tovu fix wave: L11 (assistant / contracts / platform) + L13 (admin non-UI logic)

Code branch: **Tovu `cloud/fixwave-1025-F7`** (from `origin/cloud/overnight-1024-tovu`). Reports: this folder.

## 0. Top of report — things a human must look at
1. **Source bugs found: none.** No new test exposed a behaviour that contradicts the code's evident intent (same finding as L11/L13).
2. **Still RED on purpose — owner security call:** `assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` › *"every surfaceExchanges.open(...) call names a toolId constant this scan can resolve"* now fails on ONE site only: `assistant/site/visitor-confirmations.ts:42` (`toolId: binding.executionId`, principal `anonymous-visitor`, channel `visitor-tool-confirmation`). It is a real surface exchange whose tool id is dynamic. Admitting it to the scan's `DYNAMIC_BINDINGS` is a security review decision I did not make for the owner. The other two L11 §2 sites (`features/member-login/oidc-login.ts:175/:238`) are sealed-state codec opens, not exchanges — added to `NON_EXCHANGE_OPEN_CALLS` with their exact call text (map now holds a list per file).
3. **Owner decision 2 applied (test only):** the mcp-ui allowlist pin now lists `members_delete` (signed off 2026-10-25); `mcp-ui-tool-calls.test.ts` is green. Owner decisions 1 (`database-transfer/exclusions.unit.test.ts`) and 3 (`identity/__tests__/wiring.test.ts`) live in `features/**`, outside L11/L13 — **not touched here**.

## 1. Headline
- **Tests added:** ≈155 new test declarations across 30 test files (16 website, 14 admin; 6 new files on each side). Loops/tables expand that to several hundred executed cases. **0 tests deleted, 0 assertions weakened, 0 skips, no coverage excludes or threshold changes.**
- **Source bugs:** 0 found / 0 fixed.
- **Source changes:** 1 behaviour-preserving refactor (`platform/site-dir/read-site-dir.ts` `validateConfig`, CCN 11 → split; tests green before and after).
- **Files at 100 % lines+branches (touched non-UI files):** before → after, see §3. 30 of 37 measured files are at 100 % / 100 %; the rest are ≥ 90 % branches, with the reason listed.
- **CCN > 10 in scope:** website `assistant/ contracts/ platform/` 6 → 5 (the 5 left are historical DB migrations `platform/db/migrations/0011–0013`, deliberately not refactored: frozen schema history, Postgres paths cannot run here). Admin `lib/ hooks/ integrations/`: 0 → 0.
- **Stryker before → after:** §3 (STRYKER column). Headline: daemon-access 51.6 → 98.4, egress-policies 50.0 → 100, vault-meta-rules 29.3 → 97.9, permanent-delete-settings 89.4 → 97.9; others in §3.
- Wall ≈ see final line. Rough tokens ≈ 0.6 M of 1.5 M. No subagents.

## 2. Source bugs (failing test → fix commit)
None. Closest calls, recorded so nobody re-investigates:
- `platform/markdown/frontmatter.ts`: an empty / scalar / sequence YAML block does not throw (`isNonArrayRecord` guards the wrapped value) — verified by probe, already pinned by an existing test.
- `assistant/external-mcp-vault.ts` L37–46: the `service()` `validateMeta` / `authorize` context checks are unreachable through the public API because `externalMcpVaultRecord` (L26–27) refuses the same mismatches first. They are defence in depth; the survivors there are equivalent by construction, not a gap. Not refactored (security code, and the brief forbids behaviour changes).

## 3. Per-file table
COV = node:test / vitest v8 coverage on the file's own tests, lines / branches. STRYKER = lane report score → re-score with the same config (StringLiteral excluded, type checks off; website = tap runner, coverageAnalysis off, test set = lane's direct tests ∪ my test files; admin = vitest runner, perTest, ignoreStatic, L13's scoped include).

### L11 (apps/website/src)
| file | COV after (L/B) | STRYKER before → after | notes |
|---|---|---|---|
| assistant/daemon-access.ts | 100 / 100 | 51.6 → 98.4 | every allow-list regex anchor; 503/401/exempt/run-bound/403/body.runId; ownership 401/404/SSE/unowned/absent; owned list |
| platform/http/egress-policies.ts | 100 / 100 | 50.0 → 100 | every policy pinned by value; private-IP + plain-http refusal through the real guarded client with a DNS fake |
| contracts/core/human-confirm.ts | 100* / 98 | 79.7 → 81.3 (pre batch-card test; see §5) | grant read with exact {toolId, principalId} before and after the click; revoke-while-open; cancel skips re-read; batch card |
| assistant/external-mcp-vault.ts | 94.6* / 91.3 | 73.3 → 79.3 | per-field context mismatch table; foreign kinds refused before crypto; CAS conflict on kind/owner. Rest = §2 defence-in-depth |
| platform/secrets/vault-meta-rules.ts | 100 / 100 | 29.3 → 97.9 | 91 no-cov mutants → 0 |
| assistant/permanent-delete-settings.ts | 100 / 100 | 89.4 → 97.9 | over-long/duplicate/unknown-id-first/middle/last; exact settings key + workspace scope; readiness propagates. Length cap is equivalent (any over-long list must contain a duplicate or unknown id) |
| assistant/mcp-ui-tool-calls.ts | 100 / 100 | 65.0 → see batch | PLUGIN_TOOL_ID table (anchors, `+`, class, case, trailing `\n`) |
| contracts/headless/assistant-tool-approval-policy.ts | 100 / 100 | 63.9 → see batch | reviewed page-handle set exact; look-alikes; unknown capability incl. `__proto__`; extension families pinned |
| assistant/tool-approval-policy.ts | 100 / 99.05* | 75.6 → see batch | execution-setting AND rule, http-method, plugin-enable, export-commit, plan/direct short-circuit, restore regex bounds (.{0,80}, .{0,40}) |
| assistant/content-target-inputs.ts | 100 / 98.9* | 61.9 → see batch | prefix→entity routing table with recording DI fakes; key priority; slug alias rules; preview/pages/video guards; batch cap; beforeLookup |
| assistant/public-assistant-availability.ts | 100 / 100 | 59.3 → see batch | PROVIDER_UNSUPPORTED / MODEL_NOT_CONFIGURED (missing, blank) / NOT_CONFIGURED by code+message, key never leaked; decrypt failure callback |
| platform/site-dir/nested-sites-root.ts | 100 / 100 | 41.7 → see batch | DI folders + fake workspace: holds-site, dedupe, explicit/saved/unreadable home, not-a-dir, root-is-a-site |
| contracts/core/rate-limit/rate-limit.ts | 100 / 100 | 75.0 → see batch | every profile pinned; max+burst ceiling for the 4 newer profiles |
| contracts/core/public-page-security-headers.ts | 100 / 100 | 77.8 → see batch | exact CSP with empty resources (no trailing space), origin dedupe, frozen |
| platform/markdown/frontmatter.ts | (not re-measured) | 78.4 → see batch | outer-quote-only strip; first-byte `---` |
| assistant/run-start-context.ts | 100 / 97.2* | 69.2 → see batch | required-field refusal by message; recovery shapes; 500k / 16k caps |
| assistant/tool-catalog-query.ts | 100 / 90.3* | 68.3 → see batch | `_x` → tovu source; content_read family synthesis + null without cards |
| platform/site-dir/init-site.ts (`resolveSiteName`) | — | 64.5 → not re-run | 0/1/200/201, trim, whitespace-only, never falls back on a provided blank |
| platform/site-dir/read-site-dir.ts | (22/22 tests) | not in lane | refactor target; contract pinned before/after |
| contracts/core/soft-delete.ts, assistant/credential-store-fields.ts, assistant/duplicate-resource-registry.ts, assistant/site-guide-pointer.ts, platform/site-dir/seed-starter-title.ts | 100 / 100 each | unmeasured → not re-run | L11 "no importing test" files now have direct tests (seed-starter-title: HTML-escaping incl. `$&` replacement patterns) |
| assistant/tool-recovery-preset.ts | 100 / 100 | 61.2 (lane subset) | already 100 % with its full importing test set — the lane measured a subset; no new test needed |
| assistant/execution-mode-settings.ts | 100 / 100 | 75.0 | already 100 %; survivors are equality-boundary only (not addressed) |

`*` = residual uncovered "lines/branches" reported by node's V8 coverage map to comment/blank/type-only lines (tsx source-map offsets): e.g. `human-confirm.ts` 63–73 are type/JSDoc lines; `external-mcp-vault.ts` 24/29/30/47/48/55 are closing braces/signatures, plus the fail-closed `unavailable` ports that only fire on an accidental future write. Verified by reading the lcov BRDA line numbers against the source.

### L13 (apps/admin/src) — all measured with vitest v8
| file | COV after (L/B) | STRYKER before → after |
|---|---|---|
| lib/queued-daemon-start.ts | 100 / 100 | 31.4 → see admin run |
| lib/acceptance-cancellation.ts | 100 / 100 | 54.5 → see admin run |
| lib/admin-boot-scope.ts | 100 / 100 | 14.3 → see admin run |
| lib/admin-draft-identity.ts | 100 / 100 | 0.0 → see admin run |
| lib/retry-unreachable.ts | 100 / 100 | 70.0 → see admin run |
| lib/execution-settings.ts | 100 / 100 | 88.6 → see admin run |
| lib/settings-tabs.ts | 100 / 100 | 92.7 → see admin run |
| lib/browser-stream.ts | 100 / 100 | 92.0 → see admin run |
| lib/agent-screenshot.ts | 100 / 100 | 96.0 → see admin run |
| lib/unchanged-save-warning.ts | 100 / 100 | 73.3 → see admin run |
| lib/visitor-tools.ts | 100 / 100 | 0.0 → see admin run |
| lib/api.ts | (not re-measured, 3,000+ lines) | 94.8 (737 static mutants unmeasured) — timeout copy, errorName guard, login shape added |
| hooks/use-credential-hint.hooks.ts | 100 / 100 | 0.0 → see admin run |
| hooks/use-cms-sidebar-label-tooltips.hooks.ts | 100 / 100 | 0.0 → see admin run |
| hooks/assistant-chats-dependencies.hooks.ts | 100 / 100 | 83.9 → see admin run |
| hooks/use-admin-locale.hooks.ts | 100 / 100 | 64.3 → see admin run |
| hooks/use-sites-sidebar-nav.hooks.ts | 100 / 100 | 43.3 → see admin run |

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **AP6 unpinned security constants** — egress policies, rate-limit profiles, telemetry-off default, CSP: nothing compared the declared value to an inline expected value. Fix was always a single `deepEqual` table.
2. **AP4 happy-string regex** — daemon route allow-list, PLUGIN_TOOL_ID, data-URL parser, restore-over-existing description regexes: anchors and bounded gaps were never probed.
3. **Scoped-measurement artefacts** — several "weak" L11/L13 rows (tool-recovery-preset, mcp-ui-tool-calls, durable-run-subscription, OAuth connect/poll helpers) were already covered by tests outside the lane's scoped test set, or were dropped because one sibling test was red. A red pin silently removes a whole file's tests from mutation scoring.
4. **AP1 bare failure** — permanent-delete grant checks, public-assistant refusals: the tests checked a failure happened, not which code/args.
5. **Hook dependency/default blind spot (L13)** — `enabled: !checking`, per-principal query keys, default ports (`measure`, `schedule`, `localeFor`) had no test that would fail if the option were ignored.

## 5. NOT done
- L11: `ask-choice-tool.ts` result-normalization tail (its "real round trip" integration test is a known-red ENV failure), `boot-site-dir.ts` shutdown path, `init-site.ts` Postgres branches (no Postgres), `log-buffer.ts` boundaries, `agent-permission-mode.ts`, `execution-mode-settings.ts` equality survivors, `contracts/core/site-key-state.ts` (type-only — nothing to test).
- L13: `use-admin-appearance.hooks.ts` equal-version boundary, `router.ts`, `assistant-transport.ts`, `admin-themes/**` (scoping artefact per L13 §9), static mutants in `api.ts`.
- Owner decisions 1 and 3 (features/**, other lanes).
- `visitor-confirmations.ts` completeness-scan decision (§0.2).
- Stryker re-score of `human-confirm.ts` after the batch-card test (run started before it landed).

## 6. Commits
See run log below and `git log origin/cloud/overnight-1024-tovu..origin/cloud/fixwave-1025-F7`.

## Run log
## 2026-10-25T21:36Z — STARTED
Tovu base origin/cloud/overnight-1024-tovu; Jini origin/cloud/overnight-1024-jini (checked out at /home/user/Jini, not /root/Jini — host repos link ../Jini). Setup (Node 24, installs, link:jini) ran.
## 2026-10-25T21:50Z — PROGRESS
10 commits; L11 top-10 #1–#9 and L13 top-10 #1–#7 + never-tested hooks done. Setup note: `npm rebuild argon2 better-sqlite3 esbuild` failed with `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"` (exit 1) — no test needed it.
## 2026-10-25T22:16Z — PROGRESS
27 commits. Typecheck: admin `tsc --noEmit` exit 0; website `tsconfig.tests.json` has 346 pre-existing errors elsewhere and 0 in files this lane touched (2 found in my own test, fixed in a follow-up commit). Stryker re-scores running.
