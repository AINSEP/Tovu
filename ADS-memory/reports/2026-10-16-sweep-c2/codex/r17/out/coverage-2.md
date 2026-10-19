TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests. Changed tests only; no tests, builds, typechecks, coverage commands, package scripts, or git mutations were run.

**CHANGED FILES:**
```text
/Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/web/__tests__/tool-registrations.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/consent/__tests__/adapters.test.ts
/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/__tests__/composer-skills.typing-renders.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/components/InstallTabCard/__tests__/use-zip-drop.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/components/__tests__/media-content-rules.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/integrations/__tests__/use-integrations.unit.test.tsx
```

**PER FILE:**

- `playwright-site-preview-capture.ts`: Added default Playwright loading, real Sharp JPEG resizing, browser cleanup, and default warning tests.
- `web/tool-registrations.ts`: Added injected clock/limiter/observer and default clock/logging tests. Existing tests cover handler branches.
- `platform/html/slug.ts`: No additions needed: existing tests exercise all current behavior; current implementation contains no conditionals.
- `consent/settings.ts`: Added missing-definition fallback, malformed enabled/copy/region values, explicit opt-in, oversized policy version, and default/explicit argument cases.
- `composer-skills.hooks.ts`: Added selection replacement, unrelated field events, absent host/textarea/handle, send guards, and DOM removal during insertion.
- `use-zip-drop.hooks.ts`: Added drag leave, unlocked/locked drops, locking during drag, ordered files, and empty drops.
- `media-content-rules.ts`: Added malformed records, legacy conversion without a library, negative reorder index, empty slug validation, and stashed HTML.
- `integrations-dependencies.hooks.ts`: Added resume and unknown-ID failure tests with unchanged-store assertions. Concurrent edits were preserved.

**UNREACHABLE:**

- [settings.ts:37](/Users/la/Programming/Tovu/apps/website/src/features/consent/settings.ts:37): Non-string side after validation—every remaining fallback is a string.
- [use-zip-drop.hooks.ts:27](/Users/la/Programming/Tovu/apps/admin/src/components/InstallTabCard/use-zip-drop.hooks.ts:27): `files ?? []` fallback—browser `DataTransfer.files` is always a `FileList`.
- [composer-skills.hooks.ts:70](/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts:70): Null-handle side—prior guard establishes the handle, and the installed `flushSync` invokes its callback synchronously before flushing.

All remain intact for the owner’s decision.

**NOT DONE:** Execution and measured confirmation of 100% coverage remain with the verifying agent. No coverage exclusions or fabricated branch tests were added.
