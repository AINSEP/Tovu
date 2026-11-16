# Lost updates (hard item #8) — index

Status: **COMPLETE** for the brief (classification, mechanism, rollout). Docs only; no source edited.
Date: 2026-11-16. Branch: `plan/lost-updates-design-2026-11-16` (from `plan/terra-2026-11-15`).
Code read at: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.

| File | What it holds |
|---|---|
| `DESIGN.md` | What exists, the one mechanism, carriers, UI, migration, tests, 12-step rollout, estimate, owner-practice check, unverified list, owner decisions |
| `SITES.tsv` | All 97 input sites: `n, repo, file, line_input, line_now, symbol, class, writers, evidence, fix_step, move_label, verified` |

## Result

| Class | Sites | Meaning |
|---|---|---|
| `REAL` | 13 | Two writers, no guard |
| `REAL-OPT` | 15 | Guard can be skipped, or compare is in app code before a blind write |
| `GUARDED` | 9 | Already compared in the write |
| `SAFE` | 27 | One writer, lock-serialised, or state/lease fenced |
| `LWW-OK` | 14 | Last writer wins on purpose |
| `FP` | 19 | False positive |

Real risk: **28 sites, 23 records** (25 sites in Tovu, 3 in Jini).

## Main findings

1. The generic mechanism already exists: `@jini-ai/core/optimistic-concurrency`. Nothing new is designed beside it; one helper (`hasRecordChanged`) is added to it.
2. Migration 0042 added `version` to six tables; four of them (`external_mcp_servers`, `identity_users`, `roles`, `policies`) are never compared.
3. Posts, content types, taxonomy terms and newsletter campaigns compare the version in application code and then write blind.
4. The basis is optional almost everywhere; `requireEditorVersion` (428) has no consumer.
5. Open bug confirmed by reading: a no-op forms patch bumps the version 1 → 2 (`packages/cms/src/forms/write-service.ts:276-288`).
6. Thirteen error classes and four wire codes spell the same conflict.
7. Outside the list: `SqlMemberRepo.save` guards with `version <= :next`, which two same-basis writers both pass.

## Steps (detail in `DESIGN.md` §6)

S0 no-op rule and helper · S0b shared admin conflict notice · S1 external MCP · S2 webhook status flips · S3 roles and policies · S4 members · S5 redirects · S6 posts, entries, content types, terms, campaigns · S7 forms and SEO entry routes · S8 settings groups · S9 migration 0043 + lists, subscriptions, plugin activations, media · S10 basis required (428), blind branches deleted, CI ratchet · S11 optional convergence of error spellings.

Estimate: about 13 working days without S11.

## Limits of this run

- Only the read-only audit script was run (`development/scripts/bug-class-audit.mjs`, fresh result 90 hits; 7 input rows cleared). No test was run; "red today" is from reading code.
- 44 of 97 rows are `partial`; each says what was not traced. `DESIGN.md` §10 lists the ones that could change a verdict.
- Function length and complexity were not measured. `untangle/DESIGN.md` and `LANES-files.tsv` were not read.
- The lessons file holds 11 rules, not 15.

## Owner decisions (9; `DESIGN.md` §11)

D1 body field vs `If-Match` · D2 API clients without a basis · D3 per-field vs group settings revision · D4 conflict UI scope · D5 converge error spellings · D6 `plugin_activations.revision` · D7 secrets stay last-writer-wins · D8 internal flips retry once · D9 commerce catalog.
