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

## Sweep and gate progress

The two additional published-install defects were fixed in Tovu `7c4c3e86e`: `portable-plugin-host.unit.test.ts` now checks its same seven bodies plus declarations in `dist`; `h1b/hosted-store-seams.test.ts` checks the public dist suffix and a separate emitted ESM instance instead of a checkout prefix/source module. Registry-shaped red runs reproduced four failures, then the remaining source-import failure; final published and linked runs both pass 9/9. No assertions/cases were removed.

Executable-vocabulary sweep across all four moved scopes found no remaining Tovu product/tool/permission/actor/path literal. `content.read`/`content.extend` in invocation-binding errors identify the Jini plugin SDK's own operations, not host permissions; retained alongside the original rationale. Contract sweep matched store/repository/envelope identity, OAuth registration identity, declaration envelope ownership, importer admission and install locks to the Jini notes. The S4 approval authority gap is closed at the method declaration; S4 F2 notes emit from the canonical S5 declarations. Credential tool/card and project-key orchestration still in Tovu has its consumer contracts there; the extracted credential request/store ports already carry ordering, custody and safe-error requirements. Jini `46cd558de` aligns that error note with classify-once/callerSafeMessage decoration. No new cross-package dependency or helper layer.

S8-2: the exact allowed additive changes remove both custom-credential unresolved entries and restore static accounting for `credential_copy_from_project`. Real runtime admission/exchange-only policy is intact. The remaining two scanner failures (`cli/commands/import-local.ts:151: file`, missing static opener `agent_plugin_connect`) reproduce exactly at the supplied session 4 pin `2585e865e`: 8/10 pass, 2 fail. Session 3 and session 8 unchanged tests were run independently too. They are prior input drift, left unchanged under the stop rule and never counted green. The separate secret-form card file passes 4/4.

Current final source pair: Tovu `7c4c3e86e` / Jini `46cd558de`. Combined gates are still running. Already verified: XP1–XP5 clean; actual guard has exactly R2(1)+R10(1), all HW new=0; plugins/layers/isolation clean; audit 578 closures, 16 informational findings (SI-c9/SI-d7), no violation; strict lint on the named S4/S5/S6 production scope and normal S8 lint pass; OAuth full suite 755/755; all supplied manifest entries and lane reports preserved byte-for-byte; metadata and frozen goldens unchanged. The original declaration snapshot remains read-only and unchanged.

Setup corrections are not counted as baseline debts: pinned pnpm 10 and workspace cache/store; emitted required package dependencies before final gates; removed six verified untracked obsolete package directories; generated Cloudflare emitted assets. The first scratch S6 smoke cited the error class on the wrong internal module; corrected its citation to runtime-core without changing production. The first scratch S8 tsc configs resolved `@types` from scratch; corrected explicit typeRoots to the installed host types. The new grant fixture's two canonical repository return signatures were corrected in Jini `e3121a683`. S5-1's six old registration characterization expectations were updated to exact plain-message text for the approved unknown-code security change in Jini `95fbcd1d0`; all protocol-code expectations remain exact, with additional recognized-code cases. No golden, fixture, guard, debt, layer or assertion-strength reduction.

## Final-pair repair during the gate

The broad test compile correctly exposed two integration issues beyond the recorded diagnostics. Tovu `bc56c883e` supplies the new required foreign grant-repair callback to the second S4 fixture (no assertion changed). Tovu `3fa72e29f` retains S5's small `resolveAgentPluginSignInPort` compatibility export: S5's unchanged class-identity test imports it, while S4's modern connect flow still uses its required explicit classifier directly. The restored export is not called by any production path. This reconciles the two sessions without deleting the S5 assertions or restoring the legacy fallback to modern connect. Red: real S5 file fails its missing ESM export. Green: that file plus the remaining-seam fixture pass 10/10; strict lint of the shim passes. These are now pushed and verified.

New final source pair: Tovu `3fa72e29f0de96ae826eb5ef384c1e47cd74469f` / Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`. Tovu main compile and S8 pins/declarations pass again; broad tests compile has exactly the recorded 13 errors / 15 diagnostic lines, line-for-line equal to S4's final raw baseline, zero new errors. Early matrix files will be replayed after the current tail to put every selected file on this source pair.

Both actual old-reader checks pass: original Tovu `c3801c833` with independently installed/built Jini `4044fe3c0` passes S5's five post-write database checks and opens all three credentials; the S8 C0 reader at Tovu `3f19a8bdb` opens all three newly written credential rows and verifies their exact summary hints. Reader inputs were checksum-stable before/after. The S8 reader is a disclosed reconstruction of the historical scratch-only reader, using the original store, SQL facade and synthetic fixture key; no old source or fixture was modified.
