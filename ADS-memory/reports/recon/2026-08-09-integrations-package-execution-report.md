# `packages/integrations/` execution report — composio + media-providers

**Date:** 2026-08-09
**Author:** Programmer (Agent Direct Mode dispatch)
**Status:** Executed, uncommitted (left in working tree for review per brief)
**Repo:** Jini = `/Users/la/Programming/Jini`, branch `refactor/jini-admin-extraction`

This is the execution counterpart to `2026-08-09-external-integrations-package-proposal.md` in
this same directory. Read that recon first for background — but its recommendation ("one package,
`@jini-ai/external-integrations`, composio only, don't touch `@jini-ai/media`") was **superseded**
by the repo owner's direct instruction covered in the dispatch brief for this task: two separate,
independently-publishable packages (`@jini-ai/composio` and `@jini-ai/media-providers`), both
grouped under a new `packages/integrations/` umbrella directory, with `@jini-ai/media` renamed and
relocated too. Do not read that earlier proposal as the current decision — this report is.

## What moved

1. **`@jini-ai/composio`** — `git mv packages/admin/src/server/composio` →
   `packages/integrations/composio/src` (whole-directory move, flattened so the package root IS
   composio — no nested `src/composio/`). New `package.json` (name `@jini-ai/composio`, version
   `0.2.1` continuing from its last published state, `jini.domain: "integration"`,
   `jini.kind: "vendor-connector-gateway"`), `tsconfig.json`, `vitest.config.ts` (100%
   statement/branch/function/line coverage, package-wide). `packages/admin/src/server/index.ts`
   deleted; `packages/admin/src/server/` no longer exists.
2. **`@jini-ai/media-providers`** — `git mv packages/media` → `packages/integrations/media-providers`
   (whole-directory move). `package.json` edited: name → `@jini-ai/media-providers`,
   `repository.directory` → `packages/integrations/media-providers`, `jini.domain`:
   `"capability"` → `"integration"`, `jini.kind`: `"media-gateway"` → `"media-provider-gateway"`
   (my call — renamed to match composio's `vendor-connector-gateway` pattern rather than keeping
   `media-gateway`; flagged per the brief's instruction to note which I picked).  `version` left at
   `0.1.2` (rename-in-place; the `major` changeset bump is what moves the published version at
   release time). `tsconfig.json`'s `extends` fixed from `../../tsconfig.base.json` to
   `../../../tsconfig.base.json` (one directory deeper) — verified it resolves.

## Files changed

**New files** (composio, full new package config):
- `packages/integrations/composio/package.json`, `tsconfig.json`, `vitest.config.ts`
- `packages/integrations/composio/src/*` (11 source files, `source-map.md`, `__tests__/` with 9
  test files) — via `git mv`, history preserved

**New files** (media-providers, moved as a whole tree via `git mv`, then edited):
- `packages/integrations/media-providers/**` — same file set as the old `packages/media/**`
  (package.json, README.md, CHANGELOG.md, source-map.md, tsconfig.json, vitest.config.ts, and all
  of `src/**`), history preserved

**Deleted:**
- `packages/admin/src/server/composio/**` (moved, see above)
- `packages/admin/src/server/index.ts` (pure pass-through wrapper, not needed once composio has
  its own package root)
- `packages/media/**` (moved to `packages/integrations/media-providers/**`)

**Edited:**
- `pnpm-workspace.yaml` — added `packages/integrations/*` alongside the flat `packages/*` glob,
  with a one-line comment explaining the umbrella
- `packages/integrations/media-providers/package.json` — see above
- `packages/integrations/media-providers/tsconfig.json` — `extends` path fix
- `packages/integrations/media-providers/README.md` — 3 self-references (`# `@jini-ai/media``,
  `npm install @jini-ai/media`, the usage `import ... from '@jini-ai/media'` block) →
  `@jini-ai/media-providers`
- `packages/integrations/media-providers/src/dispatch/engine.ts` — one runtime error-message
  string literal (`unknown model: ...`) referencing the old package name, updated
- `packages/integrations/media-providers/src/__tests__/index.test.ts` and `tokens.test.ts` — two
  `describe()` label strings referencing the old package name, updated (cosmetic test labels only,
  zero effect on pass/fail behavior)
- `packages/admin/package.json` — removed `"./server"` from `exports` and from `jini.entries`;
  removed `@jini-ai/protocol` from `devDependencies` (re-grepped after the composio move: zero
  remaining `@jini-ai/protocol` references anywhere in `packages/admin/src/**`)
- `packages/admin/vitest.config.ts` — removed the `src/server/**` 100%-coverage threshold block and
  its explanatory comment; `coverage` now has no `thresholds` key at all (nothing under `./core` or
  `./browser` ever carried one)
- `examples/reference-web/package.json` — `"@jini-ai/media"` → `"@jini-ai/media-providers"` in
  `dependencies`
- `examples/reference-web/src/daemon.ts` — import specifier updated to `@jini-ai/media-providers`

**New (umbrella + changesets):**
- `packages/integrations/README.md` — states plainly it is not itself a workspace package
- `.changeset/admin-remove-server-subpath.md` — `"@jini-ai/admin": minor`
- `.changeset/composio-un-retirement.md` — `"@jini-ai/composio": minor`
- `.changeset/media-providers-rename.md` — `"@jini-ai/media-providers": major`

**Not touched** (confirmed via `git status`/`git diff --stat` after the fact): `packages/ui/src/features/connectors/`, `packages/ui/src/features/media-providers/`, `packages/ui/package.json`,
and the four other in-flight untracked directories named in the brief
(`packages/admin/src/react/components/InteractiveHtmlEditor/`, `packages/ui/src/features/{a2ui,html-editor,interactive-ui}/`).

## Verification — fresh evidence

All commands re-run clean, in order, after a final `pnpm install`, immediately before writing this
report (not reused from earlier in the session):

```
$ pnpm install                                              → exit 0, "Lockfile is up to date"
$ pnpm --filter @jini-ai/composio run typecheck              → exit 0, no errors
$ pnpm --filter @jini-ai/composio run test:coverage           → 9 files, 212/212 tests, 100/100/100/100 coverage on every file
$ pnpm --filter @jini-ai/media-providers run typecheck        → exit 0, no errors
$ pnpm --filter @jini-ai/media-providers run test:coverage    → 32 files, 572/572 tests, 100/100/100/100 coverage on every file
$ pnpm --filter @jini-ai/admin run typecheck                  → exit 0, no errors
$ pnpm --filter @jini-ai/admin run test                       → 14 files, 199/199 tests
$ pnpm --filter @jini-app/reference-web run typecheck          → 1 error, in AgentLab.tsx, PRE-EXISTING (see below) — daemon.ts's new import resolves clean
```

**Zero test content changed.** Every one of the 212 + 572 + 199 = 983 tests that passed today is
byte-identical to before the move (`git mv`, no re-authoring), except the two `describe()` label
strings noted above, which are not assertions and do not affect pass/fail.

### A real bug this move surfaced and fixed: stale symlinks from the raw directory move

`git mv packages/media packages/integrations/media-providers` is a filesystem rename, so it also
dragged the package's pre-existing, gitignored `node_modules/` along with it. That directory's
`@types/better-sqlite3` symlink was relative (`../../../../node_modules/.pnpm/...`, 4 levels up —
correct for the old one-level-deep location). One level deeper now, it needed 5. The stale symlink
resolved to a nonexistent path, and `tsc` failed with `TS7016: Could not find a declaration file
for module 'better-sqlite3'` plus five cascading `TS2347` errors. Confirmed via `readlink` before
and after. Fixed by deleting both new packages' stale `node_modules/` and re-running `pnpm install`
to regenerate correct-depth symlinks (verified via `readlink` again — now 5 `../` segments,
resolves). This is exactly the class of problem the "two levels deep instead of one" structural
choice risks; see the Architecture Audit finding below for the second instance of the same root
cause.

### `examples/reference-web`'s pre-existing, unrelated typecheck failure

`src/AgentLab.tsx(156,48): error TS2322` (a `DomPageDriverPage` type mismatch, unrelated to
composio or media). Confirmed pre-existing and out of scope two ways: (1) `git status --short` on
that exact file shows it untouched by this task; (2) `git stash` (reverting every change from this
task) reproduces the identical error at the identical line/column. It predates this move and is not
something I fixed, per the brief's explicit instruction to leave the branch's other in-flight,
uncommitted work untouched. Flagged as a follow-up, not fixed here.

## Architecture Audit

**Status: WARNING** (not BLOCKER — the finding is real and disclosed, has a clear fix path, and
does not affect the functional deliverable; not PASS — a genuine new violation exists).

**ADR/rule checked:** `scripts/check-engine-boundaries.ts` (R1, R2, R5, R6, R8, R9), run via
`pnpm run guard`.

**Files audited:** every file under `packages/integrations/**` (new), `packages/admin/**` (edited),
`examples/reference-web/**` (edited), plus a full-repo guard run to catch any second-order effect.

**Violation found — directly caused by this move:**

`pnpm run guard` reports **18** violations with `packages/integrations/` present, versus **17**
with it removed (isolated by temporarily `mv`-ing the directory out of the tree and re-running
guard, then restoring it — not by trusting `git stash`, which doesn't touch untracked files and
would have given a contaminated baseline). The one new violation:

```
[guard] R8-package-metadata packages/integrations/package.json: package directory "integrations" is missing package.json
```

**Root cause, read directly from `scripts/check-engine-boundaries.ts`:** `loadPackageRecords()`
calls `readdirSync(packagesDir)` — a single-level scan of `packages/`'s direct children — and
requires every one of them to have its own `package.json` (R8). `packages/integrations/` is, by
this task's own design (see `packages/integrations/README.md`, written per the brief's instruction),
a plain grouping directory with **no** `package.json` at that level. The checker was never written
to expect a directory-of-packages nested one level inside `packages/`; it currently has no concept
of an umbrella folder. This is a mechanical, deterministic consequence of the umbrella structure,
not a code-quality issue in the moved packages themselves — both `@jini-ai/composio` and
`@jini-ai/media-providers` individually pass every other rule cleanly (confirmed: with only one of
the two present, guard's new-violation count is still exactly the same one R8 line, only ever
attributable to the `integrations` directory entry itself, never to `composio` or
`media-providers` as directory names — those two are never scanned as direct `packages/` children,
so R8 never even reaches their own, valid `package.json` files).

A second-order effect of the same root cause: `packageNameOf()` (the regex
`/^packages\/([^/]+)\//`, used for R2's cross-package-import check) resolves the "owning package"
of *every* file under `packages/integrations/composio/**` and `packages/integrations/media-providers/**`
to the literal string `"integrations"`, not `"composio"` or `"media-providers"`. No relative
import in either new package reaches across into the other, so this produced zero *false-positive*
violations today — but it is a latent *false-negative* gap: a stray relative import from one new
package into the other's `src/` would currently go undetected by R2, where it would be caught
immediately for any two packages living at the standard one-level depth.

**Broader note (not a rule violation, but the same tension):** `packages/README.md` states
explicitly: *"Jini keeps publishable packages physically flat under `packages/*`. ... conceptual
grouping belongs in metadata rather than nested directories that package managers and monorepo
tooling can misinterpret as a second workspace layer."* `packages/integrations/` is exactly the
nested-directory shape that sentence warns against, and R8's own module doc independently states
the same thing ("This keeps packages physically flat"). I proceeded per the brief's explicit,
detailed instruction (workspace-glob addition, `../../../tsconfig.base.json` depth, and umbrella
README all specified in the dispatch, which reads as a deliberate choice, not an oversight) — the
`git mv` decision itself ("two separate packages, not subpaths") was pre-decided and out of scope
for me to re-litigate, but the *directory nesting* is a related-but-separate structural choice the
brief made that the repo's own documented convention and its enforcing tool don't yet accommodate.
I did not treat this as license to deviate from the brief; I completed the task as specified and am
surfacing the conflict for a decision, per the escalation principle that a documented architectural
contradiction — not just a taste disagreement — belongs to the person who can decide whether the
convention or the structure changes.

**Smallest compliant fix (not implemented — out of my scope; a shared tool, not listed in the
brief's file-change list, and a structural decision beyond "pure relocation"):** teach
`loadPackageRecords()` to recognize a `packages/<dir>/` with no `package.json` of its own but with
subdirectories that each have one as a grouping folder — skip it for R8's manifest check and
recurse one level for the purposes of building `packageRecords`/`packageNameOf`, treating
`packages/integrations/composio` and `packages/integrations/media-providers` as the real package
roots. Alternatively, if the umbrella pattern is meant to stay rare/one-off, an explicit allowlist
(`KNOWN_GROUPING_DIRS = ['integrations']`) in the same file would be a smaller, more conservative
patch. Either requires touching `scripts/check-engine-boundaries.ts` and its `scripts/lib/self-test.ts`
fixtures, which I have not done.

**No other rule (R1, R2 content-level, R5, R6, R9) is violated by anything this task touched.**

## Pre-Completion Checklist

- **Requirements re-verified:** re-read the dispatch brief in full against the final diff before
  writing this report; every numbered step (workspace registration, composio package creation,
  media-providers rename, admin cleanup, reference-web consumer update, umbrella README, three
  changesets) has a corresponding change listed above.
- **Fresh evidence commands:** all eight verification commands above were re-run in the same
  terminal session immediately before this report was written, not reused from an earlier point in
  the session — see exact output summaries above.
- **Test-integrity confirmation:** zero certified tests deleted or weakened. 983 tests moved
  byte-for-byte (two `describe()` label strings updated, which are not assertions). No test needed
  a *content* change to pass — the one deviation-worthy event (the stale `node_modules` symlink)
  was an environment/tooling artifact of the raw directory move, not a test or source change, and is
  disclosed above rather than silently patched around.
- **Scope confirmation:** `git status`/`git diff --stat` checked against every explicit boundary in
  the brief (UI connectors/media-providers features, the four in-flight untracked directories,
  `packages/ui/package.json`) — none touched by this work.
- **Open items:** the R8 guard WARNING above; the stale-comment follow-ups below; the pre-existing
  `AgentLab.tsx` typecheck failure; the 17 pre-existing (unrelated) guard violations discovered
  as a side effect of isolating the one new one — none of these were introduced by this task and
  none were fixed by it, per the brief's explicit "flag, don't fix" instructions for adjacent issues.

## Deviations from the brief

1. **Removed two stale `node_modules/` directories not mentioned in the brief.** Necessary to make
   `pnpm --filter @jini-ai/media-providers run typecheck` pass at all — see the bug writeup above.
   This is derived/gitignored content, not source; regenerated correctly by `pnpm install`.
2. **Did not update the ~14 doc-comment (non-string-literal) self-references to `@jini-ai/media`
   inside `media-providers/src/**`** (`index.ts`, `task-store.ts`, `tokens.ts`, `policy.ts`,
   `types.ts`, `dispatch/vendor-registry.ts`, `sqlite-task-store.ts` ×5, `dispatch/types.ts` ×2).
   The brief's instruction for `src/**` was narrowly scoped to "string-literal self-references,"
   distinct from its broader "prose mentions" instruction for `README.md` specifically. I honored
   that distinction literally rather than assuming the narrower wording under-specified the intent,
   since over-reaching into ~14 doc comments (one block of which — `sqlite-task-store.ts` — also
   references the removed R7/`UNLOCKED.md` admission-gate mechanism and is independently stale for
   reasons unrelated to this rename) would have meant making editorial judgment calls beyond a pure
   relocation. Flagged below as a follow-up rather than silently expanding scope.
3. **`packages/integrations/composio/coverage/` and `.../media-providers/coverage/` were generated
   by my own verification runs and deleted afterward** (gitignored, regenerate on demand) — not a
   deviation from the brief's instructions, just noting it since coverage-directory handling was an
   explicit brief concern for the *original* `packages/media/coverage/`.

No test needed a genuine behavioral fix; nothing here triggers the brief's "STOP and report as a
deviation" clause for that specific case.

## Stale-comment follow-up list (not fixed — flagged per brief's own instruction)

**Cross-package, explicitly out of scope per the brief (unchanged, confirmed still present):**
- `packages/deploy/src/tool.ts:52,69`
- `packages/http-kit/src/attachments.ts:97`
- `packages/http-kit/src/research.ts:53`
- `packages/http-kit/src/media.ts:6,9,18`
- `packages/http-kit/src/memory.ts:19`
- `packages/capability-providers/src/tokens.ts:5`

All still say `@jini-ai/media` in prose; now doubly stale (package renamed *and* relocated).

**New finding — internal doc-comment self-references inside the renamed package itself** (see
Deviation #2 above for why these were left alone): `packages/integrations/media-providers/src/{index.ts, task-store.ts, tokens.ts, policy.ts, types.ts, dispatch/vendor-registry.ts, sqlite-task-store.ts, dispatch/types.ts}`.
One of these (`sqlite-task-store.ts`) also independently references a removed mechanism (R7 /
`UNLOCKED.md` locked-incubating-admitted gate, removed 2026-07-28 per `check-engine-boundaries.ts`'s
own header) — that staleness predates and is unrelated to this move.

**Pre-existing, unrelated to this task (found only because `pnpm run guard` was run repo-wide as
instructed) — not fixed, not part of this task's scope, listed here only for completeness since the
brief asked for a full-repo guard run:**
- R5 `Tovu` string-in-comments: `packages/admin/src/react/index.ts`,
  `packages/admin/src/react/components/InteractiveHtmlEditor/InteractiveHtmlEditor.tsx`,
  `packages/cms/src/settings/dictionaries/index.ts`,
  `packages/ui/src/features/html-editor/react/{components/InteractiveHtmlEditor.tsx,hooks/useInteractiveHtmlEditor.ts}`,
  `packages/ui/src/features/i18n/dictionaries/index.ts`,
  `packages/ui/src/features/settings/dialog/react/components/SettingsDialogShell.tsx`
- R2 deep-path: `InteractiveHtmlEditor.tsx` (`@jini-ai/ui/html-editor`), six files under
  `packages/chat/src/react/features/chat-pane/**` (`@jini-ai/chat/core`)
- R9 dom-purity: `packages/agentic/tsconfig.json`, `packages/agentic/tsconfig.dom.json`

All of these live in files this task never touched (several are the exact untracked/in-flight
directories the brief told me to leave alone), and all reproduce identically whether
`packages/integrations/` is present or not — confirmed by the same isolation test used for the R8
finding above.

## Suggested next routing

- The R8 guard WARNING needs a maintainer decision: accept the `packages/integrations/` umbrella as
  a documented exception to `packages/README.md`'s flat-layout rule (and patch
  `check-engine-boundaries.ts` accordingly), or reconsider the nesting. Either way it's a
  `scripts/check-engine-boundaries.ts` change, not a package-content change — Programmer scope, but
  needs the direction question answered first.
- Stale-comment sweep (both the six cross-package files and the ~8 internal `media-providers`
  files) is straightforward mechanical cleanup — good Refactor-agent or quick-Programmer follow-up.
- The pre-existing `AgentLab.tsx` typecheck failure and the 17 pre-existing guard violations belong
  to whoever owns the in-flight `a2ui`/`html-editor`/`interactive-ui`/`InteractiveHtmlEditor` work
  already sitting uncommitted on this branch — not this task.
