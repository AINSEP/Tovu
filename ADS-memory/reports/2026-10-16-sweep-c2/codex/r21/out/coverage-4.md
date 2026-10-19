TDD(Direct): Selected TDD for behavior-focused coverage tests; persona loaded. Added 14 test cases without changing production code.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/dock-header.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/use-selected-agent-auth-warning.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/components/TemplateSource/__tests__/use-template-source.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/database/__tests__/use-schema-state-section.wired.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx

PER FILE:

- `DockHeaderTip.hooks.ts`: injected controller at line 17; Escape while open/closed and other keys at line 42; focus/blur behavior.
- `use-routed-a2ui-surface-card.hooks.ts`: dismissal reset at line 132; non-object action guards and malformed surface bodies.
- `use-selected-agent-auth-warning.hooks.ts`: default port at line 35, stale rejection at line 50, detection fallback at line 62.
- `template-source-dependencies.hooks.ts`: omitted options and empty HTML fallback at lines 34/38.
- `ai-assistant/rules.ts`: no additions; remaining fallback identified below.
- `use-dashboard.hooks.ts`: dismissal before password status settles, line 217; verifies no persisted dismissal and later banner visibility.
- `use-schema-state-section.hooks.ts`: wired entry point, line 77. Separate suite preserves the existing suite modified by another agent.
- `use-timeline-section.hooks.ts`: stale rejection guard at line 188; verifies current rows, cursor, error, and loading state survive.

UNREACHABLE:

- `/Users/la/Programming/Tovu/apps/admin/src/features/ai-assistant/rules.ts:209`: `?? DEFAULT_PROVIDER_PRESETS[0]` cannot execute with the supported fixed roster, which contains Anthropic. Left unchanged for the owner’s decision.

NOT DONE:

- Tests, typecheck, builds, and coverage were not run, as instructed. Achieved percentages remain unverified.
- No commits or git state mutations. Jini remained read-only.
