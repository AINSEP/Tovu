# Gemini Adversarial Audit (RAW, UNVERIFIED) — features/ + platform/, chunks 13-20

Generation-only pass. This file contains RAW Gemini 3.8 Flash claims, **none verified**.
A separate Claude Opus 5 verifier agent is responsible for confirming/discarding every
entry below against actual source. Nothing in this file should be treated as a confirmed
finding until that verification pass records it as such (in the companion verified report,
`2026-09-05-gemini-audit-features-platform.md`).

Auditor model: `gemini-3.8-flash-high` via `agy --print --model gemini-3.8-flash-high
--effort high --print-timeout 15m`, print mode, diff (and where noted, full file content)
pasted as text on stdin — no repo tool access given to Gemini.

## Scope enumeration (done fresh from source, not trusted from the dispatch brief)

The dispatch brief's premise — "cover whatever chunks 1-12 of the primary verified report
did not reach" — is **stale**. Read `2026-09-05-gemini-audit-features-platform.md` directly
(not a summary of it) and cross-referenced every one of its per-chunk commit lists against
the actual `git log --since="2026-09-03 00:00" --until="2026-09-05 00:00" -- apps/website/src/features
apps/website/src/platform` output (99 commits, confirmed matching the primary report's own
stated count).

Result: **chunks 1 through 16a of the primary report already account for 92 of the 99
commits** (every commit list from chunk 1 through chunk 16a was checked row-by-row against
the full git log and each one matches exactly, no gaps, no overlaps). Only **chunk 16b**
(7 commits, all 2026-09-04 17:11-17:35, all coverage-padding `test(...)` commits, marked
"(running)" / no findings yet recorded in the primary report) remains uncovered by anyone.

So the real remaining scope for this dispatch is exactly those 7 commits. This RAW file
covers them as **chunks 13-19** (one commit per chunk, per the "chunk by coherent unit"
rule — each of these 7 commits is a single self-contained test-file addition, so one commit
IS one coherent unit here). There is no chunk 20; scope is exhausted at 19.

Remaining-scope commits (all test-only, no production-code diff, in
`apps/website/src/features/**` / `apps/website/src/platform/**`):

- [x] 13. `1378c7e4` — test(theme): direct-invoke coverage for structure.ts fs-bounds/containment branches
- [ ] 14. `239a90a5` — test(deployments): S3-compatible publish target coverage
- [ ] 15. `54c65bc6` — test(source-control): store.ts branch-coverage fill
- [ ] 16. `383befbc` — test(deployments): credential-verification (static-publish/verify.ts) coverage
- [ ] 17. `4b35a008` — test(source-control): github-git-provider.ts branch-coverage fill
- [ ] 18. `991217ab` — test(theme): handlebars-allowlist.test.ts fixture fix + 2 branches
- [ ] 19. `438ada6a` — test(export): direct unit proof for redirectOutcomeFor's >=400 arm

## Findings

### Chunk 13 — `1378c7e4` test(theme): direct-invoke coverage for structure.ts fs-bounds/containment branches

**Context given to Gemini:** diff (`structure.test.ts` new hunk) + FULL current production file
`apps/website/src/features/theme/validation/structure.ts` (282 lines) + FULL current test file
`apps/website/src/features/theme/validation/__tests__/structure.test.ts` (256 lines, post-commit).
Full-file context, not diff-only.

Note before the raw claims: the commit message for `1378c7e4` itself already discloses two of
these as known pinning tests recording "surprising current behavior... without endorsing it"
(the broken-symlink-escapes-forbidden-check case, and a FIFO/non-regular-entry being silently
dropped) — the verifier should weigh Gemini's findings 2/3 below against that self-disclosure
before treating them as new discoveries rather than restating an already-flagged trade-off.

**UNVERIFIED — HIGH.** `structure.ts:145,158-161` / `structure.test.ts:90-109`. Claim: once
`truncated` is set true inside one subdirectory's `walk()`, every sibling/ancestor directory
entry still re-enters the `files.length >= MAX_PACKAGE_FILES` branch (line 158) and pushes
*another* `structure-max-files` issue — the line-145 `if (truncated) return;` guard the test's
own comment says "must fire" is claimed to be unreachable dead code, since line 158's own early
`return` fires first for every sibling. The test only asserts `result.issues.find(...)` (existence),
not `result.issues.length === 1`, so it's claimed to pass regardless of duplicate-issue emission.

**UNVERIFIED — HIGH.** `structure.ts:108`. Claim: `visitPackageEntry` calls
`statSync(full, { throwIfNoEntry: false })`, which follows symlinks and only suppresses `ENOENT`
— a circular symlink (`ELOOP`) is claimed to throw uncaught out of `walkThemePackage`, violating
the function's own documented contract ("Never throws on a bad theme... reported as an issue,
not an exception"). Claimed fix: `lstatSync` instead of `statSync`.

**UNVERIFIED — HIGH.** `structure.ts:108-116` / `structure.test.ts:47-61`. Claim: because
`statSync` (not `lstatSync`) is used, a symlink whose target does not exist returns `undefined`
at line 109 before the `isLink`/forbidden-symlink check at line 111 ever runs — so a *broken*
symlink is silently dropped rather than flagged by `structure-symlink-forbidden`. Gemini
disputes the pinning test's own "blast radius: low" rationale, on the theory that theme
validation runs against a temp/sandbox extraction where a symlink's target genuinely may not
exist yet, but the same symlink could resolve to a real, sensitive path once the package is
later extracted into the real deployment environment — i.e. claims the "broken" state is an
artifact of validation-time environment, not a property of the symlink itself.

**UNVERIFIED — MEDIUM.** `structure.ts:227-230,264` / `structure.test.ts:216-234`. Claim: the
non-global regex `sourceDir.replace(/^\.\/+/, "")` only strips one leading `./`, so an input like
`"././."` normalizes to `"./."` (not `""`/`"."`), bypassing the `structure-sourcedir-root`
root-conflict check. Also claims a bare empty-string `sourceDir: ""` short-circuits via
`!build.sourceDir` at line 264 before `normalizeSourceDirOrIssue` ever runs.

**UNVERIFIED — MEDIUM.** `structure.test.ts:243-256` (new in this commit) / `structure.ts:260-262,277`.
Claim: the new test passes `schemaVersion: 1` against a parameter typed as the literal `2`,
which fails to compile without a cast; claims the actual current test file uses
`schemaVersion: 1 as unknown as 2` to force it through, to exercise a branch Gemini calls
tautologically unreachable for any real (type-checked) caller — i.e. a coverage-padding test
that required defeating the type system to write.

**UNVERIFIED — LOW.** `structure.ts:222,237`. Claim: root-containment checks assume POSIX
separators (`sourceDir.startsWith("/")`, `normalized.split("/")[0]`) with no handling for a
Windows-style backslash-separated or drive-qualified path, so a value like `"css\\sub"` would
not be recognized as conflicting with a reserved root named `"css"`.

Gemini raised 6 findings total in this chunk (all captured above), 0 dropped as pure-style
(all included a stated failure scenario).

### Chunk 14 — pending
### Chunk 15 — pending
### Chunk 16 — pending
### Chunk 17 — pending
### Chunk 18 — pending
### Chunk 19 — pending
