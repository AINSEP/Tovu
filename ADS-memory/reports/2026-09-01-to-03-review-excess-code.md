# Review: excess and dead code in the 2026-09-01 → 2026-09-03 commits

- Reviewer: Code Inspection agent (persona `AI-Dev-Shop/agents/code-inspection/skills.md`, loaded).
  Read-only — no source file edited, nothing run (no tests, tsc, eslint, builds, Playwright,
  Chrome, or indexer), per dispatch constraints.
- Scope: the 292 commits `9eebf39d..ed7f5820` (`--since="2026-09-01 00:00" --until="2026-09-04
  00:00"`; Sep 1: 19, Sep 2: 79, Sep 3: 194), reviewed as the code stands at HEAD `6f32d027`.
  Never reviewed by any prior pass (2026-09-06 and 2026-09-04/05 reports cover only 09-04 onward).
- Lens: excess/dead code, duplicated logic, unreachable branches, unused exports, abandoned
  scaffolding, copy-paste divergence, and false/stale code comments — architecture/DI and
  correctness bugs are siblings' territory and excluded here except where they fall directly out
  of a duplication/comment finding.
- Excluded: everything in `2026-09-06-review-architecture.md`, `2026-09-06-review-bugs.md`,
  `2026-09-06-review-excess-code.md`, `2026-09-04-to-05-review-architecture.md`,
  `2026-09-04-to-05-review-excess-code.md`, `2026-09-04-to-05-review-bugs.md` (all read first).
  `2026-09-06-tovu-f6-outstanding-worklist.md` consulted; nothing here overlaps its one open item.
- Triage: given 194 of 292 commits landed in one day, went deep rather than triage per dispatch.
  Read the full commit-subject list; went deep on the custom-credentials feature build-out, the
  AAD credential-sealing sweep (`ffb5ce44`, `e3cb674a`, `d85707ef`, `db7c002f`), the ~35-commit
  cyclomatic/cognitive-complexity-9 refactor sweep and its coverage-restoration sequels, the theme
  posts-*/pages-* rename, and the "/" root-slug feature's multi-commit fix tail. Skipped as
  low-yield after a stat-level look: the ~90 "reach 100% coverage" test-only commits (test-quality
  is a sibling dimension), pure content/docs/deploy commits, and the six-store AAD-enforcement
  commit chain beyond verifying its enforcement script actually landed.
- `uptime` checked before starting (load 7.9/13.3/19.5) and periodically after; nothing here reads
  or writes outside this report.
- Labels: **CONFIRMED** = read the code, defect certain. **PLAUSIBLE** = looks wrong, not fully
  proven. Line numbers are HEAD unless stated otherwise.

## Ranked findings

### 1. MEDIUM — CONFIRMED — Git-notes-corrected commit: a credential-redaction security fix is permanently mislabeled in `git log` as a taxonomy-rendering fix

Two agents landed commits three minutes apart while sharing one git index (the exact shared-index
hazard already in memory), and the second one's commit message got clobbered by the first's:

- `ab3c01cc` (10:20:33) — real subject: taxonomy-term rendering on declarative/handlebars tiers.
  Diff matches: `render.ts` (+78), a taxonomy integration test, `routes/site/pages.ts`.
- `64e6c029` (10:23:27) — **commit message is `ab3c01cc`'s message, verbatim, word for word.**
  The actual diff is unrelated: `features/custom-credentials/credentialed-request.ts` (+66) and its
  test — stripping `Authorization`/`Set-Cookie`/`Cookie` and any header or body text that reflects
  the injected credential from `custom_credential_make_request`'s tool output, a real security fix
  (an endpoint that echoes request headers back was handing the injected Authorization token to the
  model).

A `git notes` entry attached to `64e6c029` (visible by default under `git show`/`git log -p`,
because `refs/notes/commits` displays automatically) documents the correction and the real change.
But:

- `git log --oneline`, `--format='%s'`, `git log --grep`, and any changelog/audit tool that reads
  commit subjects without also reading notes — which is the overwhelming majority, including this
  review's own first pass, which built a 292-line commit-subject list and had to diff both commits
  by hand to discover the mismatch — sees `64e6c029` as a duplicate of the taxonomy fix and would
  never associate it with the credential-redaction change it actually contains.
- `git log -S"redactResponseHeaders"` or any author/reviewer searching git history by subject for
  "when was header redaction added to custom-credentials" will not find `64e6c029` by its message;
  they will find it only by accident, via `-p`/blame on the file itself.
- `ab3c01cc`'s own message is undamaged (it matches its diff), so this is a single, isolated
  swap, not a systemic corruption — confirmed by scanning every commit in the window for an
  attached git note (`git notes show <c>` in a loop): `64e6c029` is the only one.

Consequence: this is a permanent hole in the repo's own audit trail for a security-relevant fix,
recoverable only by someone who knows to check for a note. No code fix applies here (the note
already carries the correct record); flagging so a `git notes copy`/amend-the-record pass, or at
minimum a repo convention of always checking `git log --show-notes=*` before trusting a commit
subject during an audit, gets considered.

### 2. MEDIUM — CONFIRMED — Six near-identical AAD backfill scripts (~1,200 lines) duplicate the entire backfill scaffold; only one slice of the duplication was ever extracted

`development/scripts/backfill-{composio-config,connector-credential,execution-credential,
external-mcp,media-provider-credential,site-assistant-credential}-aad.ts` (180–235 lines each,
1,202 total) are Type-1/Type-2 clones of one shape: `parseArgs` (`--db`/`--apply`), a
`loadPendingRows` column filter (`aadVersion === 0 && sealedKeyId !== null`), a `run*Backfill`
function that for each pending row does `sealer.open` → build a per-table AAD → `sealer.seal` →
self-verify by re-opening → conditional `db.update(...).where(...)`, a `main()` that branches
dry-run (read-only open, log-only) vs `--apply` (real open, restore-point capture via
`SqliteDbOpsAdapter`, then the real run), and an identical `main().catch(...)` exit-code tail.
Verified by diffing two of them (`execution-credential` vs `site-assistant-credential`): every
difference is the table import, the composite-key shape (`workspaceId`+`principalId` vs bare
`workspaceId`), and the AAD-builder import — structure, control flow, logging strings, and
exit-code convention are otherwise identical.

This is 6 sites past the repo's own 3-site clone-group threshold. The author already recognized
duplication was a live risk here and extracted exactly one slice of it: `333233db` ("AAD backfills
fail loudly on a missing database instead of creating one") pulled the DB-path-existence check into
a shared `backfill-db-path.ts`, explicitly reasoning "one shared helper rather than five copied
existence checks — the resolution rule is one behaviour, and changing it later ... should be one
edit, not five." That same reasoning was not carried through to the rest of the ~200-line scaffold
that surrounds it in every one of the 6 files — the dry-run/apply split, the per-row
migrate-verify-write loop, and the restore-point/exit-code convention are still hand-copied. Proof
this costs real edits: `c412bc75` ("make --dry-run genuinely read-only across the AAD backfill
family") had to touch all 6 scripts plus `backfill-custom-credential-usernames.ts` by hand for one
shared root cause (`openContentDb` migrating on open even in dry-run mode) — precisely the
maintenance tax a shared `runAadBackfill(deps, config)` helper (parameterized by table, key shape,
and AAD builder) would have collapsed into one file's edit.

Consequence: this repo's own AAD memory (`reference_aad_sealing_call_site_map.md`, written the same
day this sweep ran) explicitly predicts a 7th store will exist someday and that "nothing enforces
that a new `.seal()` passes `aad` at all" — meaning a 7th backfill script is the expected next
instance of this exact ~200-line copy, by hand, from whichever of the 6 the next author opens
first. A bug fixed in the shared shape (as already happened twice this window — the dry-run
read-only fix across all 6, and a related-but-distinct pending-count bug fixed only in the 7th,
non-AAD sibling `backfill-custom-credential-usernames.ts`) has to be re-diffed and re-applied N
times rather than fixed once. (Checked whether that pending-count bug — `0c44660da`, "surface an
undecryptable row instead of reporting success" — also affects the 6 AAD scripts: it does not: their
`loadPendingRows` filters on stored `aadVersion`/`sealedKeyId` columns only, never attempts a
decrypt before counting, so an undecrypt-failure inside the real per-row loop propagates to
`main().catch()` and sets `exitCode = 1` in all 6 today — verified by reading each script's
`loadPendingRows` and loop body. No live bug from the duplication today; the risk is prospective and
already demonstrated by the two-fix history above.)

Fix: `development/scripts/lib/run-aad-backfill.ts` exporting the shared arg-parse / dry-run /
per-row seal-verify-write / restore-point / exit-code shape, taking `{ table, keyColumns,
buildAad, tableLabel }`; each of the 6 scripts becomes a ~20-line config file. Do this before the
7th store's backfill script gets hand-written.

### 3. LOW — CONFIRMED — A newly-added `@complexity` doc comment understates its function's actual cost

`apps/website/src/features/members/access-resolver.ts:176-177` (added in the 09-03 complexity
refactor sweep, part of decomposing `decide()` into one function per visibility level):

```ts
/** `visibility: "tiers"` allows an authenticated member holding at least one of `access.tierIds`.
 *  @complexity O(t), t = `access.tierIds?.length` (small, editorial data). */
function decideTiersAccess(access: MemberContentAccess, context: MemberContext): MemberAccessDecision {
  const requiredTierIds = access.tierIds ?? [];
  const isEntitled = requiredTierIds.some((tierId) => context.activeTierIds.includes(tierId));
  ...
```

The body is `requiredTierIds.some(id => context.activeTierIds.includes(id))` — a linear scan of
`activeTierIds` (`.includes`) nested inside a linear scan of `requiredTierIds` (`.some`), i.e.
O(t · a) where `a = context.activeTierIds.length`, not the claimed O(t). `a` is not mentioned or
bounded anywhere in this function's doc (contrast the sibling `resolveContext` two functions up,
which correctly documents its own `O(1) session lookup + O(k) subscription/tier lookups` two-term
cost). Consequence is real but narrow: both `t` and `a` are described elsewhere in this same file as
"small, editorial data," so this has no practical performance effect today, but a reader using this
file's own complexity-annotation convention (used consistently across ~15 functions in this file
alone, and across 67 functions added repo-wide in this same sweep) to reason about how the member-
access-decision hot path scales would be told a false, better bound. Cheap fix: `O(t · a)` or drop
the per-term claim to `O(1)` amortized over "small editorial data" like several sibling functions in
the same file already do, rather than a wrong asymptotic term.

## Unreachable branch (standing rule) — checked, none found in-window

Looked for the closed-union-exhaustive-switch-with-a-`default`-arm shape (the pattern the 09-04/05
review found and recommended deleting in `push-to-talk-state.hooks.ts`) among this window's new
switch/dispatch code. The one candidate — `access-resolver.ts:129-142`'s `decide()`, switching on
`access.visibility: MemberContentVisibility` with a `default: return
decideUnknownVisibilityAccess(...)` after all four known members are handled — is **not** the same
shape: `access` is parsed from an untrusted, unvalidated JSON column (`resolvePostMemberAccess`,
same file, `@complexity O(1) — one JSON.parse of a small, editorial-sized string`), so a stored
value outside the current union (a future removed visibility level, a hand-edited row, a
downgrade after a future variant ships) reaches this switch as real data, not just as a type-level
possibility. Per the repo's own rule this rests on an external data contract, not a provable-locally
one → **KEEP**, and it already has direct test coverage (`access-resolver.test.ts:111,173-174`
exercise the `unknown_visibility` fail-closed path). No finding.

## Checked and found sound (no finding)

- **The AAD enforcement gap the same window's own memory flags as unbuilt was, in fact, built the
  same day.** `reference_aad_sealing_call_site_map.md` (written 2026-09-02) says "An architecture
  test that fails when a `.seal()` call omits `aad`... Not yet built as of 2026-09-02." `d85707ef`
  (09-02 14:46, same day) adds exactly that: an AST-based scan
  (`features/webhooks/seal-aad-invariant.ts`) over every `.seal(` call site under `apps/website/src`,
  wired to `npm run check:seal-aad`, with a real regression test asserting all 11 production call
  sites are clean today. The memory file itself is now stale on this one claim (a session-memory
  fact, not a codebase artifact — flagging for whoever next touches that file, not as a code
  finding).
- **The theme posts-\*/pages-\* rename (`38e022fc`) is not a bare rename** — it ships a
  `LEGACY_TEMPLATE_FILENAME_ALIASES` fallback in `static-render.ts` specifically because
  `template_choice` rows are theme-relative and five other installed themes still ship the old
  filenames. Every remaining `blog-post.html`/`page-shell.html`/`blog-sidebar-template.html`
  reference left in the tree (~90 grep hits) is either a test fixture proving the alias still
  resolves the legacy name, a doc-comment example, or another theme's real filename — not a missed
  rename site.
- **The "restore defensive `??` fallbacks wrongly deleted" incident (`a63534b5`, `7e1cea7e`)
  restored all 12 affected route files.** Cross-checked every `git log -p` hunk in the full 09-03
  09:00–17:00 coverage/complexity sweep window for a removed `?? ""`/`?? {}` line outside those 12:
  found 2 more matches (`media-rendition.ts`'s two params, `get-by-slug.ts`'s slug) but both are
  refactors that moved the same fallback into a new local/helper, not deletions — verified present
  at HEAD in both files.
- **The "/" root-slug feature's admin-link fix tail (`4510130`→`58574a7e`) lands complete.** The
  final commit explicitly names and fixes the two sibling call sites (`ThemeExplore.tsx`'s
  collision warning, `use-theme-pages.hooks.ts`'s collision link) the prior fix missed, plus
  `Pages.tsx`'s two links, through one new `pageAdminPath()`. Grepped for any remaining bare
  `` `/pages/${page.slug}` ``-shaped construction outside `rules.ts`: none in list/link rendering
  code; the one remaining `` `/pages/${post.id}` `` (`use-pages.hooks.ts:117`, the
  create-then-navigate redirect) always uses id, which the router already resolves correctly for
  every page including the root-slug one — not routed through `pageAdminPath` but not broken either.
- **The visitor-facing and admin-facing BYOK save-split fixes (`b83735e8`, `f39be6516`) are not a
  one-arm fix.** Both touch only the shared `AdminByokKeyPanel.tsx`/footer components; that file is
  imported by both consumers (`ai-assistant/AiAssistant.tsx` and `features/settings/SettingsUi.tsx`),
  so the fix reaches both screens through the one shared module.
- **`c57f379`'s revert of `mergeExternalMcpSavePrefill`'s extraction is a sound call, not
  regressed debt.** Un-inlining a 15-field flat `??`-chain merge function back from an extracted
  `mergeStringField` helper, with the cyclomatic-18 finding then recorded as a reviewed, dated
  exception in `src-complexity-debt.json` rather than silently dropped. The debt-baseline file's
  history in this window (`c57f379`→`eb732811`→`0a4a6947`→`3b773dc`→`baf2675d`, ending at "1 entry")
  is internally consistent when read against its own `_comment_*` provenance trail; the two later
  entries visible in the file today were added 2026-09-05 (outside this window) and are correctly
  excluded from the "cleared to 1" claim by the file's own comments.
- **The hyperframes/fal/leonardo de-integration (`7d56cd33`) leaves no dead code behind** — it
  narrows a model-id enum and rewrites the two doc comments that were wrong, with tests rewritten to
  target the new schema-level rejection rather than describing a scenario that used to require
  reaching the dispatch engine.
- The custom-credentials feature's own `AuthFailureDiagnostic` construction
  (`credentialed-request.ts:575`) correctly implements, rather than duplicates, the generalized
  `contracts/core/tool-failure-diagnostics.ts` contract `1f1dcb87` introduced the same window;
  `tool-catalog-audit.ts` (new this window) is wired into all three of `agent-daemon-port.ts`,
  `agent-daemon-server.ts`, and `byok-tool-surface.ts`, not just the daemon path it launched with.
- `credentialed-request.ts`'s own 18 `@complexity` annotations (a much larger, more heavily-touched
  file than `access-resolver.ts`) were spot-checked and are correctly qualified (e.g. explicit
  "O(n) beyond {@link ...}'s own cost" chains) — no equivalent understatement found there.

## Not reviewed

- The ~90 "test(...): reach 100% coverage" commits' assertion quality (test-quality is a sibling
  dimension; spot-checked only for the wrongly-deleted-fallback pattern above).
- Full bodies of `store.ts` (585 lines) and `tool-registrations.ts` (915 lines) in
  custom-credentials beyond the functions cited above; the `providers/` subdirectory beyond
  `fly-io.ts`'s auth-scheme naming.
- The `ui-ux-design` bundled agent-plugin's shadcn example files (`auth-layout.tsx`,
  `data-table.tsx`, `form-pattern.tsx`) — reference/example content for a plugin skill, not
  reviewed as application code.
- Docs-only commits (stale-docs audits, ADR records, complexity-gap reports) beyond checking their
  claims weren't already stale by end-of-window.
- Content/seed commits for `tovu-com` (menu embeds, footer, index.html landing shell).
- Nothing was executed — no tests, tsc, eslint, builds, browser, or indexer, per dispatch rules.
