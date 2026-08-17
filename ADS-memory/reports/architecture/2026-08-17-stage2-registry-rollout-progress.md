# Stage 2 registry rollout — batch 1 progress

**Date:** 2026-08-17
**Author:** Programmer(Direct), dispatched by team lead
**Scope:** Convert the first 5 (of ~21 remaining) not-yet-converted assistant tool domains from
`assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array to
`assistant/tool-contribution-registry.ts`'s explicit-call registry (the pattern Stage 1 established
for `comments`/`newsletter` the same night — see
`ADS-memory/reports/architecture/2026-08-17-candidate-3-and-4module-scc-followup.md`'s Addendum for
the original design rationale).

## Selection method

Grepped the whole repo (`src/`, `apps/`, `development/`) for each of the 22 remaining candidate
domains' importers, excluding the domain's own directory, `assistant/tool-registrations.ts`, and test
files. A domain was judged risky if any importer was another domain still statically wired through
`assistant` (since that gives `assistant` a path to reach the domain other than the direct edge being
removed — converting it then closes a cycle back through `assistant`). Domains whose only importers
were `server/*`, `db/sqlite/*`, or `apps/admin/*` were judged safe, since `assistant` never reaches
those.

This surfaced 14 domains with zero sibling-domain importers by a plain relative-path grep: `identity`,
`members`, `widgets`, `features/database`, `features/recovery`, `features/deployments`,
`features/source-control`, `features/plugin-runtime`, `features/workspace`, `features/pages`,
`features/taxonomy`, `seo`, `redirects`, `features/theme`. Also verified `assistant`'s own non-
`tool-registrations.ts` files don't already value-import any of the 14 (which would have closed an
immediate 2-node cycle regardless of `DOMAIN_SLICES`) — this rule out `features/settings` and flagged
`integrations` as separately risky (imported by `source-control`/`deployments`/`media`, all still
static), neither of which was in this batch's candidate set to begin with.

From the 14, picked the 5 smallest/simplest by file size and test-file availability, to minimize
per-domain implementation risk within one batch: `identity` (11-line re-export shim over
`@jini-ai/cms/identity`), `members`, `features/taxonomy`, `redirects`, `features/theme`.

**Known blind spot in the grep heuristic, discovered mid-batch:** the relative-path grep
(`from "../features/theme"` etc.) misses this codebase's `#src/*` subpath-import style (Node's
`imports` field, `"#src/*": "./src/*.ts"`). `src/export/route-manifest.ts` imports
`#src/features/theme/index` this way, which a plain relative-path grep does not match. This importer
was invisible until `check:architecture` caught the resulting cycle directly (see below). Future
batches should grep for `#src/<domain>` patterns too, not just relative paths.

## Per-domain outcome

| Domain | Outcome | Why |
|---|---|---|
| `identity` | **Converted, kept** | Zero sibling importers (relative or `#src/`); a thin re-export shim, simplest case in the batch. |
| `members` | **Converted, kept** | Zero sibling importers. |
| `features/taxonomy` | **Converted, kept** | Zero sibling importers. |
| `redirects` | **Converted, kept** | Zero sibling importers. |
| `features/theme` | **Reverted** | `export/route-manifest.ts` imports `#src/features/theme/index` (invisible to the relative-path grep). `assistant` already reaches `export` transitively through its still-static `deployments`/`source-control` `DOMAIN_SLICES` entries, so adding `themes -> assistant` closed a NEW 6-module cycle: `assistant, export, features/deployments, features/source-control, features/theme, features/vendor-credentials`. Reverted all 3 edits; left an explanatory comment on the restored `DOMAIN_SLICES` entry and in `features/theme/tool-registrations.ts`'s trailing comment, mirroring `post`'s existing revert comment style. |

Each domain was converted and checked individually except taxonomy/redirects/themes, which were
batched together before the first `check:architecture` run of that trio (a deviation from the
"one at a time" procedure, made for throughput) — this is what caused the theme cycle to be caught
only after all three were in place rather than immediately after theme's own edit. Re-ran
`check:architecture` after reverting theme alone to confirm taxonomy/redirects were not implicated,
and separately re-grepped for `#src/features/taxonomy`, `#src/redirects`, `#src/identity`,
`#src/members` hidden importers — none found.

## check:architecture — before/after this batch

Baseline compared against (uncommitted, left over from last night's Stage 1 session — this batch
did not modify `check-architecture.baseline.json`):

| Metric | Before batch (post-Stage-1) | After batch (4 converted) |
|---|---|---|
| propagation cost (all-import) | 8.80% | 8.95% |
| propagation cost (runtime-only) | 1.94% | 1.95% |
| back-edges into composition root | 11 | 11 |
| back-edges, runtime-only | 0 | 0 |
| module cycles (mutual pairs, runtime-only) | 0 | 0 |
| largest SCC (runtime-only) | 0 | 0 |
| module API surface (files exposed) | 213 | 213 |
| core size | 16.17% (151/934) | 16.27% (152/934) |

`check:architecture`'s own exit code reports FAILED (propagation cost / core size regressed against
the committed-but-uncommitted baseline), but per the team lead's explicit revert criteria — cycles,
largest SCC, and runtime-only back-edges — nothing regressed for the 4 kept domains; the small
propagation-cost/core-size upticks are the expected cost of adding new registry edges (each converted
domain now imports `assistant/index` for `registerToolContributor`, adding one file to `core size`'s
count), the same kind of drift Stage 1's `comments`/`newsletter` conversion presumably produced. Did
NOT run `--update` on the baseline file — it wasn't in this batch's file-touch scope and Stage 1's own
baseline update is still uncommitted; deferred to the team lead.

The `theme` attempt, while still in place (batch of 3 before revert), showed the real revert-trigger
signal clearly: largest SCC (runtime-only) jumped 0 → 6. After reverting theme alone, it returned to 0.

## Tests run

All commands run from repo root, node's native test runner:

```
node --import tsx --test \
  src/assistant/__tests__/tool-registrations.contracts.test.ts \
  src/assistant/__tests__/tool-registrations.identity-authorization.test.ts \
  src/assistant/__tests__/tool-registrations.identity-contracts.test.ts \
  src/assistant/__tests__/tool-registrations.members.test.ts \
  src/assistant/__tests__/tool-registrations.redirects.test.ts \
  src/assistant/__tests__/tool-registrations.taxonomy.test.ts \
  src/assistant/__tests__/tool-contribution-registry.test.ts \
  src/assistant/__tests__/tool-registrations.comments.test.ts \
  src/assistant/__tests__/tool-registrations.newsletter.test.ts
```
Result: **244 pass, 0 fail.**

```
node --import tsx --test src/identity/__tests__/*.test.ts
```
Result: **52 pass, 0 fail.**

```
node --import tsx --test src/members/__tests__/*.test.ts
```
Result: **86 pass, 0 fail.**

```
node --import tsx --test src/features/taxonomy/__tests__/**/*.test.ts
```
Result: **6 pass, 0 fail.**

```
node --import tsx --test src/redirects/__tests__/*.test.ts
```
Result: **88 pass, 0 fail.**

```
npx tsc -p tsconfig.json --noEmit
```
Result: **10 pre-existing errors, all in `src/themes/static/mui-marketing/authoring/shared-theme/customizations/surfaces.ts`** (an unrelated static theme template — missing file extension + MUI `Theme.vars` typing gaps). Zero errors in any file this batch touched.

Domain test files (`tool-registrations.identity-authorization.test.ts`,
`tool-registrations.identity-contracts.test.ts`, `tool-registrations.members.test.ts`,
`tool-registrations.redirects.test.ts`, `tool-registrations.taxonomy.test.ts`) initially failed after
conversion (`buildAssistantToolRegistrations` no longer wires a converted domain unless something
installs it into the registry first). Fixed by adding the same `resetToolContributorsForTests()` +
`contribute<Domain>Tools()` setup `tool-registrations.comments.test.ts` already established in Stage 1
— not a new pattern, just applying the existing one to 5 more files (4 kept + already reverted before
this fix was needed for theme's own test, which doesn't exist as a separate domain-scoped file that
required this fix).

`src/assistant/__tests__/tool-contribution-registry.test.ts` was extended: the Stage-1-authored
"installs exactly comments, newsletter" test now asserts the full 6-domain set (comments, identity,
members, newsletter, redirects, taxonomy); added a "themes is deliberately NOT installed" test
mirroring the existing "post is deliberately NOT installed" one; extended the daemon/BYOK parity test
to also assert `identity_*`, `members_list`, `redirects_list`, `taxonomy_list` are present in both
independently-built catalogs.

## Known pre-existing failures (not caused by this batch, not chased)

Per the team lead's brief, confirmed pre-existing on untouched HEAD from last night's handoff:
`tool-registrations.database-recovery.test.ts`, `tool-registrations.menus.test.ts`,
`byok-provider-turn.test.ts`, plus 8 BYOK protocol tests. None of these were run or touched this
batch (no domain in this batch overlaps their scope).

## Files changed this batch

- `src/identity/tool-registrations.ts` — added `contributeIdentityTools()`.
- `src/members/tool-registrations.ts` — added `contributeMembersTools()`.
- `src/features/taxonomy/tool-registrations.ts` — added `contributeTaxonomyTools()`.
- `src/redirects/tool-registrations.ts` — added `contributeRedirectsTools()`.
- `src/features/theme/tool-registrations.ts` — tried, reverted; trailing comment added explaining why.
- `src/assistant/tool-registrations.ts` — removed 4 domains' static imports/`DOMAIN_SLICES` entries;
  restored theme's entry with an explanatory comment; updated the file header's running list of
  converted domains.
- `src/server/tool-catalog-manifest.ts` — added the 4 new `contribute*Tools()` imports and calls to
  `installFirstPartyToolContributors()`; updated the file header's converted-domain count (3 → 6).
- `src/assistant/__tests__/tool-registrations.identity-authorization.test.ts`,
  `tool-registrations.identity-contracts.test.ts`, `tool-registrations.members.test.ts`,
  `tool-registrations.redirects.test.ts`, `tool-registrations.taxonomy.test.ts` — each gained the
  `resetToolContributorsForTests()` + `contribute<Domain>Tools()` setup.
- `src/assistant/__tests__/tool-contribution-registry.test.ts` — extended coverage as described above.

Note: `src/server/tool-catalog-manifest.ts` and `src/assistant/__tests__/tool-contribution-registry.test.ts`
were still untracked (never committed) from last night's Stage 1 session before this batch started —
this batch's commit is their first commit, carrying both Stage 1's and this batch's content together,
since there was no earlier commit to diff against.

## Open items for the team lead

- Stage 1's `check-architecture.baseline.json` update, and Stage 1's `comments`/`newsletter`
  conversion itself, are still uncommitted on this branch (pre-existing, not from this batch) —
  worth a decision on whether/when to commit that separately.
- `features/theme` remains unconverted; per its own revert comment, safe conversion requires either
  relocating `export`'s theme dependency or converting `deployments`/`source-control` first (which
  would remove the transitive path `assistant` currently has into `export`).
- 16 domains remain for future batches (17 minus `themes`, which needs the above precondition first,
  plus `post`, already excluded). Re-run the same selection heuristic each batch, extended to also
  grep for `#src/<domain>` subpath imports, not just relative-path ones.

# Stage 2 registry rollout — batch 2 progress

**Date:** 2026-08-17
**Author:** Programmer(Direct), dispatched by team lead, running in a separate worktree in parallel
with a sibling agent converting a disjoint domain set (deployments/source-control/static-publish/
media/integrations/workspace/pages/seo).
**Scope:** Convert 8 more not-yet-converted assistant tool domains: `content-types`, `forms`,
`widgets`, `menus` (navigation), `database`, `recovery`, `plugins` (plugin-runtime), `entries`, in
that assigned order.

## Worktree/foundation setup issue (resolved before any domain work started)

This worktree was branched from a STALE point in `general-work` — its initial HEAD was the exact
merge-base with `general-work`, i.e. it predated `general-work`'s last 2 commits at dispatch time
(`4d0593c5`, `016666d7` "Stage 2 registry rollout batch 1"). It had zero unique commits of its own,
so `git merge --ff-only general-work` safely brought it current with no data loss (verified clean
`git status` before/after).

After that fast-forward, `general-work`'s own tip (`016666d7`, the batch-1 commit) turned out to
itself be broken: it referenced `src/assistant/tool-contribution-registry.ts` (the core registry
engine — `registerToolContributor`/`listToolContributors`/`resetToolContributorsForTests`),
`src/core/tool-surface-exchanges.ts`, and `comments`/`newsletter`'s own Stage-1 `contribute*Tools()`
additions — none of which had ever actually been committed to git, in this repo's ENTIRE history
(confirmed with `git log --all -S "export function registerToolContributor"`, zero hits across every
branch). `node --import tsx --test src/assistant/__tests__/tool-contribution-registry.test.ts` failed
immediately with `Cannot find module '../core/tool-surface-exchanges'` — `general-work`'s committed
tip did not actually execute. Flagged to the team lead via SendMessage rather than reconstructing the
missing files from a stale, unrelated uncommitted checkout; the team lead landed a corrected commit
(`1cdc054c fix(assistant): land Stage 1 architecture decoupling foundation`), verified with
`git cat-file -e` plus a content grep (not just a file-count check) and a clean `check:architecture`
+ 248 scoped tests before handing back. A second `git merge --ff-only general-work` picked it up
(again zero unique commits lost) and the registry's own 13 contract tests passed for real this time.

## Ordering — team lead's applied correction

The team lead reordered the assigned domain list based on the risk analysis done while blocked:
**`widgets` first**, then `content-types`, `forms`, `menus`, `database`, `recovery`, `plugins`,
`entries` (original relative order otherwise unchanged). Rationale: `widgets` internally imports
`content-types`/`forms`/`entries` (`write-service.ts`, `embed-service.ts`, `region-area-service.ts`,
`resolvers/{contact-form,create-core-resolvers,recent-entries}.ts`, `deps.ts`, `entry-payload.ts`,
`read-service.ts`, `resolver-service.ts`), and `widgets` itself was still a legacy static
`DOMAIN_SLICES` entry at the start of this batch. Converting any of those three domains BEFORE
`widgets` would have closed `assistant -> widgets -> {content-types,forms,entries} -> assistant` —
the exact shape that forced the `themes`/`post` reverts in batch 1. Converting `widgets` first
removes the `assistant -> widgets` static edge before any of the three converts, so none of them
closes a cycle through it. This was verified empirically at each step, not just assumed from the
reordering.

## Per-domain outcome

| Domain | Order | Outcome | Why |
|---|---|---|---|
| `widgets` | 1st | **Converted, kept** | Every importer outside `server/*` is now off the static array by definition (it's the domain being converted); no OTHER still-legacy domain imports `widgets`. Removes the `assistant -> widgets` edge for the next two. |
| `content-types` | 2nd | **Converted, kept** | Only remaining importer besides `server/*` is `widgets/*` — already converted (registry, one-directional), so no cycle. |
| `forms` | 3rd | **Converted, kept** | Same shape as `content-types`: only remaining importer is `widgets/resolvers/{contact-form,create-core-resolvers}.ts`, already off the static array. |
| `menus` (navigation) | 4th | **Converted, kept** | Only non-`server/*` importer is `features/theme/static-render.ts`, but `themes`' own `DOMAIN_SLICES` entry points at `features/theme/tool-registrations.ts`, whose real transitive import closure (`agent-tools.ts` -> `theme-files.ts` -> `theme.ts` -> `build-conformance.ts`/`handlebars-allowlist.ts`/`liquid-allowlist.ts`) never reaches `static-render.ts` or `index.ts` — traced every import in that closure directly, not assumed from same-directory proximity. Confirmed safe empirically (0 cycles/SCC after conversion). |
| `database` | 5th | **Reverted** | Opened a NEW 16-module SCC: `assistant, db, export, features/database, features/deployments, features/entries, features/pages, features/plugin-runtime, features/post, features/presentation, features/recovery, features/settings, features/source-control, features/vendor-credentials, features/workspace, seo`. Mechanism: the shared low-level `db` module ties together most of the still-static `DOMAIN_SLICES` entries at once — the risk was invisible to a plain importer grep on `features/database` alone (which showed only `server/*` and `db/sqlite/*`), only surfacing via `check:architecture --list`'s SCC dump. Reverted all 3 edits; left an explanatory trailing comment on `features/database/tool-registrations.ts` and the restored `DOMAIN_SLICES` entry in `assistant/tool-registrations.ts`, mirroring `themes`'/`post`'s revert style, naming the actual 16-module SCC. |
| `recovery` | 6th | **Converted, kept** | Shares `database`'s only outside-`server/*` importer (`db/sqlite/database-journal-repo.ts`), but Recovery's OWN imports of `features/database` (`../database/boot/reconcile-interrupted-migration`, `../database/gated-hooks`) are both `import type` — erased from the runtime-only graph `check:architecture` uses for cycles/SCC (per `tool-contribution-registry.ts`'s own header on type-only erasure). Verified empirically: 0 cycles/SCC after conversion, confirming the type-only-import reasoning held. |
| `plugins` (plugin-runtime) | 7th | **Converted, kept** | This domain's own imports are `core/commands` plus its own sibling files only (`admin-response.ts`, `activation.ts`, `agent-tools.ts`, `discovery.ts`) — it does not reach `features/database`/`db` at all, despite appearing in `database`'s 16-module SCC list (that inclusion came from the `db` hub's OTHER paths, not from anything `plugins` itself does). Every importer outside `server/*` is none. |
| `entries` | 8th (last) | **Converted, kept** | Imported by `comments/index.ts` (already registry-converted, safe) and heavily by `widgets/*` (8 files) — safe specifically because `widgets` (this batch's 1st conversion) was already off the static array by the time `entries` converted, same reasoning as `content-types`/`forms`. |

Net: **7 of 8 converted and kept** (`widgets`, `content-types`, `forms`, `menus`, `recovery`,
`plugins`, `entries`); **1 reverted** (`database`, with explanatory comment, safe to retry once
enough of the still-static cluster it's entangled with — `deployments`/`source-control`/`settings`/
`workspace`/`entries`/`post`/`pages`/`plugin-runtime`/`seo`/`export`/`vendor-credentials` — converts,
or `db`'s cross-domain imports are narrowed).

## check:architecture — before/after this batch

Baseline compared against (the corrected foundation commit `1cdc054c`'s own state, before this
batch's edits):

| Metric | Before batch 2 | After batch 2 (7 converted, database reverted) |
|---|---|---|
| propagation cost (all-import) | ~8.95%* | 11.12% |
| propagation cost (runtime-only) | ~1.95%* | 2.26% |
| back-edges into composition root | 11 | 11 |
| back-edges, runtime-only | 0 | 0 |
| module cycles (mutual pairs, runtime-only) | 0 | 0 |
| largest SCC (runtime-only) | 0 | 0 |
| module API surface (files exposed) | 213 | 213 |
| core size | ~16.27%* | 16.98% (144/848) |

*Baseline file values (`check-architecture.baseline.json`), not re-measured fresh on `1cdc054c` before
starting — the corrected-foundation commit's own landing already confirmed a clean check against this
same baseline per the team lead's report. Did NOT run `--update` — baseline update is a team-lead
decision, consistent with batch 1's own deferral.

The `database` attempt showed the revert-trigger signal clearly and immediately: largest SCC
(runtime-only) jumped 0 -> 16 the moment its 3 edits landed. After reverting database alone, it
returned to 0 before `recovery` was attempted.

## Tests run

All commands run from repo root, node's native test runner. Final comprehensive sweep across every
domain touched this batch plus every Stage 1 / batch 1 domain (regression check):

```
node --import tsx --test \
  src/widgets/__tests__/repo.contract.test.ts src/widgets/__tests__/unit/*.test.ts \
  src/widgets/__tests__/integration/*.test.ts src/forms/__tests__/*.test.ts \
  src/features/content-types/__tests__/integration/*.test.ts \
  src/features/entries/__tests__/integration/*.test.ts \
  src/features/recovery/__tests__/unit/*.test.ts src/features/recovery/__tests__/integration/*.test.ts \
  src/features/plugin-runtime/__tests__/unit/*.test.ts \
  src/features/plugin-runtime/__tests__/integration/*.test.ts \
  src/assistant/__tests__/tool-registrations.contracts.test.ts \
  src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts \
  src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts \
  src/assistant/__tests__/tool-registrations.authorization.test.ts \
  src/assistant/__tests__/tool-registrations.forms.test.ts \
  src/assistant/__tests__/tool-registrations.menus.test.ts \
  src/assistant/__tests__/tool-registrations.database-recovery.test.ts \
  src/assistant/__tests__/tool-registrations.plugins.test.ts \
  src/assistant/__tests__/tool-registrations.entries.test.ts \
  src/assistant/__tests__/tool-contribution-registry.test.ts \
  src/assistant/__tests__/tool-registrations.comments.test.ts \
  src/assistant/__tests__/tool-registrations.newsletter.test.ts \
  src/assistant/__tests__/tool-registrations.identity-authorization.test.ts \
  src/assistant/__tests__/tool-registrations.identity-contracts.test.ts \
  src/assistant/__tests__/tool-registrations.members.test.ts \
  src/assistant/__tests__/tool-registrations.redirects.test.ts \
  src/assistant/__tests__/tool-registrations.taxonomy.test.ts
```
Result: **846 tests, 838 pass, 8 fail** — all 8 failures are the two pre-existing clusters below,
verified identical (same test names, same assertions, same error messages) on the clean pre-batch
baseline via `git stash`. Zero new failures.

```
npx tsc -p tsconfig.json --noEmit
```
Result: **0 errors.**

## Known pre-existing failures — verified via git stash, not assumed

Per the brief's explicit instruction, both overlapping-name files were run on a clean, untouched copy
(via `git stash`) BEFORE their domain's conversion, and again AFTER, to distinguish real regressions
from pre-existing drift:

- `tool-registrations.menus.test.ts`: 2 failures (`'published'` vs `'draft'` fixture mismatch in two
  tests), present identically before and after the `menus` conversion. Unrelated to registry wiring —
  a domain-logic/fixture issue.
- `tool-registrations.database-recovery.test.ts`: 6 failures, all `INSTANCE_AUTHORIZATION_NOT_CONFIGURED`
  auth-fixture errors plus one risk-classification message-format mismatch, present identically before
  and after the `recovery` conversion (40 pass / 6 fail both times, same test names).

Neither cluster was chased or touched; both are pre-existing per the brief and orthogonal to this
batch's scope.

## Files changed this batch

- `src/widgets/tool-registrations.ts` — added `contributeWidgetsTools()`.
- `src/features/content-types/tool-registrations.ts` — added `contributeContentTypesTools()`.
- `src/forms/tool-registrations.ts` — added `contributeFormsTools()`.
- `src/navigation/tool-registrations.ts` — added `contributeMenusTools()`.
- `src/features/database/tool-registrations.ts` — tried, reverted; trailing comment added explaining
  the 16-module SCC.
- `src/features/recovery/tool-registrations.ts` — added `contributeRecoveryTools()`.
- `src/features/plugin-runtime/tool-registrations.ts` — added `contributePluginsTools()`.
- `src/features/entries/tool-registrations.ts` — added `contributeEntriesTools()`.
- `src/assistant/tool-registrations.ts` — removed 7 domains' static imports/`DOMAIN_SLICES` entries;
  restored `database`'s entry with an explanatory comment; updated the file header's converted-domain
  list and the `post`/`themes` revert comments that referenced `widgets`' since-changed status.
- `src/server/tool-catalog-manifest.ts` — added 7 new `contribute*Tools()` imports/calls; updated the
  header's converted-domain count (6 -> 13) and running narrative.
- `src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts`,
  `tool-registrations.widgets-authorization.test.ts`, `tool-registrations.authorization.test.ts`
  (content-types), `tool-registrations.forms.test.ts`, `tool-registrations.menus.test.ts`,
  `tool-registrations.database-recovery.test.ts` (recovery half), `tool-registrations.plugins.test.ts`,
  `tool-registrations.entries.test.ts` — each gained the `resetToolContributorsForTests()` +
  `contribute<Domain>Tools()` setup.
- `src/assistant/__tests__/tool-contribution-registry.test.ts` — extended coverage: the "installs
  exactly" list now includes all 13 converted domains; added a "database is deliberately NOT
  installed" test mirroring `post`/`themes`; extended the daemon/BYOK parity test to assert
  `widgets_list_instances`, `collections_content_type_list`, `forms_*`, `menus_list_menus`,
  `backup_list_restore_points`, `plugins_list`, `collections_entry_list` are present.

## Commits

- `fc1f10bc` — widgets, content-types, forms, menus (part 1/2).
- `970d7485` — recovery converted, database reverted (part 2/2).

## Open items for the team lead

- `features/database` remains unconverted; per its own revert comment, the 16-module SCC it opened
  ran through `assistant, db, export, features/database, features/deployments, features/entries,
  features/pages, features/plugin-runtime, features/post, features/presentation, features/recovery,
  features/settings, features/source-control, features/vendor-credentials, features/workspace, seo`.
  `entries`, `recovery`, and `plugin-runtime` have since converted off `DOMAIN_SLICES` in this same
  batch, which may have already narrowed or fully closed the remaining path — worth re-attempting
  `database` early in the next batch to check, rather than assuming the precondition is unchanged.
  If it still fails, safe conversion likely needs `deployments`/`source-control`/`settings`/
  `workspace`/`post`/`pages`/`seo`/`export`/`vendor-credentials` to convert too, or `db`'s own
  cross-domain imports narrowed. Worth a dedicated investigation pass either way, since the plain
  importer grep heuristic missed this one entirely — only `check:architecture --list`'s SCC dump
  caught it.
- 9 domains remain for future batches (`deployments`/`source-control`/`static-publish`/`media`/
  `integrations`/`workspace`/`pages`/`seo` are the sibling agent's disjoint set this session;
  `database`/`themes`/`post`/`settings` need their own preconditions first).
- The worktree staleness + missing-foundation-file issue at the start of this batch is worth a
  process note for future dispatches: verify a freshly-created worktree's `git merge-base` against
  the intended parent branch actually equals the worktree's own HEAD (i.e. zero divergence) before
  trusting "you'll see prior work as already done" in a dispatch brief, and verify a foundation
  commit's referenced files actually resolve (`git cat-file -e`) rather than trusting a prior
  session's own progress report.
