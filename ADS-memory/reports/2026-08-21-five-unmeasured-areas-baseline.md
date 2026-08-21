# Truthful baseline: 5 never-measured areas (identity, navigation, newsletter, members, forms)

Date: 2026-08-21
Method: `TEST_CONCURRENCY=2 node --import tsx --test --experimental-test-coverage`, scoped per
area — never `npm run test:cov` / full-repo. Each area's own `__tests__/*.test.ts` files PLUS the
cross-cutting `src/assistant/__tests__/tool-registrations.<domain>*.test.ts` file(s), where they
exist, run together in one invocation — a domain's `tool-registrations.ts` wiring function
(`contribute<Domain>Tools`) is called only from those assistant-side tests, not from the domain's
own `__tests__/` directory, so excluding them would misreport a tested function as untested.

**Methodology note for whoever measures the next domain area**: always check for a matching
`src/assistant/__tests__/tool-registrations.<domain>*.test.ts` and fold it into the scoped run
before trusting a `tool-registrations.ts` number. This is the general "a scoped run understates
because a DIFFERENT suite exercises the file" trap — a directory-only scope would have shown every
one of these five domains' wiring functions as untested when they are not. Verified by import,
not assumption, for all five: `identity`, `menus` (navigation), `newsletter`, `members`, `forms`.

**Every run below was integrity-checked**: grepped each resulting `SF:` block set for
`__toCommonJS`/`__copyProps`/`__toESM`/`__export` (the dual-module-instantiation corruption
marker). **Zero markers in all five runs** — these five scoped measurements are clean. Also
checked all five for duplicate `FN:` entries (same name, same file) — **zero duplicates found**,
so the numbers below are not inflated or deflated by that tooling defect either. All test suites
passed (0 failures) across all five runs.

**The only previously-published numbers for these areas came from the corrupt full-repo run and
have already been publicly withdrawn** (identity 55.53% line, navigation 51.55% func, newsletter
63.74% line — all five areas were 100% marker-flagged in that run). Do not cite them, including as
a rough prior; the real numbers below are frequently 30-40 points higher.

## Headline (aggregate across each area's real, executable files)

| Area | Func | Branch | Line | Corrupt full-repo figure (withdrawn) |
|---|---|---|---|---|
| navigation | 24/24 (100%) | 27/28 (96.4%) | 415/415 (100%) | 51.55% func |
| identity | 80/81 (98.8%) | 92/94 (97.9%) | 792/796 (99.5%) | 55.53% line |
| members | 189/190 (99.5%) | 342/382 (89.5%) | 2815/2822 (99.8%) | (not separately cited) |
| forms | 106/106 (100%) | 244/263 (92.8%) | 1776/1795 (98.9%) | (not separately cited) |
| newsletter | 241/264 (91.3%) | 424/479 (88.5%) | 3209/3496 (91.8%) | 63.74% line |

**These areas are, on the whole, in much better shape than the corrupt numbers implied.** Four of
five are at or above 97% line coverage already. The exception is newsletter, and within newsletter
the gap is not evenly spread — one file (`send-pipeline.ts`) accounts for the overwhelming majority
of it (see below).

Type-only files (`ports.ts`, `types.ts` in most areas, and each area's `index.ts` barrel where it
re-exports only types/interfaces) correctly produce no `SF:` block at all — there is no runtime
code to instrument, not a coverage gap. Verified by reading each: no `export const`/`export
function`/`export class` in any of them.

## navigation (3 real source files — smallest, closest to done)

| File | Func | Branch | Line |
|---|---|---|---|
| `index.ts` | 0/0 (n/a — pure re-export barrel) | 1/1 | 141/141 |
| `repo.sqlite.ts` | 22/22 | 23/24 (95.8%) | 239/239 |
| `tool-registrations.ts` | 2/2 | 3/3 | 35/35 |

One gap: `repo.sqlite.ts`'s `rebuildForWorkspace` (real line 226, `if (required.bindings.length
=== 0) return;`) — the empty-bindings early-return branch has never been exercised. `index.ts` is a
documented barrel (its own file header: "re-exported from `@jini-ai/cms/navigation`... there is no
SQLite export on this barrel"), not a shim hiding untested logic — the domain's real logic lives in
the `@jini-ai/cms` package now; only the SQLite adapter is host-owned.

## identity (3 real source files — security-adjacent, prioritized second)

| File | Func | Branch | Line |
|---|---|---|---|
| `repo.sqlite.ts` | 71/71 | 81/83 (97.6%) | 547/547 |
| `tool-registrations.ts` | 2/2 | 3/3 | 30/30 |
| `wiring.ts` | 7/8 (87.5%) | 8/8 | 215/219 (98.2%) |

Gaps: `repo.sqlite.ts` has 2 zero-hit branches, both inside `SqlitePolicyRepo` (one in
`toPolicyRecord`, one in `save`). `wiring.ts` has one zero-hit function (`anonymous_5`, a nested
callback inside `buildIdentityRouteDeps`) and 4 zero-hit lines in the same span — needs the actual
code read before characterizing as real gap vs. dead branch (queued for the close-the-gaps pass).

## members (11 real source files)

| File | Func | Branch | Line |
|---|---|---|---|
| `access-resolver.ts` | 9/9 | 30/31 (96.8%) | 144/144 |
| `agent-tools.ts` | 0/0 (n/a) | 1/1 | 132/132 |
| `consent-service.ts` | 9/9 | 21/23 (91.3%) | 259/260 |
| `index.ts` | 0/0 (n/a) | 1/1 | 113/113 |
| `mailer.console.ts` | 9/9 | 18/19 (94.7%) | 92/92 |
| `repo.memory.ts` | 69/70 (98.6%) | 105/114 (92.1%) | 400/402 |
| `repo.sqlite.ts` | 57/57 | **73/86 (84.9%)** | 566/567 |
| `subscriber-directory.ts` | 10/10 | 14/14 | 130/130 |
| `tool-registrations.ts` | 9/9 | **20/26 (76.9%)** | 222/223 |
| `types.ts` | 5/5 | 6/6 | 292/292 |
| `write-service.ts` | 12/12 | **53/61 (86.9%)** | 465/467 |

Worst-first order for members: `repo.sqlite.ts` (13 branch gaps, largest by volume),
`write-service.ts` (8 branch gaps), `tool-registrations.ts` (6 branch gaps, worst ratio),
`repo.memory.ts` (1 func gap + 9 branch gaps).

## forms (10 real source files, 1 never-exercised)

| File | Func | Branch | Line |
|---|---|---|---|
| `agent-tools.ts` | 0/0 (n/a) | 1/1 | 290/290 |
| `errors.ts` | 15/15 | 16/16 | 54/54 |
| `forms.ts` | 5/5 | 55/57 (96.5%) | 221/223 |
| `notify-subscriber.ts` | 3/3 | 12/14 (85.7%) | 102/105 |
| `rate-limit-profile.ts` | 2/2 | 3/3 | 29/29 |
| `repo.memory.ts` | 21/21 | 39/40 (97.5%) | 106/106 |
| `repo.sqlite.ts` | 20/20 | 29/33 (87.9%) | 211/213 |
| `submit-service.ts` | 2/2 | 12/12 | 124/124 |
| `tool-registrations.ts` | 20/20 | 39/45 (86.7%) | 346/346 |
| `write-service.ts` | 18/18 | 38/42 (90.5%) | 293/305 |
| `manifest.ts` | **no `SF:` block at all — see below, this is not a scope artifact** | | |

Forms is the strongest of the three larger areas: 100% function coverage everywhere, branch gaps
all in the 85-97% range (no single catastrophic file).

**`manifest.ts` is a dead-file finding, not a coverage gap — verified by exhaustive import search,
per instruction to check before concluding anything.** My first pass wrongly read a grep hit in
`src/widgets/registry.ts` as an import; re-checked and that hit is a doc-comment mention
(`` `forms/manifest.ts`'s stricter zero-function convention... `` — prose, not a statement).
Re-searched properly: `grep -rn "forms/manifest" src --include='*.ts'` returns exactly that one
comment and nothing else, anywhere in `src/`. `manifest.ts`'s own file header claims it is "read by
ordinary hand-wired registration code today: `server/app.ts` (route registration),
`identity/permissions.ts` (permission catalog registration)" — both claims checked directly:
`server/app.ts` imports `forms/repo.memory.js`, `forms/rate-limit-profile.js`, and the `forms`/
`forms-admin` server modules, but never `forms/manifest.js`; `src/identity/permissions.ts` does not
exist in this repo at all (that path belongs to `@jini-ai/cms`, a different package). **`manifest.ts`
(the OQ-01 seam — closed field-type vocabulary and capability strings, `FIELD_TYPE_VOCABULARY` /
`FORMS_CAPABILITIES`, REQ-02/INV-02) is imported by nothing in `src/`.** Its own doc comment's
claim about being consumed today is false, not aspirational-but-stale — worth a second pair of eyes
on whether this is an orphaned migration remnant (the retrofit it was built for never happened) or
a wiring bug (something should import it and doesn't). Not something to paper over with a test.

## newsletter (15 real source files — worst area, worst file by far)

| File | Func | Branch | Line |
|---|---|---|---|
| `agent-tools.ts` | 0/0 (n/a) | 1/1 | 322/322 |
| `campaign-write-service.ts` | 13/13 | 31/36 (86.1%) | 215/229 |
| `campaign.ts` | 2/2 | 35/35 | 95/95 |
| `confirmation.ts` | 5/5 | 16/21 (76.2%) | 159/169 |
| `data-module-manifest.ts` | 3/3 | 4/5 (80%) | 145/146 |
| `errors.ts` | 27/29 (93.1%) | 28/29 (96.6%) | 101/101 |
| `hooks.ts` | 5/5 | 14/14 | 92/92 |
| `launch-gate.ts` | 2/2 | 11/11 | 89/89 |
| `lists.ts` | 5/5 | 15/17 (88.2%) | 114/115 |
| `repo.memory.ts` | 76/83 (91.6%) | 97/105 (92.4%) | 284/293 |
| `repo.sqlite.ts` | 61/63 (96.8%) | 65/75 (86.7%) | 616/641 |
| **`send-pipeline.ts`** | **4/13 (30.8%)** | 5/7 (71.4%) | **202/407 (49.6%)** |
| `subscriptions.ts` | 4/4 | 25/26 (96.2%) | 175/175 |
| `tool-registrations.ts` | 26/29 (89.7%) | 60/74 (81.1%) | 467/480 |
| `unsubscribe.ts` | 8/8 | 17/23 (73.9%) | 133/142 |

**`send-pipeline.ts` is the single worst file across all five areas by a wide margin**: under a
third of its functions and under half its lines ever execute in the current scoped test run. This
is the clear worst-first target once navigation and identity (small, prioritized by directive) are
closed. `errors.ts`'s 2 zero-hit functions are error classes never thrown in this scope — needs
checking whether they're thrown anywhere in the repo (the `UnauthenticatedError` precedent: a
documented-but-currently-unreachable class stays, it doesn't get deleted) before deciding
disposition.

## Priority order for the close-the-gaps pass

1. **navigation** — 1 branch, `repo.sqlite.ts` (per directive: smallest, strongest single-test-file
   smell, finish first).
2. **identity** — 2 branches (`repo.sqlite.ts`) + 1 function/4 lines (`wiring.ts`) (per directive:
   security-adjacent, gaps matter more here).
3. **newsletter `send-pipeline.ts`** — worst file measured, worst first among the three larger
   areas.
4. Remainder of newsletter, then members (worst branch ratios: `repo.sqlite.ts`,
   `tool-registrations.ts`, `write-service.ts`), then forms (its scattered 85-97% branch gaps;
   `manifest.ts` is a dead-file question for a human/Refactor decision, not a test-writing task) —
   ranked by this measurement, not guessed.

No test code has been written yet. This report is committed before any fix begins, per instruction.

## Conclusion: this is a pattern across the session, not a one-off

`navigation` was published at 51.55% func off the corrupt full-repo run; it is actually 100%.
`identity` was published at 55.53% line; it is actually 99.5% (98.8% func, 97.9% branch).
`newsletter` was published at 63.74% line; it is actually 91.8% (91.3% func, 88.5% branch), and even
its worst file was never separately called out by the corrupt number. Every area measured honestly
tonight — across both this batch and the batch before it (`src/core`, `src/db`,
`analytics`/`export`/`media`, `webhook-repo.sqlite.ts`, `routing.ts`) — has come back dramatically
better than the full-repo run claimed, by 30-45 points in most cases. The corrupt full-repo run was
not a slightly-pessimistic estimate; it was systematically, severely wrong in one direction, on
every area anyone has bothered to re-measure scoped. That is the real headline of this whole
session: the dual-module-instantiation defect didn't just blur a few numbers, it fabricated a
false "this repo is badly undertested" narrative that a truthful measurement does not support.
