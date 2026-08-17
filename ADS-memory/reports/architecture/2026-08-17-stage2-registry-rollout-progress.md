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
