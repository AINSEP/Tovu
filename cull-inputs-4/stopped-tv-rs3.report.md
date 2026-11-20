- **DONE, edits unverified:** AP-T-SPLIT, AP-T, C08-SPLIT, C08.
- **STOPPED B02:** unlisted production re-export at `apps/website/src/features/deployments/index.ts:91`.
- **SKIPPED:** D02-SPLIT and D02; tv-tq is not an ancestor of HEAD.
- **STOPPED M5-T:** routing would raise the handler’s manually counted complexity from 10 to 12 at `browser-analytics-http.ts:21`. All M5-T drafts were removed.

Files retained in the final diff, using the brief’s `S` and `R` prefixes:

- `S/SiteAssistantWidget.tsx`, `S/SiteToolConfirmation.hooks.ts`, `S/vanilla-tool-confirmation.ts`, `S/vanilla-host.ts`, `S/site-chat-i18n.ts`, `S/tool-confirmation.ts`
- `S/__tests__/SiteToolConfirmation.hooks.test.ts`, `S/__tests__/vanilla-tool-confirmation.test.ts`
- `R/site-deps/identity-settings.ts`, `R/site-deps/__tests__/identity-settings.characterization.unit.test.ts`, `R/memory-deps/slices/site-title-settings.ts`
- [COMMIT-PLAN.md](SCR/c-tv-rs3/COMMIT-PLAN.md)

M5-T files drafted then restored/deleted: `R/browser-analytics-http.ts`, `R/browser-diagnostics.ts`, their two unit-test files, `site-cookie-consent.ts`, and `declared-consent.unit.test.ts`. Exact paths and deletions are recorded in the plan.

No `REFRESH.md` entries. C08’s stale characterization URL remains as the cull directs. The B02 edge and M5-T complexity conflict are recorded as uncovered constraints.

Tests, builds, linters, type checks, mutations, and Chrome checks were not run. AP-T’s Chrome look remains owed. No commits or pushes were made because the dispatch makes `.git` read-only.
