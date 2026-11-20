J1–J8 done in order; J8 was last. No sheets stopped.

| Sheet | Files touched | Existing witness → combine mutation | Removed ordinal |
|---|---|---|---|
| J1 | `region-editor.controller.ts` | `region-editor.controller.unit.test.ts:76,85` → drop success update; remove rejection handling | 46 |
| J2 | `attachment-liveness.ts` | `delivery-and-liveness.test.ts:107,126` → accept non-2xx; propagate rejection | 128 |
| J3 | `date-label.ts` | `date-label.unit.test.ts:58–66` → remove normalization; propagate rejected read | 191 |
| J4 | `live-session-state.ts` | `live-session-state.test.ts:41–49` → propagate `SyntaxError` | 241 |
| J5 | `adapter.react.tsx`, `adapter.tanstack.tsx` | `fetch-query.test.tsx:528,588` → remove observation per adapter; return settlement promise | 512, 513 |
| J6 | `repo.memory.ts` | `ledger-contract.ts:864–880` via memory suite → `tail = run`; return settlement promise | 209 |
| J7 | `registration-cache.ts` | `dynamic-registration.test.ts:177` → bypass wait; directly await rejected pending work* | 407 |
| J8 | `scripts/error-gate-debt.json` | Parent/candidate gate comparison pending → restore assigned catch with key deleted | 13 stale keys below |

J8 stale ordinals: **9, 21, 22, 90, 91, 96, 103, 243, 258, 259, 505, 506, 527**.

Verified deletion-only ledger changes: **21 keys / 27 findings removed**; surviving values and order are identical.

Added eight entries to [COMMIT-PLAN.md](SCR/c-dj-jini/COMMIT-PLAN.md), including exact paths and removed file/rule keys. Out-of-scope deletions: **none**.

No tests, mutations, builds, installs, type checks, linters, or git writes ran. No changesets, `lookup` binding, or new tests were added.

*The rejected-write mutation needs the culled test scenario; the existing J7 witness covers successful-write ordering.*
