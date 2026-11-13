### <repo>:<path>
<!-- One fragment per source file. File name: parts/<repo>/<path with "/" replaced by "__">.md
     Keep it tight (15-40 lines). Name declarations and statement anchors, never bare line numbers:
     an anchor is the statement's first line as `outline.mjs` prints it (lines drift, names don't).
     Line numbers may appear only as "(~L120)" hints next to an anchor. -->
- **Over:** file <N> lines · `<fn>` <n> · `<fn2>` <n>
- **Phase:** now | after-move (<survey label, short>) · **Batch:** size-NN
- **Tests:** `<test file>` [, `<test file>`] — or "none import it directly; smoke = `<nearest test>`"
- **Responsibility map** (every top-level declaration over ~10 lines lands in exactly one row):

| unit | declarations / statements | job |
|---|---|---|
| A | `foo`, `Bar` (type), `BAZ` | <one line> |

- **Splits** (in execution order; each step leaves tests green):
  1. NEW `<sibling file>` — job: <one line>. Moves: `a`, `b`, type `T`. Exports: `a`, `T`. Imports nothing from the original.
  2. HELPERS in `<fn>` (same file, above it): `stepName({ x, y }: StepNameInput): R` ← statements from `<anchor>` through `<anchor>` (returns `<what>`; `<fn>` keeps `<what>`) · `step2(...)` ← ...
  3. SUB-HOOK `useXxx({ ... }): { ... }` in `<file>` ← the state/effects `<anchors>`.
- **Importers to update:** `<path>` (`a`), ... — or "none outside the file".
- **After:** original ~<N> lines; `<fn>` ~<n>; new files ~<n> each.
- **Risks / notes:** <test mocks of the old path, ordering-sensitive effects, closures over refs, cycles avoided by ...>
- **Owner exception candidate:** <only if no responsibility split exists — say why; otherwise omit this line>
