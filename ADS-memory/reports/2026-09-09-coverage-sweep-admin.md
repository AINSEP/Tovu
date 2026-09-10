# Coverage sweep: apps/admin (2026-09-09)

Scope: non-test source files under `apps/admin/src` changed in the last 3 days (per `git log --since="3 days ago"`), on branch `restructure/apps-website-phased`. Measurement only — no tests written, edited, or deleted; no source edited.

Status: **IN PROGRESS — this report is being written incrementally while a full-suite coverage run executes in the background.** Sections below are marked MEASURED (backed by a run I performed) or DRAFT/PENDING (structure filled in, numbers to follow).

## 1. The enforced standard — MEASURED

**Nothing is enforced.** Three independent checks, all confirmed on disk just now:

1. `apps/admin/vitest.config.ts:67-76` — the `coverage` block sets `provider: "v8"`, `reporter: ["text", "lcov"]`, `reportsDirectory: "./coverage"`, and `reportOnFailure: true`. There is no `thresholds` key anywhere in that file, and `command grep -rn "thresholds" apps/admin/src apps/admin/vitest.config.ts apps/admin/vite.config.ts` returns nothing. Vitest's own default when `thresholds` is absent is no gate at all — a run cannot fail on coverage.
2. `command grep -rn "thresholds"` across `apps/admin/` (excluding `dist/` and `coverage/`, which contain build/report artifacts, not config) confirms the same: zero hits outside build output.
3. `.github/workflows/ci.yml` runs exactly two admin-related gates: `Typecheck (admin)` (`npm --prefix apps/admin run typecheck`, line ~310) and `Build admin` (`npm run admin:build`, line ~315). It never invokes `apps/admin`'s `test` or `test:cov` script. The root `test:ci` / `test:cov` / `test:cov:server*` scripts that CI does run are scoped to `apps/website/src/**`, `packages/*/src/**`, `apps/site-chat/src/**`, and `development/scripts/**` (confirmed by reading their actual glob arguments in `package.json`) — `apps/admin` is not in any of those globs.

So the owner's "we should have one hundred percent" expectation has **no enforcement mechanism behind it at all**, not even a lower bar: `apps/admin` tests aren't required to pass in CI, let alone hit a coverage number. This is on top of what's likely the more concerning finding — whatever coverage exists has never been checked by anyone but a human reading the terminal table.

`apps/admin/package.json` scripts: `test` = `vitest run`, `test:cov` = `vitest run --coverage`. Both must run from `apps/admin` (not repo root), with `TOVU_ADMIN_PASSWORD` unset.

## 2. Per-file coverage table — PENDING

Coverage run in progress. Command used (full detail in Section 5). Will populate line %/branch %/covering-test-file(s) per changed file from `apps/admin/coverage/lcov.info` once the run completes.

## 3. Zero-coverage list — PENDING

Cannot rank until the lcov report is parsed. A preliminary **import-based** signal (not proof of zero coverage — see Section 5 caveats) found 34 of the 102 changed files with no test file importing them by basename anywhere under `apps/admin/src`. Several of these are `*-i18n.ts` string-map modules, which likely still get exercised indirectly (imported by a covered component) — that must be checked against the real lcov numbers, not assumed either way:

```
apps/admin/src/features/database/database-visuals.tsx
apps/admin/src/features/media/Media.hooks.tsx
apps/admin/src/features/media/hooks/media-port.hooks.ts
apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts
apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts
apps/admin/src/features/menus/MenuEditor.hooks.tsx
apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts
apps/admin/src/features/pages/page-editor-i18n.ts
apps/admin/src/features/pages/pages-i18n.ts
apps/admin/src/features/plugins/AgentPluginRow.tsx
apps/admin/src/features/plugins/agent-plugins-visuals.tsx
apps/admin/src/features/plugins/hooks/agent-plugins-port.hooks.ts
apps/admin/src/features/plugins/plugins-i18n.ts
apps/admin/src/features/posts/posts-i18n.ts
apps/admin/src/features/security/SiteTokenTab.hooks.tsx
apps/admin/src/features/security/SiteTokenTab.tsx
apps/admin/src/features/security/hooks/site-token-dependencies.hooks.ts
apps/admin/src/features/security/hooks/site-token-port.hooks.ts
apps/admin/src/features/security/hooks/use-site-token.hooks.ts
apps/admin/src/features/security/security-i18n.ts
apps/admin/src/features/security/security-visuals.tsx
apps/admin/src/features/seo/seo-i18n.ts
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx
apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx
apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx
apps/admin/src/features/settings/ExternalMcpToolPicker.tsx
apps/admin/src/features/settings/external-mcp-i18n.ts
apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts
apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts
apps/admin/src/features/sites/AllSitesTab.tsx
apps/admin/src/features/sites/sites-visuals.tsx
apps/admin/src/features/source-control/ProvidersTab.tsx
apps/admin/src/features/themes/themes-i18n.ts
apps/admin/src/lib/admin-nav-i18n.ts
```

Note: `SiteTokenTab.tsx`, `SiteTokenTab.hooks.tsx`, and the `site-token-*.hooks.ts` files are new (added today, commit `7c9fc7ec`) and genuinely appear to have no dedicated test file yet — this cluster looks like a real, current gap, not a measurement artifact.

## 4. The `vi.mock` illusion list — MEASURED (static scan) + PENDING (coverage cross-check)

Static scan of every test file that imports each changed source (by basename) for a `vi.mock(...)` call naming that same module:

| Source file | Test file(s) that mock it | Note |
|---|---|---|
| `apps/admin/src/lib/api.ts` | 16 different test files (`ai-assistant-dependencies`, `visitor-credential-form-dependencies`, `publish-credentials-dependencies`, `static-export-dependencies`, `static-publish-dependencies`, `members-dependencies`, `page-editor-dependencies`, `access-tokens-dependencies`, `other-credentials-dependencies`, `use-access-tokens`, `use-other-credentials`, `connectors-port`, `use-external-mcp`, `source-control-credentials-dependencies`, `use-admin-execution-credential.hooks`, `api-assistant.unit`) | **Not an illusion on inspection.** `api.ts` has ~90+ direct covering tests total (see importer map); the mocking files are feature/hook tests verifying they *call* `api.*` correctly, while a separate cluster of `api-*.unit.test.ts` files (confirmed by reading `api-system-endpoints.unit.test.ts:1-24`) deliberately stub `fetch` directly and assert the real URL/method/body `api.ts` builds. That file's own header states this split explicitly: "every one of those `vi.mock(...)`s the whole module... That is real feature coverage but zero `api.ts` coverage; this file closes the `api.ts` half." This is the pattern working as intended, not the failure mode the owner is worried about — but it still needs the real lcov number to confirm `api.ts` itself (not just its callers) is actually well covered branch-by-branch. |
| `apps/admin/src/features/seo/hooks/use-seo-entry-panel.hooks.ts` | `Seo.unit.test.tsx` (mocks via `importOriginal`, i.e. partial mock) | Also has a direct, unmocked `use-seo-entry-panel.unit.test.ts` — likely real coverage comes from there. Needs lcov confirmation. |
| `apps/admin/src/hooks/use-assistant-chats.hooks.ts` | `AssistantDock.hooks.unit.test.tsx` (component-level test, mocks the hook to isolate the component) | Also has a direct, unmocked `use-assistant-chats.unit.test.ts` under `apps/admin/src/hooks/__tests__/`. Same pattern as above — needs lcov confirmation, but not an obvious illusion. |

No other changed file in scope showed a same-module `vi.mock` in its own covering test file under this scan. This scan only catches a test mocking *the file itself*; it does not catch a file whose only "coverage" comes from being imported by a component whose own render is itself mostly assertion-free — that requires the lcov branch numbers plus a read of the test bodies, still pending.

## 5. Method and honesty — MEASURED

**File inventory.** Regenerated independently rather than trusting the dispatch's count:
```
git log --since="3 days ago" --name-only --pretty=format: -- 'apps/admin/src/**/*.ts' 'apps/admin/src/**/*.tsx' \
  | sort -u | command grep -v "__tests__" | command grep -v "\.test\."
```
Raw output: 103 non-blank lines (dispatch's estimate was 105; also had one leading blank line I filtered). Checked every path against disk: 102 exist, 1 does not (`apps/admin/src/features/plugins/agent-plugin-catalog.ts` — confirmed via `git log --diff-filter=D` deleted in commit `791c8144` on 2026-09-09, same day, as part of "wire the Agent Plugins page to real installed-plugin data." Legitimate deletion, not a measurement error. **1 file dropped.** Final scope: **102 files.**

**`features/security/**` compile-break note is stale.** The dispatch flagged `Security.tsx` importing an untracked `SiteTokenTab` as a known, currently-broken peer edit to exclude from conclusions. On inspection, that work landed — `SiteTokenTab.tsx` / `SiteTokenTab.hooks.tsx` are now committed (`7c9fc7ec`, "Secrets page's Site Token tab") and are present on disk. I ran `cd apps/admin && npx tsc --noEmit` to confirm: it found **zero** errors related to `security/`. **I am NOT excluding `features/security/**` from this report** — the reason to exclude it no longer holds.

**A different, unrelated compile break exists right now**, confirmed by the same `tsc --noEmit` run:
```
src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts(3,10): error TS2305: Module '"../rules"' has no exported member 'buildAgentPluginDisableConfirmCopy'.
src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts(3,51): error TS2305: Module '"../rules"' has no exported member 'AgentPluginDisableConfirmCopy'.
```
This file is untracked (new, uncommitted) and not part of my 102-file scope — it belongs to one of the two agents the dispatch said are actively editing `features/plugins/**` and `panels.tsx` right now. Named here per the dispatch's instruction to re-check `git status` before reporting, not as a finding against my scope.

**Coverage run.** Command:
```
cd apps/admin && rm -rf coverage && env -u TOVU_ADMIN_PASSWORD npx vitest run --coverage
```
Started 2026-09-09, run in background because the admin suite (363 test files) plus a large number of failing/timing-out tests made this too slow for a synchronous call. `reportOnFailure: true` is already set in `vitest.config.ts`, so a failing suite still yields a coverage report. This report will be updated with the real lcov numbers once that run finishes; I will not report pass/fail coverage numbers before that artifact exists.

**Observed while waiting**: a large fraction of suites are failing with 5-18s per-test timeouts (e.g. `Users.unit.test.tsx`, `AccessTokensTab.credential-flows.unit.test.tsx`, `app-logout-confirm.unit.test.tsx`, `__measurements__/request-volume.measurement.test.tsx`). This looks environmental (real-timer waits expiring, possibly load from other agents' concurrent work on this shared machine, or a real unmocked-fetch hang) rather than something introduced by my inert measurement run. I have not diagnosed root cause — that is out of scope for a measurement task — but a suite-wide failure rate this high is itself worth flagging to the owner independent of the coverage question, since `reportOnFailure` coverage from a mostly-red suite is still real V8 execution coverage (code that ran, ran, regardless of assertion outcome) but is not evidence the assertions are meaningful.

**Not yet measured / explicit gaps so far:**
- Per-file line/branch/function numbers (Section 2) — blocked on the background run.
- Zero-coverage list (Section 3) — only the import-heuristic version exists; needs lcov cross-check.
- Assertion-density / "green but tolerates the bug" spot checks (Section 4 fully) — needs lcov to identify which files are even worth spot-checking first.
- `features/plugins/**` and `panels.tsx` — will re-check `git status` again immediately before finalizing, per dispatch instruction, since two other agents are actively editing there.
