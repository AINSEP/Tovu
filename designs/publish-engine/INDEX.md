# Publish engine design: index

Status: **COMPLETE, revision 2** (design only; no source changed, no test run). 2026-11-16.
Bases: Tovu `refactor/terra` @ `80b00f5b`, Jini `refactor/terra` @ `02edbb68` (both include wave B; in-scope source is identical to the first pass's `65302ee5`).
Branch: `plan/publish-engine-design-2026-11-16`.

| File | What it holds |
|---|---|
| `DESIGN.md` | the design, revised; section 13 is the judge response |
| `CODEX-JUDGE.md` | the Codex gpt-6.1-sol HIGH judgment of the first pass: needs rework, 3 blockers, 9 majors |

## Judge result

12 findings, each verified in code before it was accepted. **Accepted 12, rebutted 0. Blockers left: 0** in the design. Three findings were larger than reported: 71 of 73 test files use `node:test` (cms runs vitest); 87 of 128 exported functions miss the args convention (the first pass said 23); the registry has four direct readers and two install callers.

## Read this first

1. **Size.** 48 files, 11,314 production lines, 73 test files. Two files now stay in Tovu (`media-references.ts`, `content-references.ts`): they import the cms `widgets` domain, which the publish domain may not do.
2. **Order.** Phase 0 (ten Tovu-only steps) -> B01 -> F1 -> F2 -> B02 (S1, S2, S4, S3, S5) -> B03 (P0 `peer-url`, P3, P1, P2, P4); trust (T1-T3) beside the engine.
3. **Delivery.** Tovu installs cms from the npm registry, so a Jini commit does not reach Tovu. The moves ship as four cms release trains (R1-R4): tarball check, publish, dependency commit, then the Tovu commits that delete code.
4. **Estimate.** About 3.7M Sonnet and 0.49M Opus tokens (was 2.6M / 0.43M).

## Where to find things in DESIGN.md

| Section | Content |
|---|---|
| 0 | summary |
| 1 | inventory per group; 1.7 lists stale sheet claims |
| 2 | port checks: HTTP client, keyring, vault; 2.4 signature census (87 functions, about 39 port methods) |
| 3 | every trust decision, signature step and key path with owner and failing test; 3.3 frozen values; **3.4 host gates H1-H12; 3.5 compensation C1-C2 and blob key K10** |
| 4 | target shape: **no entry files**, run-time label per leaf, isolation crossings, registry per composition root, `beforeSaveHook` contract, `PeerStorePort` (8 operations + errors), compensation reporter |
| 5 | **5.0 release trains, 5.1 test runner conversion**, Phase 0 with four scripted exit gates, move graph rebuilt from real imports |
| 6 | characterization tests and the mutation proof (37 rows) |
| 7, 8 | risks; untangle lanes, waves, size designs |
| 9 | estimate per step |
| 10 | owner decisions OD-1 to OD-14 |
| 11 | what was not verified (U1-U13) |
| 12 | owner practices table; row 9 is the inventory of 41 catch sites |
| 13 | judge response, lessons applied (26 rules), practice conflicts |

## Riskiest three calls

1. **Registry instance per composition root** plus the generic port bag: 41 importers, 229 test call sites, six readers, two boot paths. T-REG-ROOT is the proof.
2. **`PeerStorePort`.** The sealed envelope no longer enters the Jini domain; the Tovu adapter must keep "rename does not reseal", revision checks and the context check. The draft was written from a full read of `peers.ts`, but not compiled.
3. **Test conversion between runners.** About 60 files change runner in the same commits that move their subjects. Executed-count parity and a re-run of the mutation proof on converted trust and peer suites are the guards.

## Owner decisions needed

- OD-1 registry instance (yes); OD-2 trust in `cms/publish/trust` (yes); OD-4 platform-binding adapters stay in Tovu for now; OD-5 key purposes host-supplied; OD-6 failure-code rename only after a consumer census; OD-7 `KeyringPort` merge is a separate lane; OD-8 R-BARRELS first
- **OD-3 (revised)** export keys point at implementation files; only the specifier naming needs a ruling
- **OD-9** report compensation failures in connect/disconnect (adds a diagnostic)
- **OD-10** six places read an error as "absent": keep and report, or narrow
- **OD-11** four release trains or fewer
- **OD-12** convert about 39 port-interface methods to the args convention
- **OD-13** `registry.list()` returns a frozen copy
- **OD-14** trust middleware's silent 401 and `console.error` stay as a recorded Tovu follow-up

## Not done here

- No executor sheets. Opus drafts for the function splits come first.
- No test, typecheck or isolation check was run: neither checkout has dependencies installed. Closure and signature numbers come from regex scripts and must be regenerated with the compiler.
- Per-file classification of the 73 test files into "convert" or "stays in Tovu" was done for five files only.
