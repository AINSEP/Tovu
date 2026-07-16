# Project Memory

Use this file for stable project-specific conventions, constraints, gotchas, and patterns.

## Entries

- 2026-07-15: Test naming/directory convention — this repo's pre-existing `src/**/__tests__/*.test.ts`
  files (e.g. `src/core/commands/__tests__/`, `src/identity/__tests__/`) use flat `.test.ts` naming
  with `node:test` + `node:assert/strict`, no `unit`/`integration` subdirectories, and flat `test(...)`
  blocks (not `describe`) with spec-ref-bearing names and a file-header docstring citing the spec/ADR.
  Contract-test suites that run the same behavior against multiple adapters (e.g. `repo.contract.test.ts`)
  use a `run<X>Suite(adapterName, makeInstance)` parametrization helper called once per adapter.
  Starting with the SPEC-016/017/018/019/020 pipeline dispatch (2026-07-15), NEW pipeline-numbered
  feature work uses the AI Dev Shop-mandated `__tests__/unit/*.unit.test.ts` and
  `__tests__/integration/*.integration.test.ts` convention (per Coordinator dispatch instruction and
  the `test-design` skill's default absent a prior recorded override) so pipeline test provenance is
  unambiguous going forward. Both conventions coexist: legacy tests are not being renamed. Import
  style, assertion library (`node:assert/strict`), and the flat-`test()`-with-spec-ref-names /
  file-header-docstring idiom are preserved for new tests regardless of which directory convention
  applies. Test runner: `node --import tsx --test "src/**/*.test.ts"` (see `package.json`); coverage
  via `node --experimental-test-coverage` writing `coverage/lcov.info` — no c8/istanbul dependency
  exists in this repo.
