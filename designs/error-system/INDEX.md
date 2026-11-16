# Error system design: index (2026-11-16)

Status: **COMPLETE** (design only; no source file edited, nothing built or run).
Branch: `plan/error-system-design-2026-11-16`. Read against Jini `integ/wave-b-r2` @ `02edbb68` and Tovu `integ/wave-b-r2` @ `80b00f5b`.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | The design: verified current state (§2), mechanism (§3), sweep plan (§4), cost (§5), owner practices check (§6), lessons applied (§7), what was not verified (§8), owner decisions (§9) |
| `SITES.tsv` | 525 rows: `repo, site, rule, status, class (real / FP / gone), pattern, fix_step, read_depth` |
| `work/catch-census.cjs` | Read-only count of every `catch` that never reads the caught value. `node work/catch-census.cjs <repo> packages` (Jini) or `… <repo> apps packages` (Tovu). Needs `typescript` at the path in line 2 |
| `work/classify-sites.py`, `work/classify-overrides.json` | The pattern classifier and its 73 hand corrections. It reads a fresh `owner-rules-audit.mjs --json` output plus the two input TSVs; paths at the top are placeholders (`<scratch>/`) |

## Numbers

| | Tovu | Jini | Total |
|---|---|---|---|
| Input rows | 228 | 293 | 521 |
| Flagged today on `integ/wave-b-r2` | 79 | 290 | 369 |
| — real | 10 | 180 | **190** |
| — false positive | 69 | 110 | **179** |
| Input rows no longer flagged (gone) | 150 | 6 | 156 |
| `catch` / `.catch` handlers that never read the error (census) | 684 | 1,187 | 1,871 |

Checked by reading: all 369 flagged rows at line depth, 15 with 10+ lines of context, 7 not read (`unclassified-swallow`). The 156 gone rows were decided by script.

## The mechanism in three lines

1. Each feature declares its error codes (status, retryable, plain words, what to do) with `defineErrors`; the host joins them into one catalog that feeds HTTP status, model-facing text and log labels.
2. One reporter, built by the host from ports (ids, clock, logger, tracker, versions), turns any caught value into either a refusal (catalog words) or an incident (error ID + redacted host record + tracker report) with required, specific fallback words.
3. Every boundary carries the existing `ApiError`; the client turns it into the existing `UserFacingError` and shows the existing `ErrorNotice` with Copy details. A ratchet gate blocks new unread catches and generic text.

## Steps (each green alone)

| Step | What | Fix-step codes in `SITES.tsv` |
|---|---|---|
| E0 | Gate in WARN mode + debt baselines | — |
| E1 | Outbox `lastError` regression (red-first), can ship alone | — |
| E2 | `core/src/errors/`: catalog, reporter, idioms, fakes | — |
| E3 | Host wiring: sinks that Tovu does not pass today | — |
| E4 | One incident path + N-1 decoder fixtures | — |
| E5 | Catalog adoption per feature | — |
| E6 | UI pieces + fixed-message sites | W6 (13) |
| E7 | Pattern sweeps | W1 (88), W3 (89), W4 (16), W5 (31), W7 (11), W8 (30) |
| E8 | Chat run errors + tool card | — |
| E9 | Desktop IPC + sidecar | — |
| E10 | i18n of catalog sentences | — |
| E11 | Gate to ERROR per package | — |

91 false-positive rows have `fix_step = none`: 82 parse refusals the gate rule passes as they are, 9 payload scripts, test support or strings that are not error text.

Estimate: about 330k Opus (design and review) + about 2.4M Sonnet (build), by analogy with the untangle lanes, not measured.

## Owner decisions (details in DESIGN §9)

D1 log policy (library line = class + code + ID; host record = text with secrets blanked) · D2 one error ID format for new incidents · D3 keep `requestId` as the wire name · D4 retire Tovu's flat admin envelope · D5 where the lint rule lives · D6 show a redacted cause to signed-in admins · D7 ship E1 now · D8 ratchet the wider class instead of sweeping it by row.

## Known gaps

- The brief mentions 22 lessons; the lessons file on `plan/size-designs-2026-11-16` has 11. Those 11 were applied (DESIGN §7).
- The "13 error classes / 4 wire codes" figure from the lost-updates design could not be found or reproduced (DESIGN §2.4).
- The Tovu input list was made on an older tree; `SITES.tsv` is built from a fresh audit run, with the old rows kept as `gone`.
- Full list of unverified points: DESIGN §8.
