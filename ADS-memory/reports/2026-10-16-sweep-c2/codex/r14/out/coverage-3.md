TDD(Direct): Chose the TDD persona for behavior-based coverage gap tests.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/website/src/platform/markdown/__tests__/frontmatter.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/oauth/__tests__/endpoint-safety-adapter.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/server-logs/__tests__/unit/log-file.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/sites-config.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/trash/__tests__/trash-dependencies.unit.test.ts
```

**PER FILE:**

Added tests target these paths; execution remains pending.

- `frontmatter.ts`: empty/whitespace values, missing fallback fields, fallback normalization, and empty/scalar/sequence YAML roots.
- `endpoint-safety.ts`: password-only endpoint credentials and unreachable-provider errors whose causes are absent, native errors, or other OAuth errors. Defensive paths below remain.
- `log-file.ts`: writes after sink failure, each entry-validation rejection, rotated-only logs, exhausted byte budgets, disappearing files, and default filesystem missing-file behavior.
- `use-edit-media-panel.hooks.ts`: metadata setters, blank CSS/attributes/dimensions, unchanged-save cancellation (248–249), and absent user-list capability. Existing clipboard failure/timer cases retained.
- `use-media.hooks.ts`: upload close callback (282), missing/empty chooser states, removed input during upload, absent purge confirmation, and preservation of newer state when an older purge finishes.
- `use-sites-config.hooks.ts`: load failure (30), Error/string failures, recovery, obsolete read settlements, warning-free remedies, and default arguments/port.
- `use-term-picker.hooks.ts`: unmatched suggestion fallback (189–190), missing taxonomy/name, IME guards, and pending-create state.
- `trash-dependencies.hooks.ts`: live restore/purge request contracts and configured fake restore/purge/user-list failures. Existing hook tests already exercise live list/user reads.

**UNREACHABLE:**

In `/Users/la/Programming/Tovu/apps/website/src/platform/oauth/endpoint-safety.ts`:

- `:39` — non-Jini error rethrow: the current guard converts supported validation failures to Jini OAuth errors.
- `:64` — non-OAuth rethrow: the inner wrapper emits the same re-exported OAuthError class.
- `:160` — `continue` follows a `never`-returning function that always throws.

Left intact for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. Per-file 100% coverage is unverified. No production code or git state was changed. Read-only `git diff --check` passed.
