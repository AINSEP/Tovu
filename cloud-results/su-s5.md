# su-s5 — STOPPED at OD-1 (no code changed)

Date: 2026-11-18. Branch: wave3/su-s5 (Tovu only; Jini not pushed, nothing to push).
Base: origin/refactor/terra = Tovu ada11733f / Jini 4c1892368. wave2/su-s1 not merged (no work started).

## Result
STOP, per the run's rule "OD-1 of that plan: take the answer from the decisions ledger; if the ledger has no answer for it, STOP".

## Why
- Plan INDEX-SU.md §4 (local ids, "not the xpkg ids"): OD-1 = "SQL adapters of ports declared in `@jini-ai/core`
  (settings, confirmation tokens, verified origin, change sets, outbox) live in `@jini-ai/db/<name>`". Only a
  recommendation there (YES). S5a/S5b/S5c all list "OD-1" as a prerequisite.
- Ledger origin/plan/owner-decisions-2026-11-17: `2026-11-17-OWNER-DECISIONS-ANSWERED.md` and
  `2026-11-17-OWNER-DECISIONS.md` (commits ab137856, c1ca1831, b235e112) contain no entry for lanes S/U OD-1..OD-9
  (grep for lane S, S5, @jini-ai/db, OD-1, database, settings, origin, gated: only unrelated hits — DX-OD1 =
  @tovu/host-shared, TC-OD1, XP-OD*, LU-B1 "S5" = lost-updates sheets, XP-QG1 chat devDependency).
- Nearest entry, LO-DB0 = "HOLD all DB sheets" (left-out lane), is not an answer to OD-1 and, if it applies to
  these DB-adapter sheets, would itself block them. Not interpreted either way.

## Gates run
None (no setup, no builds, no tests; nothing modified besides this file).

## Left
S5a (db settings), S5b (gated mutations), S5c (verified origin) — all not started. S6a / S8c not in scope.

## Next step
Owner adds an answer for lanes-S-U OD-1 (and says whether LO-DB0 covers the S-lane DB adapters) to the decisions
ledger; then re-run su-s5 (merge origin/wave2/su-s1 first, then S5a -> S5b -> S5c).

## Overlaps with su-cms
None (no files touched).
