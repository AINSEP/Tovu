# M26SI sheet 10 — Tovu plugin bindings

Scope: sheet 10 only; Jini screen changes already exist on origin/codex/m26si-plugj. Keep Tovu bindings declarative and import the original components from existing public subpaths. No Jini edits, theme changes, new contexts, wrappers or behavior changes.

Completed work in commit order (coordinator commits; leave this file uncommitted):

1. Add plugin kit binding regression tests before production changes.
   - `apps/admin/src/features/plugins/__tests__/plugins-kit-bindings.unit.test.ts`
   - Cases: AgentPlugins supplies the six required original components; Plugins supplies the nine required original components, including the same PluginRulesProvider export.
   - Named mutation: remove any named kit field from its Tovu binder, or replace its original component with a different component. The corresponding component identity assertion must fail.
   - RED/GREEN execution deferred to coordinator; all test/check execution prohibited by dispatch.
2. Supply sheet 10 components in both Tovu binders and the existing shared screen fixture.
   - `apps/admin/src/features/plugins/AgentPlugins.tsx`
   - `apps/admin/src/features/plugins/Plugins.tsx`
   - `apps/admin/src/features/plugins/__tests__/plugin-host-deps.ts`

Pattern: existing `kit` object shorthand bindings; approved sheet 10 supplies the exact field names and original public modules. No additional pattern approval is needed under the dispatch.

Completion: both units implemented in the order above. Read the final diff and the new regression file; every addition is required sheet 10 wiring or its regression coverage. Deletions: none; no out-of-scope additions required removal.

Sheet disposition:
- Sheet 10: Tovu wiring complete; Jini implementation skipped because it is already present on origin/codex/m26si-plugj and belongs to the Jini half.
- Sheets 1–9 and 12: not built; outside this build-only dispatch.
- Sheet 11: explicitly excluded by coordinator; requires a prohibited build.
- No assigned step blocked.

Verification: source and diff inspection only. No installs, builds, tests, typechecks, linters or guards ran. Regression failures before wiring and passing results afterward remain unverified. Existing public exports were confirmed against the named Jini branch. No commits, pushes or .git writes performed.
