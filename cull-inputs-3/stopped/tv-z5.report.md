Completed 6 sheets: **19 catch replacements across 16 source files**. B02 is STOPPED; all five files remain untouched.

All paths below are under `apps/website/src/`. Ledger keys are `(path, catch-reads-error)`; reductions await combine verification.

| Sheet | Result and files touched | Expected reduction |
|---|---|---:|
| B01 | DONE — `assistant/{assistant-vault,runtime-preferences,tool-approval-policy}.ts`, `contracts/core/operator-locale.ts` | 1 each; **4** |
| B02 | STOPPED — `assistant/tool-search-keywords.ts:28–29`: moving guarded `optional.sources` verbatim into a callback loses narrowing; avoiding an assertion requires an unlisted capture/rewrite. No files touched. | **0**; 8 retained |
| B03 | DONE — `cli/commands/owner-store.ts`, `features/webhooks/site-key-sources.ts` | 1 each; **2** |
| B04 | DONE — `features/analytics/forwarding.ts` | **1** |
| B05 | DONE — `features/publish-content/{composite-blob-source,raw-file-contributor,raw-row-contributor,seed-hash}.ts`, `features/site-export/public-origin-policy.ts` | 1, 1, 2, 2, 1; **7** |
| B06 | DONE — `features/sites/site-preview/site-preview-store.ts`, `features/theme/theme-preview-image.ts`, `features/theme/validation/validate-theme-package.ts` | 2, 1, 1; **4** |
| C06 | DONE — `server/inbound/admin-http/routes/publish-content/apply-report.ts`; route remains advisory | **1** |

Per-sheet ledger entries and catch-restoration mutations are in [COMMIT-PLAN.md](SCR/c-tv-z5/COMMIT-PLAN.md). [REFRESH.md](SCR/c-tv-z5/REFRESH.md) records B02’s stop and C06’s expected importers; no import repoints were needed.

Zero tests added or changed. No tests, builds, type checks, linters, or gates run. Diff re-read found nothing extraneous to delete. No commits, package/lock edits, or Jini changes.
