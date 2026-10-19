TDD(Direct): Loaded the TDD persona for test design. Added 37 test cases across 12 test files; measured 100% coverage remains unverified.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/agent-failure.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/agent-failure-transport.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/core/events/__tests__/memory-bus.test.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/core/events/__tests__/outbox-repo.contract.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/comments/__tests__/agent-tools.trash-confirmation.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/comments/__tests__/tool-registrations.model-facing-errors.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/comments/__tests__/tool-registrations.update-settings-validation-status.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.dialects.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/unsubscribe.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/webmcp/__tests__/embed-annotations.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts
```

**PER FILE:**

- `navigation/html-render.ts`: Added unavailable-parent, null-target, attribute escaping, new-tab security, explicit rel, empty-menu, and sanitized-URL cases.
- `newsletter/unsubscribe.ts`: Added missing-token-part rejection and verified-origin default/nondefault ports with base paths. Duplicate decoder guard remains unreachable.
- `AssistantDock/agent-failure.ts`: Added rejected reattachments covering lines 158–160, primitive rejections, successful completion, checkpoint fallbacks, malformed events, and optional hint cases.
- `events/memory-bus.ts`: Added repeated unsubscription preserving other handlers, resubscription, and unknown outbox settlement. Private-map fallback remains unreachable.
- `web-screenshot/playwright-page-capture.ts`: Added default launcher, invalid/fractional heights, null navigation response, scroll failure/timeout, safe error messages, cancellation, and missing screenshot capability.
- `headless-browser/playwright-loader.ts`: Added coverage for loading, launch options, argument copying, context/page creation, routes, WebSockets, cookies, and closure. Only external Playwright is module-mocked.
- `comments/tool-registrations.ts`: Added nullable settings, incorrectly typed optional fields, conflicts without versions, disappearance before trash write, and persisted moderation notes.
- `entries/unreadable-owner-entries-repair.ts`: Added default boot options on SQLite/PGlite, checking completion markers, survivor preservation, and unchanged watermark.

**UNREACHABLE:**

Current source locations; none deleted or artificially exercised:

- `newsletter/unsubscribe.ts:75`: Its sole caller already rejects the identical missing-token-parts condition.
- `events/memory-bus.ts:55`: The nullish fallback cannot occur through the public API; subscription creates the map entry and nothing deletes it.
- `AssistantDock/agent-failure.ts:114`: Projecting this assistant message always supplies an events array, making `?? []` unreachable.
- `AssistantDock/agent-failure.ts:136`: `errorEvent` is a status event behind a truthiness guard; the optional-chain fallback and non-status outcome cannot occur.
- `entries/unreadable-owner-entries-repair.ts:82`: Every current `entries` trash registration has a scope whose column is `"type"`.
- `web-screenshot/playwright-page-capture.ts:130`: The supplied browser-close callback has no caller in the installed renderer.
- `web-screenshot/playwright-page-capture.ts:177`: The owned browser pool absorbs close failures, so this rejection callback cannot run.

**NOT DONE:**

Tests, typechecks, builds, coverage, and package scripts were not run, as instructed. Only static review and whitespace checking were performed. The verifying agent must establish coverage results; unreachable-code dispositions remain with the owner. No production code, Jini files, or git state was changed.
