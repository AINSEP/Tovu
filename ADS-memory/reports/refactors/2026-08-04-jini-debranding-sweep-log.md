# Jini de-branding sweep — COMPLETE

**Outcome, Coordinator-verified 2026-08-04:** genuine Tovu `ADR-nnn`/`SPEC-nnn` citations in
`packages/` + `examples/` went **523 → 0**. `ADR-PIPE-nnn` **28 → 0**. `Tovu` by name **20 → 4**.

The 6 hits that still match the strict regex are all `ADR-0002` — **Open Design's** citation
scheme, not Tovu's (confirmed against the vendored OD skill doc before it was deleted). Scheduled
for removal in the 4am Open Design pass, `trig_01Lo9mGtCEgz9LJgVq6X2Rtz`.

The 4 remaining `Tovu` hits all cite `tovu-learnings.md`, a real 30KB tracked file at Jini's root.
**Owner decision pending:** rename it (and the 4 citations) vs leave it. See "Open items".

Three agents, ten commits, five `docs/decisions/` files. Test suites green throughout:
`cms` 471, `ui` 5181, `chat` 936, `daemon` 751, `http-kit` 1295 — all typecheck exit 0.

---

## Running log

Started 2026-08-04 (local Sonnet 5 subagent, Refactor persona), after three
RemoteTrigger dispatches of the same task produced zero commits.

Branch: `refactor/jini-admin-extraction` in `/Users/la/Programming/Jini`.

## Baseline (agent-measured, before any edit)

- 523 ADR/SPEC hits across 130 files in `packages` + `examples`
- 20 `Tovu` by-name hits across 11 files
- `packages/cms` tests: 62 files / 471 tests, all green
- Typecheck clean

## Discovery: a second citation scheme the original scope missed

`ADR-PIPE-NNN` (e.g. `ADR-PIPE-012`, `ADR-PIPE-015`) is the same citation scheme for
pipeline-stage ADRs (Menus, Integrations, etc.), but it does **not** match the
`ADR-[0-9]{3}` regex used to scope the sweep — the digits are not immediately after
`ADR-`. It went unmeasured in every version of the brief, including all three cloud
dispatches.

Coordinator-verified count at first checkpoint: **28 `ADR-PIPE-*` hits remaining**
repo-wide after `identity/` was cleared. Combined remaining across both schemes: **470**.

The agent extended scope to cover it on its own judgment and flagged the decision.
Final reporting should track the two schemes separately so the before/after comparison
stays honest.

## Checkpoint 1 — `packages/cms/src/identity` (commit `651d17a9`, pushed)

Coordinator verification (measured, not trusted):
- `651d17a9` present on `origin/refactor/jini-admin-extraction` ✓
- `packages/cms/src/identity` residual across both schemes: **0 hits** ✓
- `docs/decisions/permission-catalog-migration.md` exists on the remote ✓

Agent-reported detail:
- 17 files touched; all ~79 of identity's ADR/SPEC/ADR-PIPE hits removed
- Mostly NEUTRALIZE — provenance tags on otherwise self-contained rationale
- RE-HOMED: the permission catalog's 6 deprecate-not-delete migrations
  (`settings.write`, `media.write`, `navigation.manage`, `integration.manage`,
  `storage.read`, `storage.migrate`) into
  `docs/decisions/permission-catalog-migration.md`, with a table of each migration's
  completion criteria
- Sources read for re-homing were the **real ADRs**, not the code comments:
  Tovu's ADR-028 §7, plus `ADS-memory/reports/pipeline/012-menus/adr.md` and
  `015-integrations/adr.md`. Those carried Point-of-No-Return criteria the code
  comments only gestured at.
- Runtime `description:` strings in `permissions.ts` were edited (they carried
  citations). Identity suite run immediately after: no snapshot broke.
- Tests after: 62/62 files, 471/471 tests, clean typecheck — unchanged from baseline.

## Open items raised by the agent

1. **`ADR-041` has no locatable source doc.** The code cites a "naming-correction note"
   for `storage.read` / `storage.migrate`. The agent could not find a matching ADR, so
   that row of the migration table is grounded only in the self-contained code comment
   (renamed from "Storage", ambiguous with Media/Assets). **Needs an owner answer:
   where does that note actually live, if anywhere?**

2. **Two comments contradict each other about live boot wiring — a real defect, not a
   citation issue.** `seed.ts` says `migrateDeprecatedPermissionGrants()` "now IS wired
   into live boot (`identity/wiring.ts` …)", while `permissions.ts`'s file header says
   wiring it into seed.ts's boot path is "deliberately NOT done in this pass, gated on a
   security audit." Both predate the sweep. Out of scope for a citations-only pass;
   wants a Programmer/Refactor pass to establish which is true. Relevant to
   [[feedback_verify_claims_in_code_comments]] — long evidence-shaped comments in this
   repo have encoded inference as observation before.

## Agent restarted (owner call)

The first agent was stopped after `content-types` and replaced, because two `SendMessage`
deliveries about ADR-041 were silently lost and the fix needed to be *in the opening prompt*
rather than sent mid-run. Successor `jini-debrand-2` carries the full progress state.

Three files of `settings/` were mid-edit at stop. They typechecked clean, so they were
preserved as `da61440d` rather than discarded.

## Commit trail (all verified present on the remote)

| SHA | Scope |
|---|---|
| `651d17a9` | identity — 17 files, ~79 sites; 6 permission-catalog migrations re-homed |
| `adddbd9e` | media — 22 files, ~102 sites; all neutralize |
| `5c1ef725` | navigation — 14 files, ~99 sites; sed-driven |
| `cdacf082` | content-types |
| `da61440d` | partial settings (preserved at agent handover) |
| `1450b364` | **ADR-041 grounding fix** — the reason for the restart |
| `aebde855` | settings — completed; 1 re-home doc |
| `2721799f` | taxonomy — completed; 1 re-home doc |

## `docs/decisions/` produced so far

- `permission-catalog-migration.md` — 6 permission migrations, now split into
  "Breaking grant migrations" (4 rows, with Point-of-No-Return gates) and
  "Terminology correction" (`storage.*` → `database.*`, grounded in ADR-041's
  Naming-correction section, explicitly *not* a data migration)
- `settings-json-schema-variant.md` — the `{type:"json"}` variant's Code Review
  enforcement rule, plus a non-null-default invariant that deliberately diverges from the
  originating ADR's never-shipped nullable carve-out
- `taxonomy-content-type-allow-list.md` — `TAXONOMY_ALLOWED_CONTENT_TYPES` is a
  **permanent** post/page allow-list, not a stopgap (a prior draft framed it as temporary and
  that was corrected during review — documented so nobody "fixes" it back); plus why
  `assignTerms`' workspace-mismatch branch stays despite being currently unreachable

`docs/decisions/README.md` (the required two-table traceability index) is **not yet written**.

## Coordinator measurement bug — corrected

An intermediate verification reported "Tovu by name: 0", which was **false**. `git grep -E`
does not support `\b` word boundaries: `git grep -cE "\btovu\b" <tree>` matches nothing and
returns a clean zero, while `git grep -ci "tovu"` on the same tree returns 26. Always measure
this repo with `grep -rniE` on the working tree, or drop `\b`. The Tovu-by-name sites are
untouched, as expected — that task is still queued.

## Verified state at check-in 2

| Metric | Start | Now |
|---|---|---|
| strict `ADR-nnn`/`SPEC-nnn` | 523 | **89** |
| `ADR-PIPE-nnn` | 28 | **1** |
| `Tovu` by name | 20 | **20** (untouched, queued) |

`packages/cms`: 62 test files / 471 tests green and `tsc --noEmit` exit 0 — independently
confirmed by the Coordinator at `da61440d`, agent-reported after each commit since.

Directories clear: `identity`, `media`, `navigation`, `content-types`, `server`, `settings`,
`taxonomy`. Remaining: `entries` (37), `workspace` (31), `core` (24), `presentation` (2),
then the Tovu-by-name sites, then the README index.

`navigation` was the one sed-driven directory; `settings` and `taxonomy` were targeted
Read+Edit. Reviewers should look hardest at `navigation`.
