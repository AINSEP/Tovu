# Lost updates (hard item #8) — index

Status: **COMPLETE, revision 2** (answers `CODEX-JUDGE.md`). Docs only; no source edited.
Date: 2026-11-16. Branch: `plan/lost-updates-design-2026-11-16`.
Code read at: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.

| File | What it holds |
|---|---|
| `DESIGN.md` | What exists, rules M1–M10, carriers, external MCP writer table, credentials, plugin fencing, search and baseline fences, UI, error table, migration, tests, 16-step rollout, estimate, owner-practice check, unverified list, owner decisions, **§12 Judge response** |
| `SITES.tsv` | All 97 input sites plus X1–X6 found outside the list: `n, repo, file, line_input, line_now, symbol, class, writers, evidence, fix_step, move_label, verified` |
| `CODEX-JUDGE.md` | The Codex gpt-6.1-sol review of revision 1: 1 blocker, 11 majors |

## Judge response in one line

12 findings checked against the code: **11 accepted, 1 accepted in part** (finding 11: the claim that
the SQL dialect matrix breaks the test-isolation rule is rebutted with evidence), **0 rejected.
Blockers left: 0.** Detail and file:line evidence: `DESIGN.md` §12.

## Result

| Class | Rev 1 | Rev 2 | Meaning |
|---|---|---|---|
| `REAL` | 13 | 16 | Two writers, no guard against the other |
| `REAL-OPT` | 15 | 19 | Guard can be skipped, or uses the request's own read, or sits in app code before a blind write |
| `GUARDED` | 9 | 7 | Compared in the write with a basis the caller must send |
| `SAFE` | 27 | 24 | One writer, or lock-serialised with no stale input, or state/lease fenced |
| `LWW-OK` | 14 | 12 | Last writer wins on purpose |
| `FP` | 19 | 19 | False positive |

Real risk: **35 sites** (32 Tovu, 3 Jini), about 30 records, plus 6 writers outside the list.
`partial` rows: 27 (was 35).

Reclassified: 19, 91 `GUARDED` → `REAL-OPT`; 27, 58, 74 `SAFE` → `REAL`; 83, 85 `LWW-OK` → `REAL-OPT`.
Evidence corrected, class kept: 6, 14, 15, 21, 26, 49, 62, 70, 72, 75, 82, 90.

## Main findings

1. The generic mechanism already exists: `@jini-ai/core/optimistic-concurrency`. Nothing new is designed beside it. One string export is added (`versionConflictGuidance`); revision 1's `hasRecordChanged` is withdrawn.
2. **External MCP (the blocker):** seven callers upsert the whole row from an earlier read, in `@jini-ai/mcp`, `@jini-ai/integrations` and `@jini-ai/agent-plugins`; the access writer never advances the version. A token refresh in flight can re-enable a server an admin just disabled.
3. A lock or a same-request read stops interleaving, not a save from an old screen. This moved users, roles, policies, page HTML, email templates and the assistant credentials into the real-risk set.
4. Posts already have a correct conditional save and a no-op rule. The plan extends them; revision 1 mis-described them.
5. A no-op must pass through the command owner without a change set or event: one new sibling of `executeCommand`.
6. Plugin enable/disable has three undo paths that write the old row blind and one that swallows its own failure.
7. Search bookkeeping and publish baselines are shared across runs and were written blind.
8. Credentials are in the vault with a revision already; the missing part is the client's basis and a 409 instead of a 500.
9. 19 touched files are over 500 lines and 4 touched functions over 50; none has a size design.

## Steps (detail in `DESIGN.md` §6)

S0 no-op rule through the command owner · S0b conflict notice in `@jini-ai/ui` + Tovu binding · S1 external MCP (4 Jini packages + Tovu) · S2 webhook status flips · S3 users, roles, policies · S4 members · S5 redirects · S6 posts, entries, content types, terms, campaigns · S7 forms and SEO entry routes · **S7b** HTML replace carriers (email templates, page HTML) · S8 settings groups · S9 migration 0043 + lists, subscriptions, plugin activations, media, vault-backed credentials · **S12** search bookkeeping · **S13** publish baseline · S10 basis required (428), blind branches deleted, CI ratchet · S11 optional renaming of error classes and codes.

Estimate: **about 22.5 working days without S11** (revision 1: 13). Size splits, if chosen (D11), are extra.

## Limits of this run

- Only read-only scripts were run (the audit script earlier; a line-count script now). No test was run; "red today" is from reading code.
- 27 of 97 rows are `partial`. `DESIGN.md` §10 lists which `SAFE` / `LWW-OK` / `FP` rows were re-read and which were re-checked from their recorded evidence only.
- Complexity was not measured. `untangle/DESIGN.md` and `LANES-files.tsv` were not read.
- `LESSONS-FOR-DESIGN-BRIEFS.md` at `b62acb7e` holds 11 rules, not the 17 the brief names. The 11 and the judge's five recurring classes were applied (`DESIGN.md` §9).
- Not verified: whether more than one process hosts a plugin runtime; whether the memory identity transaction fake is exclusive; three wire codes (content types, terms, campaigns).

## Owner decisions (14; `DESIGN.md` §11)

D1 body field vs `If-Match` · D2 API clients without a basis · D3 per-field vs group settings revision · D4 conflict UI scope · D5 rename error spellings · D6 `plugin_activations.revision` · D7 intent-only requests stay last-writer-wins (credentials no longer do) · D8 internal changes retry once · D9 commerce catalog.

New in revision 2:

- **D10** Media providers PUT: wrap the body as `{ providers, expectedRevisions }` (changes a `@jini-ai/ui` port). Recommended: wrap.
- **D11** Size: split the 19 over-limit files first, or accept a no-growth rule for this item. Recommended: no-growth rule; `updatePost` and `resetUserPassword` are named exceptions.
- **D12** SQL-adapter race tests stay beside the adapter on the dialect matrix, or move to an integration host. Recommended: stay.
- **D13** Users, roles, policies: client basis, or an explicit last-writer-wins exception. Recommended: client basis.
- **D14** External MCP: token refresh and OAuth status do not advance the editing version. Recommended: yes.
