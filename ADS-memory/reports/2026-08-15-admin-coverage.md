# apps/admin Coverage Report — 2026-08-15

**Head SHA measured:** `4315a064175d92a13bf353ae1320b8c50de71d81`
**Producer:** TestRunner (coverage report only — changed-code attribution belongs to Code Inspection per `changed-code-coverage.md`)
**Tool:** vitest v8 provider (`apps/admin/vitest.config.ts`), `reporter: ["text", "lcov"]`

## Context: concurrent-mutation environment

Two other agents were mutating `apps/admin` source/tests throughout this run (TDD-section6-fixes on
six named test files; TestRunner-negverify running injection-seam mutation tests across ~37 files).
Guard protocol: `git status --short -- apps/admin` immediately before and after every set; any set
whose dirty-file set changed, or that had unexpected dirty files outside the known baseline, is
discarded and re-run. First guard trip (set1) confirmed the mutation sweep churns broadly across the
whole admin tree within a ~80s window (themes/ → deployment/ between before/after), not confined to
one file — so every set here carries real collision risk, not just sets that share a name with the
known six.

Known-clean baseline (pre-existing, expected dirty throughout):
- `src/__measurements__/request-volume.measurement.test.tsx`
- `src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`
- `src/features/playground/__tests__/Playground.unit.test.tsx`
- `src/features/plugins/__tests__/AgentPluginBundle.unit.test.ts`
- `src/features/plugins/agent-plugin-source-catalog.ts`
- `vitest.config.ts`

## Chunking scheme (22 sets)

Non-feature (4): `__tests__/+__measurements__/+styles/`, `components/`, `hooks/`, `lib/`
Feature, standalone (10): `collections/` `widgets/` `plugins/` `taxonomy/` `posts/` `pages/` `deployment/` `comments/` `media/` `forms/`
Feature, paired (8): `users/+themes/` `settings/+seo/` `integrations/+ai-assistant/` `redirects/+recovery/` `menus/+database/` `dashboard/+roles/` `workspace/+playground/+members/` `authentication/+auth/+analytics/+commerce/`

## Per-set results

Raw artifacts under `ADS-memory/.local-artifacts/coverage/<set>/` (lcov.info + text summary), gitignored per policy.

| # | Set | Guard | Tests | Coverage (L/B/F/S) | Notes |
|---|-----|-------|-------|---------------------|-------|
| 1 | `__tests__/+__measurements__/+styles/` | **TRIPPED — discarded** | 98 pass / 4 fail | not recorded | dirty-set changed mid-run (themes→deployment); 4 failures traced to mutated source (execution-settings.ts:319, AssistantDock.hooks.tsx:203) |
| 2 | `components/` | **TRIPPED — discarded** | not captured | not recorded (raw: `set02-components/lcov.info` shows 93.71% lines / 89.36% branch / 90.71% funcs scoped to `src/components/`, 27 files) | dirty-set changed mid-run (3 `features/deployment/*` files present before, gone after — mutation reverted there) |
| 3 | `hooks/` | **TRIPPED — discarded** | not captured | not recorded (raw: `set03-hooks/lcov.info` shows 94.9% stmts / 84.14% branch / 93.18% funcs / 97.27% lines scoped to `src/hooks/`, 7 files) | dirty-set changed mid-run (`features/integrations/hooks/use-integration-deliveries.hooks.ts` appeared — no plausible import relationship to `src/hooks/` unit tests, but not treated as a pass per strict guard) |

## Status: paused for direction (mid-run)

3 of 3 attempted sets guard-tripped. The mutation sweep (TestRunner-negverify, ~37 files) appears to
churn continuously across the whole `apps/admin` tree, not one file at a time, and each vitest run
takes ~60-90s wall-clock regardless of set size (jsdom/transform/environment boot overhead dominates
over test count). At this collision rate, essentially no set survives a first attempt under the
strict "any dirty-file-set change discards the run" rule. Paused after set3 to get an explicit call
from team-lead on how to proceed (keep grinding through retries / hold until the sweep reports done /
relax the guard when the diff shows zero plausible file overlap). Sets 1-3's raw artifacts are kept
either way — see paths above. Remaining 19 sets not yet attempted.

(table continues once resumed)
