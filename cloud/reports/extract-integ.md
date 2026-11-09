# EXTRACT-INTEG

Status: integration and requested fixes committed; combined gate in progress. Started 2026-11-09 16:27 UTC; three-hour deadline 19:27 UTC. No completion marker is claimed yet.

Both branches are `cloud/extract-integ`, created from the exact supplied session 4 tips. No `cloud/combine` merge, main change or publication.

| Merge | Tovu | Jini |
| --- | --- | --- |
| S5 | 0c127ef68 | b99109266 |
| S6 | c0c2c705b | e15c6c0da |
| S8 | de1fc1a81 | caafcade4 |

S5 conflicts: Tovu `contracts/core/external-mcp-access.ts` kept the canonical S5 package shim rather than duplicate the implementation; S4's F2 snapshot key order, strict-read and validation/public-text notes were transplanted to Jini's canonical `mcp/src/federation/hosted/access.ts`. Jini hosted `config.ts` and `record.ts` kept S5's neutral declaration wording and additional custody notes. Every conflict was documentation or replacement-shim overlap; runtime implementation/why comments were retained. No S6/S8 manual conflicts. Manifests merged additively; uniquely named changesets and each session's reports remain.

Implemented finding commits and focused evidence (final gate results to follow):

| Finding | Tovu | Jini | Red → green |
| --- | --- | --- | --- |
| S5-1 | — | c5762c167 | Registration/device/callback canary: 5 fail/6 pass → 11 pass; with existing token redaction 27/27 |
| S4-1 | a309dc12b | 8b25c2332 | Foreign enable/default-grant repair: 2 fail → 2 pass; Tovu sentence supplied unchanged |
| S4-2 | — | c16cb354b | Declaration-local active human authority checks before disclosure/after confirm; authenticated binding and scope/person match; runtime unchanged |
| S4-3 | 00028e4d1 | b022f2a5d | Object-argument regression: 2 fail → 2 pass; Tovu positional wrappers retained |
| S4-4 | 1ee3b00cb | — | Original scanner ENOENT against dist-only fixture → scanner pass; full six tests pass against fixture with no src |
| S4-5 | — | 8948ff75c | AST import scanner: 12 own-barrel edges fail → pass across all connect source files |
| S8-1 | 89397b300 | — | Safe validation/egress text and classify-once/identity regression: 3 fail → 3 pass; full file 17/17 |
| S8-2 | 3cdf04d0d | — | Runtime allowlist confirmed admitted/exchange-only; exactly the permitted additive scanner entries made. Two unrelated residual scanner findings are being compared with supplied pins. |
| Integration test wiring | — | 8a483889c | S4 BYO origin test lacked S5's required callback rules: 3 fail → 3 pass after injecting existing real fixture; assertions unchanged |

S5 whole-path search found only token and registration provider-error interpolation; both now allow known protocol vocabulary only. Device and callback metadata also refused unknown provider values. Canaries are concatenated synthetic strings. No raw provider error is attached as a cause.

Gate selection: exact S4 83-file, S5 219-file and S8 56-file lists; S6 named groups reconstructed from report/inventory citations because its untracked original scratch lists are absent. Current union 308 Tovu files plus separately timed known enable-access test; Jini named groups plus new regressions. No broad test suite substituted. Vitest uses maxWorkers=2/minWorkers=1. Original immutable XP3 declaration snapshot independently built at clean 35c4961af: 3308 mappings, 3320 declarations, manifest SHA256 d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459, frozen read-only and checksum-verified.

Raw command, test and setup evidence is retained under `/workspace/work/extract-integ/`. Known baseline failures from the session reports will remain failures in the final accounting, never green.
