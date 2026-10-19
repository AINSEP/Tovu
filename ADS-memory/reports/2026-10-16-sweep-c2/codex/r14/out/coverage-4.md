TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests. Extended five suites and created one port suite because the existing post-hook suite was already modified by another worker.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/AgentFailureCard.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/use-theme-canvas-styling.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/post-editor-dependencies.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/tool-registrations.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/webmcp/__tests__/published-site.test.ts

**PER FILE:**

| Source | Coverage work |
|---|---|
| `content-duplication/tool-registrations.ts` | Existing tests already exercise validation, dispatch, permissions, and empty/nonempty resource lists; no duplicate tests added. |
| `newsletter/campaign.ts` | Existing characterization suite covers all 196 status/tier combinations; unchanged. |
| `newsletter/repo.ts` | Added missing-counter initialization with persisted-state assertions across both dialects. |
| `sites/tool-registrations.ts` | Added absent capability reader, default workspace/readers, missing serving directory, install-directory binding, and classified/unexpected copy failures. |
| `webmcp/published-html.ts` | Added nested templates, script-marker attribute ordering, uppercase body closure, and adopted attributes without source ranges. |
| `AgentFailureCard.hooks.ts` | Added malformed persisted data, reason fallback, streaming/success suppression, default context, missing hints, inventory races, and unavailable-agent rejection. |
| `use-theme-canvas-styling.hooks.ts` | Targets lines 329–331; adds unusable tokens, non-string token values, obsolete requests, and late rejection. Corrected the existing late-success test so both token requests settle. |
| `post-editor-dependencies.hooks.ts` | Targets lines 19 and 142; adds real preview URLs, row replacement, mismatched-ID guards, and stored-title slug fallback. |

**UNREACHABLE:**

- [newsletter/repo.ts:464](/Users/la/Programming/Tovu/apps/website/src/features/newsletter/repo.ts:464): SQL `COUNT(*)` without grouping always returns a row with a non-null count; the absent/null fallback cannot arise normally.
- [published-html.ts:18](/Users/la/Programming/Tovu/apps/website/src/features/webmcp/published-html.ts:18): A marked script has a source location when parsed with location tracking enabled.
- [use-theme-canvas-styling.hooks.ts:298](/Users/la/Programming/Tovu/apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts:298): Cleanup and settlement clear the timer before its callback could observe `cancelled` or `settled`.

These guards remain unchanged for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. **100% coverage remains unverified.** No production files, prohibited paths, or git state were changed. Scoped whitespace checks passed.
