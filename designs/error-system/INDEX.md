# Error system design: index (2026-11-16, revision 2)

Status: **COMPLETE, revision 2** (design only; no source file edited, nothing built or run).
Branch: `plan/error-system-design-2026-11-16`. Read against Jini `integ/wave-b-r2` @ `02edbb68` and Tovu `integ/wave-b-r2` @ `80b00f5b`.

Revision 2 answers `CODEX-JUDGE.md` ("needs rework": 2 blockers, 11 majors, 1 minor). Each finding was verified in the code first. **14 accepted, 0 rebutted, 0 blockers left.** One finding (6) was accepted with a corrected premise: `jsonRoute` has no production caller; the real status owners are `mountJsonRoute` and the daemon HTTP files, and the finding holds for them.

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | The design. Starts with `## Judge response` (finding, lines verified, verdict, fix). Then: verified current state (§2), mechanism (§3), sweep plan (§4), cost (§5), owner practices (§6), the 24 lessons (§7), what was not verified (§8), owner decisions (§9) |
| `CODEX-JUDGE.md` | The judge report this revision answers |
| `SITES.tsv` | 525 rows: `repo, site, rule, status, class (real / FP / gone), pattern, fix_step, read_depth`. Every FP row now has `read_depth = ast` and names its idiom or the reason it needs no edit |
| `work/fp-recheck.cjs` | New. Reads each site's whole try/catch (or `.catch` receiver) from the syntax tree. It is also the runnable prototype of the gate's pure-parse exemption. `node work/fp-recheck.cjs SITES.tsv <jiniRoot> <tovuRoot> [FP\|real]`. Needs `typescript` at the path in line 5 |
| `work/catch-census.cjs` | Read-only count of every `catch` that never reads the caught value |
| `work/classify-sites.py`, `work/classify-overrides.json` | Revision 1's pattern classifier. Its FP output is superseded by the re-check; it is kept for the real rows |

## Numbers

| | Tovu | Jini | Total | Revision 1 |
|---|---|---|---|---|
| Flagged today on `integ/wave-b-r2` | 79 | 290 | 369 | 369 |
| — real | 12 | 188 | **200** | 190 |
| — false positive | 67 | 102 | **169** | 179 |
| Input rows no longer flagged (gone) | 150 | 6 | 156 | 156 |
| `catch` / `.catch` handlers that never read the error (census) | 684 | 1,187 | 1,871 | 1,871 |

Changed site counts:

- **10 rows moved FP → real.** 7 had been called parse refusals but read a stream, a file, stdin, a provider response or a plugin parser in the same `try`; 2 queue tails also swallow the write or emit itself; 1 auth check drops a storage failure (it keeps its 403 and gains a record).
- **Parse refusals: 82 → 75.** 65 pass the redefined exemption unchanged (prototype run), 10 pass once their project validator is on the gate's reviewed list.
- **W1 (idiom edits, no behaviour change): 88 → 77.** Optional probes and error-body parses now use `orFallback` (15 rows), which keeps today's "any failure gives the fallback". `absentWhen` rethrows, so it is used only in W5.
- **Real rows by step:** W3 89, W4 18 (was 16), W5 32 (was 31), W6 13, W7 11, W8 37 (was 30).
- 0 of the 200 real rows pass the gate's exemption.

## Mechanism changes since revision 1

1. **Disclosure.** Redaction is no longer treated as permission. Three tiers: anonymous (words + ID), signed in (what Tovu sends today), authorised for the operation (adds the listed class/code label). Error text reaches a caller only through a cause the operation's owner approved; `approveCause` has a guarded caller list.
2. **Catalog.** Two relations instead of one table: sentences keyed by code, and bindings grouped by scope (ordered, aliases legal, discriminants checked against a closed list). Lookup always names a scope.
3. **Text modes.** A binding says `own-message`, `fixed` or `sentence`, so today's model-facing strings survive adoption. Kebab form-delivery codes stay a ledger vocabulary and never enter the log describer.
4. **Wire.** Nothing is retired and no incident block is added. Tovu's flat envelope stays; Jini route errors keep their shape; the client builds Copy details. The only protocol addition is `details.params` for translated sentences.
5. **Status.** A typed `statusFor` on the existing `RouteHostContext`, read at all 11 status call sites.
6. **Chat.** One `RunFailure` type built by one function at the six places that rebuild an error; the ID is also inside the words; the saved status event keeps it. Tovu's AG-UI bridge stops sending a raw `error.message`.
7. **Electron / sidecar.** A failing handler still rejects, now with safe words and an ID. Sidecar parse refusals and handler incidents are separate changes.
8. **Outbox.** A policy declares a closed list of codes; a throwing policy is contained; each failure is logged once; correlation is row ID + attempt, with no schema change.
9. **Gate.** One precedence order for three rules; the parse exemption is defined so it can be run, and was; a new `orFallback` idiom; all idioms take `(required, optional = {})`.

## Steps (each green alone)

| Step | What | Fix-step codes in `SITES.tsv` |
|---|---|---|
| E0 | Gate in WARN mode, fixtures copied from real sites, debt baselines | — |
| E1 | Outbox `lastError` regression + failure log (red-first), can ship alone | — |
| E2 | `core/src/errors/`: sentences, bindings, catalog, reporter, approved cause, idioms, fakes | — |
| E3 | Host wiring: sinks that Tovu does not pass today | — |
| E4 | One incident path, with both-direction fixtures; removes 3 dead reporter guards | E4 (3) |
| E5a | Status resolver through the route host context | — |
| E5 | Catalog adoption per feature (sentences + bindings) | — |
| E6a / E6 | Client readers first, then UI pieces + fixed-message sites | W6 (13) |
| E7 | Pattern sweeps | W1 (77), W3 (89), W4 (18), W5 (32), W7 (11), W8 (37) |
| E8 | Chat run errors end to end + tool card | — |
| E9 | Electron IPC + sidecar | — |
| E10 | i18n of sentences, `details.params` | — |
| E11 | Gate to ERROR per package | — |

87 false-positive rows need no edit (65 + 10 parse refusals, 5 sanctioned reporting modules, 5 standalone skill scripts outside the gate, 2 test support); 2 plugin-payload rows stay on the debt list pending D9.

Estimate: about **410k Opus** (design and review) + about **2.9M Sonnet** (build). Revision 1 said 330k + 2.4M. By analogy with the untangle lanes, not measured.

## Owner decisions (details in DESIGN §9)

- **Changed:** D4 withdrawn (keep Tovu's flat envelope). D6 narrowed (no error text for signed-in users unless the operation's owner approved it). D2 now has a functional reason (one `ERR-…` format is what lets the ID survive a rebuilt `Error`).
- **New:** D9 gate scope for code that cannot import core. D10 the tracker receives message text with secrets blanked (as today). D11 own-message reasons shown to users are English only. D12 the model sees an incident's reason (2026-09-16 decision), same class of risk as D6.
- **Unchanged:** D1 log policy, D3 wire field names, D5 where the lint rules live, D7 ship E1 now, D8 ratchet the wider class.

## Owner practices with a flagged conflict (DESIGN §6)

- `(required, optional = {})`: the existing files this builds on use `_optional: Record<string, never>`; not copied, not fixed here.
- DI: `http-kit/src/internal-error.ts` and Tovu's `reportServerFailure` call `randomUUID` directly; E4 removes both.
- "Never swallowed": `orFallback` discards the error by design when no `observe` is passed. It is limited to optional probes, named and listed by the gate.
- No barrels: `core/src/primitives/index.ts` is an existing barrel; not touched.

## Known gaps

- Nothing was built or run; dependencies are not installed in the checkout used.
- The AG-UI `rawEvent` carrier is not verified; E8's first test checks it and the fallback is stated.
- Gate rules 2 and 3 were checked by reading, not by running; the prototype covers rule 1's exemption only and approves built-in methods by name, without types.
- The 190 rows revision 1 called real were not re-read (cross-checked by script only); 7 are still `unclassified-swallow`.
- Full list: DESIGN §8.
