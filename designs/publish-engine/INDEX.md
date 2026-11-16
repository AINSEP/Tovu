# Publish engine design: index

Status: **COMPLETE** (design only; no source changed, no test run). 2026-11-16.
Bases: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`.
Branch: `plan/publish-engine-design-2026-11-16` (from `plan/terra-2026-11-15`).

| File | What it holds |
|---|---|
| `DESIGN.md` | the design: verified inventory, port checks, trust ownership table, target shape, migration graph, tests, risks, lane interaction, estimate, owner decisions, practices table |

## Read this first

1. **Size.** The three sheets (B01, B02, B03) cover 26 files and 5,428 lines. They cannot land without two more groups that are still in Tovu: the publish framework (12 files, 3,224 lines) and publish trust (10 files, 2,662 lines). Total reach is 48 files and 11,314 production lines, with 73 test files.
2. **Order.** Phase 0 (Tovu-only preparation) -> B01 transfer -> framework F1, F2 -> B02 (S1, S2, S4, S3, S5) -> B03 (P3, P1, P2, P4). Trust (T1, T2, T3) and B03-P3 run beside the engine lane and join at B03-P4. R-BARRELS runs before Phase 0.
3. **Estimate.** About 2.6M Sonnet and 0.43M Opus tokens.

## Where to find things in DESIGN.md

| Section | Content |
|---|---|
| 0 | summary and the four findings the sheets missed |
| 1 | inventory per group, with lines, imports, importer counts, over-limit functions; 1.7 lists every stale sheet claim |
| 2 | behavioural port checks: HTTP client, keyring, vault, positional signatures |
| 3 | every trust decision, signature step and key path: owner, port, and the test that fails when the check is removed; 3.3 lists values that must not be renamed |
| 4 | folder tree, file and function splits, dependency direction, contract signatures, what Tovu keeps |
| 5 | migration graph: each step's prerequisites, callers and tests |
| 6 | characterization tests and the mutation proof |
| 7 | risks and guards |
| 8 | untangle lanes, waves and the size designs |
| 9 | estimate per step |
| 10 | owner decisions OD-1 to OD-8 |
| 11 | what was not verified (U1 to U9) |
| 12 | owner practices table |

## Riskiest three calls

1. **Making the engine generic over the host's port bag** (`PublishContentDeps<TPorts>`) and turning the module-level contributor registry into an instance. It touches 41 importing files and 229 test call sites. The engine and peer port shapes are drafts: `apply-loop.ts` and most of `peers.ts` were not read line by line.
2. **`PeerCredentialStorePort`.** `peers.ts` builds platform's vault service inside the domain today. The port must keep "exactly one function decrypts" and "never write a credential unsealed" true across the Jini/Tovu boundary.
3. **Frozen values.** `tovu-publish-challenge-v1`, the three key-derivation purposes and the vault scope `ownerKey: "tovu"` are signed, derived or stored. A neutrality rename would break every existing connection or sealed credential. They become host-supplied values with a pinning test.

## Owner decisions needed

- OD-1 registry instance instead of module state (recommended: yes)
- OD-2 trust lives in `cms/publish/trust` (recommended: yes)
- OD-3 entry points: one explicit-export entry per slice, or one exports-map key per leaf file. This conflicts with the "no barrels" practice either way and sets about 300 import specifiers
- OD-4 the three platform-binding adapters stay in Tovu until the host-preset lane exists
- OD-5 key-derivation purposes are host-supplied with no Jini default
- OD-6 rename the failure code `"not-a-tovu-site"` (only after checking it is not stored)
- OD-7 merge Jini's two `KeyringPort` declarations in a separate lane
- OD-8 R-BARRELS runs first

## Not done here

- No executor sheets. The Opus drafts named in section 9 (function splits, `PeerCredentialStorePort`, generic types) come before any Sonnet run.
- No test or typecheck was run: neither checkout had dependencies installed.
