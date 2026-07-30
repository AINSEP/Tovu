# Implementation Outline: Server Module Convention — Fifth Slice (forms-admin, redirects, analytics)

- Spec: SPEC-041 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: System Wiring only — same established ADR-046/SPEC-031 pattern.
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | 15 registrars across 3 domains |
| Contract Change | no | `redirects`/`analytics` reused pre-existing narrow types verbatim; `forms-admin`'s new `FormsRouteDeps` is additive, no existing signature narrowed (unlike SPEC-040's users/settings) |
| System Wiring | yes | `app.ts` composition-root call sites changed |
| Critical Cross-Boundary Invariant | no | Byte-identical behavior required, no new invariant |
| Parallelization Ambiguity | no | 3 independent domains, done sequentially |

## Module/File Map

| File | Domain | Notes |
|---|---|---|
| `routes/admin/forms/deps.ts` (new) + `modules/forms-admin.ts` (new) | forms-admin | `FormsRouteDeps` includes `changeSets`/`outbox` — found by reading `create.ts`/`update.ts`'s `write-service.ts` call sites, not obvious from the route files alone. Named distinctly from the pre-existing, unrelated `modules/forms.ts` (fan-out subscriber). |
| `modules/redirects.ts` (new) | redirects | Zero per-file changes — all 7 registrars already used the pre-existing `RedirectRouteDeps` |
| `modules/analytics.ts` (new) | analytics | Zero per-file changes — the single registrar already had its own narrow type |
| `src/server/app.ts` | — | 15 inline calls replaced by 3 module-factory calls; analytics' call site was NOT contiguous with forms-admin/redirects in the original file — each module's call preserved its own original relative position, not consolidated into one block |

## Test Expectations (mapped to spec ACs)

| AC | Verified by |
|---|---|
| AC-01 (forms-admin) | `forms-admin-crud.test.ts`, `forms-submissions.test.ts`, `forms-auth.test.ts` — pass, every test title checked individually in TAP output |
| AC-02 (redirects) | `redirects-auth.test.ts`, `redirects-site-serving.test.ts` (the T041b case, distinct from the pre-existing unrelated T041/INV-03 failure) — pass |
| AC-03 (analytics) | `analytics-recent-hits.test.ts` — pass |
| AC-04 (full suite unchanged) | 1700/1698/2 before and after — I re-ran this independently, matches exactly |
| AC-05 (typecheck, dead imports) | `npx tsc --noEmit -p .` — I re-ran independently, clean; grep for the 15 relocated registrar names — I re-ran independently, zero matches |

## Critical Invariants

None new.

## Downstream Handoff Notes

- Implementer noted the default `node --test` spec-reporter truncated on a large single-assertion diagnostic in this environment during its own verification run — worked around with `--test-reporter=tap`. Confirmed this is an environment/output-size quirk (reproducible on the pre-change baseline too), not a signal about this change. Worth remembering as a general debugging note if a future large-suite run appears to hang or truncate: try the TAP reporter before assuming a real failure.
- This is the 5th of 6 planned Phase 3 slices — only SPEC-042 (storage/recovery, content-types/entries, SEO) remains before the entire route-registration sweep is complete.
