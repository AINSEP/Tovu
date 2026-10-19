TDD(Direct): Loaded the TDD persona to add behavior-focused coverage tests. Added 14 cases across eight existing suites and one chart import seam.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/__tests__/push-to-talk-state.hooks.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/webmcp/__tests__/admin-page-approval.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-assistant-chats.resume-last.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-external-entry-refresh.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/hooks/__tests__/use-list-table-cell-labels.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/integrations/chart-providers/__tests__/use-chart-registry.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts
/Users/la/Programming/Tovu/apps/admin/src/integrations/jini-admin/__tests__/forms-ports.unit.test.ts
```

**PER FILE:** Intended coverage, pending execution.

- `push-to-talk-state.hooks.ts`: cancelling indicator, including its label, announcement priority and recording flag. Line 123 remains unreachable.
- `admin-page-approval.store.ts`: line 12’s default UUID generation; matching approval executes once and rejects replay.
- `use-agent-screen-context.hooks.ts`: lines 40–41’s omitted slug/status branches; strict assertions verify old metadata disappears.
- `use-assistant-chats.hooks.ts`: line 66’s exported helper, covering restore, forget and both keep outcomes. The first-message forwarding branch remains unreachable.
- `use-external-entry-refresh.hooks.ts`: dismissal without a loaded entry, background-check guard, later conflict notification and hiding notifications while unloaded.
- `use-list-table-cell-labels.hooks.ts`: missing column-label fallback and an empty table head. Null `textContent` remains unreachable.
- `use-chart-registry.hooks.ts`: lazy loader at current line 42, rendered output, teardown, unrelated settings and unknown refresh scope. Injects native import through Jini’s existing loader.
- `forms-ports.ts`: line 28’s navigation adapter, default options, query preservation and history replacement.

**UNREACHABLE:**

- [push-to-talk-state.hooks.ts:123](/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/push-to-talk-state.hooks.ts:123): default follows every valid `PushToTalkStatus`.
- [use-list-table-cell-labels.hooks.ts:21](/Users/la/Programming/Tovu/apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts:21): native header cells return string `textContent`, including empty strings.
- [use-assistant-chats.hooks.ts:55](/Users/la/Programming/Tovu/apps/admin/src/hooks/use-assistant-chats.hooks.ts:55): both installed Jini creation paths supply `{}`; this private adapter cannot receive a defined `firstMessage`.

All retained for owner review.

**NOT DONE:** Tests, typecheck, builds, coverage and package scripts were not run, as instructed. No git state changes or commits. `git diff --check` passed; 100% coverage remains unverified.
