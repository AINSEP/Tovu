# Fold `@jini-ai/ui-core` into `@jini-ai/ui` as `./core`

**Date:** 2026-08-01
**Repo:** `/Users/la/Programming/Jini` (pnpm workspace)
**Status:** Complete, uncommitted (left in the working tree per dispatch instructions)

## Summary

`packages/ui-core` is deleted. Its entire content — 13 settings-domain features'
framework-free halves, plus the settings-dialog-shell root files, the notifications sound
catalog, `icon-name.ts`, and `utils/{uuid,endpoint-policy}.ts` — now lives inside
`packages/ui/src/`, physically interleaved per `@jini-ai/ui`'s own pre-existing convention
(framework-free files at each feature's top level, React under `react/`). A new
`packages/ui/src/core.ts` is the aggregation entry point for the new `@jini-ai/ui/core`
subpath, and it is the **only** file that assembles "the old ui-core surface" back into one
barrel — every other file just has its imports pointing at the right sibling.

## What moved, and where

| ui-core location | New `@jini-ai/ui` location | Notes |
|---|---|---|
| `src/features/<name>/{types,constants,rules,ports,dependencies}.ts` (13 features) | `src/features/<name>/{same}.ts` | 1:1 move, sibling to that feature's existing `react/` folder |
| `src/features/<name>/index.ts` (13 files) | **deleted** | superseded — the feature's pre-existing `@jini-ai/ui` `index.ts` already had the react-side exports; its `from '@jini-ai/ui-core'` lines were rewired to point at the newly-local sibling files directly |
| `src/index.ts` (root barrel) | **deleted** | same reasoning; nothing needed it as a physical file, only the export shape it produced |
| `src/types.ts`, `src/rules.ts` (settings-dialog shell: `SettingsDialogTabMeta`, `findActiveTab`, `resolveInitialActiveTabId`) | `src/features/settings/dialog/{types,rules}.ts` | relocated (not identity-mapped) — these were always the framework-free half of `features/settings/dialog/`'s React shell, which already lives there |
| `src/notifications-catalog.ts` (sound catalog, distinct from the notifications *tab's* own state) | `src/features/notifications/notifications-catalog.ts` | relocated to sit next to the tab it's paired with |
| `src/icon-name.ts` | `src/icon-name.ts` | identity — package-wide, not feature-scoped, kept at root |
| `src/utils/{uuid,endpoint-policy}.ts` | `src/utils/{uuid,endpoint-policy}.ts` | identity — `@jini-ai/ui/src/utils/` already existed and had no name collision |
| `src/__tests__/**` (23 test files) | `src/__tests__/**` | identity move into `@jini-ai/ui`'s own pre-existing (but nearly-empty) `src/__tests__/` root — kept centralized rather than co-located per-feature (see "Test guard" below for why) |
| `README.md` | folded into `packages/ui/README.md` (new `## \`./core\`` section) | adapted framing from "separate package" to "subpath"; content (feature map, 3-surface boundary table, `DetectedAgent` drift warning) preserved verbatim |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | deleted | package retired, see below |

New file: `packages/ui/src/core.ts` — re-exports exactly what ui-core's own root
`src/index.ts` did, sourced from the new local paths. Deliberately does **not**
`export * from './features/<x>/index.js'` for anything — each feature's merged `index.ts`
also re-exports that feature's React components, which would defeat the whole point of a
React-free subpath. It lists the specific framework-free files by name instead, mirroring
ui-core's original barrel shape file-for-file.

## Export map / peer deps

`packages/ui/package.json`:
- New `"./core"` entry: `{"types": "./dist/core.d.ts", "import": "./dist/core.js", "default": "./dist/core.js"}`.
- `"@jini-ai/ui-core": "workspace:*"` removed from `dependencies`.
- `react`/`react-dom` added to `peerDependenciesMeta` as `{"optional": true}` (peer version
  ranges in `peerDependencies` unchanged), matching `packages/admin/package.json`'s existing
  `./core`/`./browser` split verbatim. `@excalidraw/excalidraw`/`lexical`/`@lexical/react`/
  `@lexical/utils` were already optional — untouched.
- `sideEffects: false` — already present, unchanged.
- Description extended to mention `./core`.

Verified at the build-output level, not just by inspection: walked `dist/core.js`'s full
transitive relative-import graph (38 files) after building and confirmed **zero** `react`/
`react-dom` imports anywhere in it.

## No-DOM test guard

Old mechanism: `@jini-ai/ui-core/vitest.config.ts` set no `environment` at all, so **every**
test in that package defaulted to Vitest's plain Node environment — any DOM-touching test
would fail loudly with no jsdom to silently catch it.

`@jini-ai/ui`'s own `vitest.config.ts` defaults to `environment: 'jsdom'` (most of the
package is React). Simply merging the two would have meant the ex-ui-core tests silently
started passing under jsdom, erasing the guard — the one thing the dispatch brief called out
as a hard "must not" (constraint 2).

Fix: added `environmentMatchGlobs` (a real Vitest 2.1.9 option, confirmed against the
installed package's type declarations before using it) to `packages/ui/vitest.config.ts`:

```ts
environmentMatchGlobs: [
  ['src/__tests__/features/**', 'node'],
  ['src/__tests__/utils/**', 'node'],
  ['src/__tests__/rules.test.ts', 'node'],
],
```

This is why the migrated tests were kept **centralized** under `src/__tests__/` (matching
ui-core's own layout 1:1) rather than co-located into each feature's `__tests__/` folder the
rest of `@jini-ai/ui` uses: co-locating would have put a `node`-only test and a
React-barrel-importing `jsdom` test as literal siblings in the same directory
(`features/execution/__tests__/rules.test.ts` next to the pre-existing
`features/execution/__tests__/index.test.ts`, which needs jsdom because it imports the
merged barrel), with no clean glob to tell them apart. Centralizing keeps the glob
unambiguous and — same as before — routes any **new** test added to that tree to `node`
automatically, not just the 23 files that exist today.

`packages/admin/vitest.config.ts`'s own comment referencing `@jini-ai/ui-core` by name (an
unrelated package, just citing it as a parallel precedent) was updated to reference
`@jini-ai/ui`'s `./core` subpath instead, so it doesn't point at a deleted package.

## A real bug this surfaced: framework-free files reaching into a merged (React-bearing) sibling barrel

Three ui-core-origin files (`features/memory/{ports,rules}.ts`) and ten migrated test files
imported their *own* feature's `index.ts` by relative path (a normal thing to do inside the
old ui-core, where every feature's `index.ts` was itself framework-free). After deleting
ui-core's own `index.ts` files, that same relative path started resolving to `@jini-ai/ui`'s
**merged** barrel, which also re-exports that feature's React components — silently pulling
React-bearing modules into what must stay the framework-free half, undetected by typecheck
(TS doesn't care that a `.ts` file transitively reaches a `.tsx` file) and only caught by
writing a script that walks the built `dist/core.js` import graph looking for `react`.
Fixed by rewriring each to the specific underlying file (e.g. `../connectors/types.js`
instead of `../connectors/index.js`). Confirmed clean via the same graph-walk verification
described above.

## The published `@jini-ai/ui-core` name

**Recommendation implemented: clean removal, not a deprecation-stub package.**

`packages/ui-core` had `publishConfig.access: public` and was on `0.1.2` — genuinely
published, so not silently orphaning it mattered. But it also had zero confirmed consumers
outside this workspace (only `@jini-ai/ui` depended on it, and `@jini-ai/ui` already
re-exported everything it had), and it's an early-stage (`0.1.x`) internal monorepo package.
Keeping a deprecation-stub package alive — versioned, built, and published indefinitely —
for a name nothing currently needs would recreate exactly the confusing 3-surface sprawl this
task exists to reduce, for no real protection (nothing is known to be depending on it).

Instead: `packages/ui-core` is deleted outright, and
`.changeset/fold-ui-core-into-ui.md` (bumps `@jini-ai/ui`: minor) records the removal and
instructs whoever runs the next release to follow up with:

```
npm deprecate @jini-ai/ui-core "Merged into @jini-ai/ui; import from '@jini-ai/ui/core' instead."
```

against the real npm registry — an operational action outside what a code change can do, but
now durably tracked rather than silently dropped.

## Test counts (fresh evidence, all commands re-run just before writing this report)

| Suite | Before | After |
|---|---|---|
| `@jini-ai/ui-core` (standalone) | 23 test files / 668 tests | — (package deleted) |
| `@jini-ai/ui` (pre-existing content only) | 409 test files / 5136 tests | — |
| `@jini-ai/ui` (merged) | — | **432 test files / 5804 tests, all passing** |
| Tovu `apps/admin` | 41 test files / 424 tests (stated baseline) | **41 test files / 424 tests, all passing** |

409+23=432 files and 5136+668=5804 tests — the merge accounted for exactly the pre-existing
content of both sides, nothing lost or duplicated.

Commands run, in order, all green:
```
cd /Users/la/Programming/Jini
pnpm --filter @jini-ai/ui run typecheck   # clean
pnpm --filter @jini-ai/ui run test        # 432 files / 5804 tests
pnpm --filter @jini-ai/ui run build       # clean; dist/core.js + dist/core.d.ts emitted
cd /Users/la/Programming/Tovu
npm --prefix apps/admin run typecheck     # clean
npm --prefix apps/admin run test          # 41 files / 424 tests (see note below)
cd /Users/la/Programming/Jini
pnpm run typecheck                         # clean, all 31 workspace packages
pnpm run guard                             # 2 violations — both pre-existing, see below
```

**Note on the Tovu run:** the first full-suite run showed `40 passed | 1 failed` — a
`findByRole` timeout in `src/sections/__tests__/Comments.unit.test.tsx`, a file with no
relation to any of the 13 migrated ui-core features. Re-run in isolation: passed (4/4). Full
suite re-run clean immediately after: 41/41, 424/424. Load-sensitive timing flake in an
unrelated pre-existing test, not a regression from this change — the run quoted above as
"after" is the clean one.

## `pnpm run guard`: 2 violations, both verified pre-existing

```
[guard] R8-package-metadata packages/admin/package.json: invalid jini.domain "admin"
[guard] R2-deep-path packages/ui/src/__tests__/utils/endpoint-policy.parity.test.ts: relative
  import "../../../../agent-runtime/src/providers/connection-guard.js" reaches into another
  package's src (agent-runtime) — import by package name instead
```

Verified against the committed baseline, not just asserted:
- `packages/admin/` is **entirely untracked** (`git show HEAD:packages/admin/package.json`
  → `fatal: path exists on disk, but not in 'HEAD'`) — pre-existing uncommitted
  work-in-progress this session never touched (only edited one comment line in its
  `vitest.config.ts`, unrelated to R8).
- The R2 violation's exact relative import string already existed verbatim in
  `packages/ui-core/src/__tests__/utils/endpoint-policy.parity.test.ts` as committed at
  `HEAD` — this session only relocated the file (same package-boundary-crossing import,
  same documented rationale in its header comment, preserved unchanged per the dispatch
  brief's "preserve the no-jsdom discipline" / move-not-redesign instructions). `pnpm run
  guard` was already failing on `main` for this reason before this session started; the
  `check-engine-boundaries.ts` rule has no carve-out for this pattern and this task wasn't
  the place to add one.

Neither is a regression introduced by this fold-in. Fixing either is a separate, unrelated
task (packages/admin's own metadata; and a real architectural decision — either grant R2 an
exception for this deliberate cross-package parity check, same shape as the two existing
`@jini-ai/agentic` exceptions, or move `connection-guard.ts`'s pure half somewhere both sides
can import by name).

## Deviations from the mechanical "just move + rewire" plan, with reasoning

1. **`packages/ui/src/features/connectors/index.ts` line 35** was a bare
   `export * from '@jini-ai/ui-core';` sitting below 34 lines that already explicitly
   re-exported every symbol from connectors' own `constants.ts`/`ports.ts`/`types.ts`. Its
   only *actually-reachable* effect was pulling in `rules.ts`'s ~29 functions (never
   individually listed); the rest was accidental over-export of the *entire* ui-core surface
   through one feature's barrel. Replaced with `export * from './rules.js';` — matching
   ui-core's own connectors barrel's wildcard shape. Confirmed zero externally-observable
   behavior change: `@jini-ai/ui`'s `exports` map has no `./features/connectors` subpath at
   all, so no consumer outside this package could have reached the over-exported content that
   way regardless.
2. Comment prose in ~15 files across `packages/ui`, plus 3 in `packages/agent-runtime`
   (`connection-guard.ts`) mentioning `@jini-ai/ui-core`/`ui-core` by name, or asserting
   "this package ships zero dependencies" (true of the old package, false of `@jini-ai/ui`),
   updated to reference the new local file paths / accurate claims. Not code behavior, but
   left uncorrected they'd point at a deleted package.
3. One doc-comment edit (`i18n/dictionaries/settings-dialog.en.ts`) accidentally introduced a
   literal `*/` inside a glob-shaped path reference (`features/*/rules.ts`) that closed the
   enclosing block comment early, breaking the parser. Caught by the first typecheck run and
   reworded to avoid the substring.

## Files most worth reading

- `/Users/la/Programming/Jini/packages/ui/src/core.ts` — the new `./core` entry point
- `/Users/la/Programming/Jini/packages/ui/README.md` (`## \`./core\`` section) — feature map,
  3-surface boundary table, `DetectedAgent` drift warning
- `/Users/la/Programming/Jini/packages/ui/vitest.config.ts` — `environmentMatchGlobs` +
  comment explaining the centralized-vs-co-located test-tree decision
- `/Users/la/Programming/Jini/packages/ui/package.json` — `./core` export,
  `peerDependenciesMeta` for react/react-dom
- `/Users/la/Programming/Jini/.changeset/fold-ui-core-into-ui.md` — release note + the
  `npm deprecate` follow-up instruction

## Not done (explicitly out of scope, not silently dropped)

- Did not fix either pre-existing `pnpm run guard` violation (see above).
- Did not add coverage-threshold carve-outs for the newly-arrived core files the way
  `vitest.config.ts`'s existing exclude list does for some interface-only files (it already
  had entries for `connectors/{ports,types}.ts`, `memory/{ports,types}.ts`,
  `source-config-list/{types,ports}.ts` pre-declared — apparently written in anticipation of
  this exact migration — but not for the other 8 features' `types.ts`/`ports.ts`). `pnpm test`
  (no `--coverage`) doesn't enforce thresholds, so this doesn't block the requested
  verification, but whoever next runs `test:coverage` on this package may need to extend that
  exclude list or accept a coverage-percentage move.
- Did not commit anything, per instructions.
