# Fix: `build.sourceDir` may not name/nest/ancestor a generated theme directory

Date: 2026-08-17 · Agent: Sonnet subagent (`SourceDirGate`), ADS Programmer persona · Branch: `general-work`
Coordinator verification: independent (`git show --stat` on both commits, `npm run check:architecture`)

## The gap (was real, was open, was self-flagged in code)

`src/server/routes/admin/themes/explore.ts:570-571` named the missing fix in its own comment:

> "The deeper fix is a conformance rule forbidding `build.sourceDir` from naming a
> GENERATED_THEME_DIRS entry at install time — not attempted here, see the regression test."

A compiled theme's `build.sourceDir` could equal a `GENERATED_THEME_DIRS` entry (`"preview"`),
routing writes down the Explore sourceDir branch, whose extension allowlist has no notion of
generated directories. Only per-call-site refusals (added 2026-08-13, defense in depth) guarded it.
No install-time gate existed.

## The fix

New `isSourceDirGeneratedConflict(sourceDir)` in `src/features/theme/theme-files.ts`, placed next
to `isGeneratedThemePath` and **reusing its private `normalizeThemeRelativePath`** rather than
re-deriving path normalization. Wired into `loadTheme()`'s compiled-theme cross-field validation
block in `src/features/theme/theme.ts` (~line 647), alongside the three pre-existing
`build.source === "compiled"` checks, in the same shape and style.

Existing call-site refusals were NOT removed — this is an earlier layer, not a replacement.

### Scope chosen (3 shapes, reasoning documented in the code comment)

1. **Exact match** — `"preview"`.
2. **Nested inside** a generated dir — `"preview/src"`. Same "exact segment or under it" rule
   `isGeneratedThemePath` already applies to file paths.
3. **Ancestor of** a generated dir — `"."` (normalizes to `""`). This is the shape a naive
   `GENERATED_THEME_DIRS.includes()` would miss entirely: a root sourceDir puts `preview/` *inside*
   the declared source tree. Bare `""` was already caught by the pre-existing "sourceDir is required"
   falsy check, so `"."` is the one genuinely new shape closed here.

`"preview-notes"` is NOT flagged — same false-positive avoidance `isGeneratedThemePath` already has,
asserted by a negative-control test.

## RED proof (captured BEFORE the fix existed)

`node --import tsx --test src/features/theme/__tests__/theme-build-manifest.test.ts`, new tests only:

```
✖ build.source 'compiled' with sourceDir naming a generated directory exactly is invalid
  AssertionError: expected a sourceDir/generated-dir conflict error, got
  [...4 unrelated build-conformance artifact-hash errors, no sourceDir error...]
✖ build.source 'compiled' with sourceDir nested inside a generated directory is invalid
✖ build.source 'compiled' with sourceDir naming the theme root ('.') is invalid
ℹ tests 13 / pass 10 / fail 3
```

Fail-with-diff, not trivially-green: the theme was already invalid for an unrelated conformance
reason, but missing exactly the new asserted error string. Negative control passed from the start.

## Known hazard — investigated, did NOT break

`explore-built-theme-gate.test.ts` (~line 430-460) deliberately builds a compiled theme with
`sourceDir: "preview"` to exercise the sourceDir branch. Concern was the new rule flipping it to
`status: "invalid"` and breaking the test.

Traced: `findTheme`, `discoverAllBuiltInThemes`/`discoverThemes` never filter by `status`, and none
of PUT/copy/rename/reset in `explore.ts` ever read `theme.status` — they gate purely on
`manifest.build` + `isGeneratedThemePath`/`isThemeFileWritable`. `theme.status` is consulted only by
read-only listing (GET) and admin-picker/active-theme selection (`presentation/get.ts`,
`patch-active-theme.ts`, `active-theme.ts`), none of which that test touches.

Fixture now loads `status: "invalid"`, but the test asserts only HTTP status/code from the write
routes. Ran it: 18/18 green, unchanged, no fixture edit needed.

## Structural note — new circular module import (flagged, not a regression)

The fix required `theme.ts` to import from `theme-files.ts`, which already imports from `theme.ts`.
Safe because both new imports (`GENERATED_THEME_DIRS`, `isSourceDirGeneratedConflict`) are used only
inside `loadTheme`'s function body, never at module-eval time. Matches the existing function-body-only
cross-reference pattern between these two files.

**Coordinator-verified:** `npm run check:architecture` → **OK: at baseline**. 6 module cycles
(runtime-only), largest SCC 30, propagation cost 10.51% all-import / 2.31% runtime-only — all
unchanged from baseline. The new import did not move any ratcheted metric.

## Test commands run (all scoped, none full-suite)

| Command | Result |
|---|---|
| `node --import tsx --test src/features/theme/__tests__/theme-build-manifest.test.ts` | 13/13 pass |
| `node --import tsx --test src/features/theme/__tests__/theme-files.test.ts` | 31/31 pass |
| `node --import tsx --test "src/features/theme/__tests__/*.test.ts"` | 304/304 pass |
| `node --import tsx --test "src/server/routes/admin/themes/__tests__/*.test.ts"` | 28/28 pass |
| `npx tsc -p tsconfig.json --noEmit` | clean, exit 0 |
| `npm run check:architecture` (Coordinator) | OK: at baseline |

Also verified: no real `theme.json` on disk anywhere uses `build.source: "compiled"` (grep across
`src/themes`) — zero effect on any live theme today.

## Commits (independently verified via `git show --stat`)

| SHA | Message | Files |
|---|---|---|
| `6fadb101` | `test(theme): regression tests for build.sourceDir/generated-dir conflict gate` | 2 files, +102 |
| `45f5e219` | `fix(theme): refuse build.sourceDir that names/nests/ancestors a generated dir` | 2 files, +59 |

Both contain only the claimed files. `src/themes/static/basic/pages/index.html` (pre-existing,
unrelated, owner's) untouched and unstaged throughout.

## Status

Closed. This was punch-list item 2 of the Round 3 Addendum in
`ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`
("fix the sourceDir-collides-with-a-reserved-directory-name gap before schema v2 ships").
