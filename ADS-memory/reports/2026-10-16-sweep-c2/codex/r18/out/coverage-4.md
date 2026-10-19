TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests. Added 21 cases across five existing suites.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/use-post-editor-ui.hooks.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/security-i18n.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/skills/__tests__/skill-upload.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.unit.test.tsx

**PER FILE:**

- `pages-dependencies.hooks.ts`: No changes; remaining defaults are unreachable through its public surface.
- `use-post-editor-ui.hooks.ts`: Added toolbar missing/hidden More, absent ResizeObserver, uncached widths, gap fallback, opaque-frame cleanup, and settings-dialog lifecycle cases.
- `always-allow-rules.ts`: No changes; both handle fallbacks are unreachable under Jini’s contract.
- `security-i18n.ts`: Added generation-error interpolation at line 2058 and missing copy-reason fallback.
- `settings/rules.ts`: Added merge defaults, omitted fields, preserved disabled state, explicit blank labels, and input immutability assertions.
- `skill-upload.ts`: Added path precedence, empty content, empty selection, file-count boundary, aggregate size rejection, and missing manifest cases.
- `merge-term-section-dependencies.hooks.ts`: Added configured confirmation/execution failures with observable wizard-state assertions.
- `use-taxonomy.hooks.ts`: Existing suite was already modified by another agent and remains untouched; line 269 noted below.

**UNREACHABLE:**

- `pages-dependencies.hooks.ts:20,22`: Private `fakePage` always receives an overrides object containing an ID.
- `always-allow-rules.ts:46,51`: `buildAgentListHandles` returns one nonempty handle per input; both indexed fallbacks are unreachable.
- `use-taxonomy.hooks.ts:269`: Unreachable through the current supported Trash route: only terms have a blocker; taxonomy deletion cannot produce `TERM_HAS_CHILDREN`.

No branches were deleted or suppressed.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. **100% coverage remains unverified.** Read-only diff checks passed. No git state changes or commits were made.
