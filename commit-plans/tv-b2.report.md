Refactor(Execution): Five sheets are done; TV-AG0 stopped after partial cleanup.

| Sheet | Result and files touched |
|---|---|
| RD-T1 | **Done.** `serve-command-wiring.unit.test.ts` edited first, then `serve-listen.ts`; boot token bypasses the console logger. |
| TV-AG0 | **STOPPED, partial.** Removed 18 duplicates from `assistant-ag-ui-translate.test.ts`. Retained the wire file because Jini lacks its explicit null-content and missing-delta assertions. No production edits. |
| A62-T | **Done.** Reload component, refresh test and `ThemeExplore.tsx`; local bare control deleted. |
| B26-T1 | **Done.** Host binding/test, plugin composition, telemetry and hardwiring debt. Anchor updated **7 → 5**. |
| R6b-T | **Done.** Collection test, renderer, theme index and route imports; local collection leaf deleted. Uses `@jini-ai/cms/listing`. |
| B01-T | **Done.** Repointed 97 caller files, deleted eight leaves and three transferred suites, and removed twelve architecture-baseline edges. Uses the two culled transfer specifiers. |

The complete file inventory, refreshed anchors, counterpart mapping and cloud mutations are in [COMMIT-PLAN.md](SCR/c-tv-b2/COMMIT-PLAN.md).

No unlisted test importers required repointing, so no `REFRESH.md` entries were needed. No tests, builds, installs, type-checks, linters, mutations or Git writes were performed. Jini, dependencies and lockfiles remain untouched.
