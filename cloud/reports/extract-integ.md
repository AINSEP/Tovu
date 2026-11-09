# EXTRACT-INTEG

Completed 2026-11-09 09:13 PST (17:13 UTC); conservative start 08:27 PST, 46 of the 180-minute cap used.

Both branches are `cloud/extract-integ`. Final gated source pair:

- Tovu: `3fa72e29f0de96ae826eb5ef384c1e47cd74469f`
- Jini: `46cd558de9c6b4fa882b46349450ce3bcf0a378d`

All requested findings, including the added S8-2, and the bounded sweep are implemented. No new gate failure remains. Prior failures below retain their real nonzero results. Report-only descendants do not claim another implementation test run. The [gate receipt](extract-integ-gates.json) records exact file selections, commands, counts, failing case names, source pair, reader input checksums and raw guard output. Session-only logs/scripts remain under `/workspace/work/extract-integ/`.

## Integration

Branches were created from the exact supplied S4 tips: Tovu `2585e865e`, Jini `ade600935`. One merge commit per lane, in the required order:

| Merge | Tovu | Jini |
| --- | --- | --- |
| S5 (`50e086771` / `324103f25`) | `0c127ef68` | `b99109266` |
| S6 (`520c4fe66` / `652ef2faf`) | `c0c2c705b` | `e15c6c0da` |
| S8 (`1626ff058` / `a266ba821`) | `de1fc1a81` | `caafcade4` |

Every manual conflict and its resolution:

| Repository/path | Resolution and reason |
| --- | --- |
| Tovu `apps/website/src/contracts/core/external-mcp-access.ts` | Kept S5's canonical package shim instead of duplicating classes/projections. Transplanted S4 F2's stable snapshot ordering/byte comparison, strict unreadable-list and public validation-reason notes onto Jini's canonical `packages/mcp/src/federation/hosted/access.ts` in the same merge. |
| Jini `packages/core/src/contracts/hosted-mcp/config.ts` | Kept S5's neutral declaration wording, canonical store rules and removal of host paths/tool names. No runtime declaration field was dropped. |
| Jini `packages/core/src/contracts/hosted-mcp/record.ts` | Kept S5's neutral declarations and added provisioner, whole-envelope reseal and shared-repository custody notes. |

S6 and S8 merged without manual conflicts. Core/MCP/integrations `exports` and `jini.entries` were checked against every input lane: every key and value survives. Changesets remain distinct; all four lane reports remain byte-identical. No `cloud/combine` merge, main change, force push or publication.

## Findings and red/green evidence

Vitest commands below use `--maxWorkers=2 --minWorkers=1`. Tovu commands use `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 <file>`.

| Finding | Commits | Observed red → green and resulting behavior |
| --- | --- | --- |
| S5-1 | Jini `c5762c167`, `95fbcd1d0` | `oauth/tests/registration-error-redaction.test.ts`: initial 5 failures/6 passes → all 25 final cases pass, after adding further recognized-code pins. Concatenated provider canary is withheld from message, action, serialized metadata and cause. Known protocol codes retain exact old text; unknown registration errors use the plain refusal. Whole OAuth/hosted-sign-in search found only the token and registration interpolations, now both allowlisted; device and callback metadata also reject unknown provider values. Full OAuth suite **755/755**. Six old characterization expectations were updated only for the approved unknown-code text change; exact assertions and test count retained. |
| S4-1 | Jini `8b25c2332`, `e3121a683`; Tovu `a309dc12b`, `bc56c883e` | `connect/__tests__/grant-repair.unit.test.ts`: 2 fail → 2 pass, exercising enable preview and sign-in defaults with a foreign repair tool. Required host copy is threaded through both inputs. Tovu supplies the original sentence unchanged. Existing second-host fixtures received the required callback; their assertions remain intact. |
| S4-2 | Jini `c16cb354b` | Documentation only. The emitted `accessApprovalHandler` method itself carries the fail-closed active-human checks before disclosure and after explicit confirmation, authenticated answer binding to tool/exchange, scope/person matching, and final permission/activation/fingerprint rechecks. AST attachment/content check passes on the emitted declaration. Tovu approval code is unchanged. |
| S4-3 | Jini `b022f2a5d`; Tovu `00028e4d1` | `connect/__tests__/federation-object-args.unit.test.ts`: 2 fail → 2 pass. Portable functions take `{serverKey}` / `{raw}` and optional objects. Tovu's original positional signatures remain wrappers. Saved ID derivation and empty/malformed list behavior are unchanged. |
| S4-4 | Tovu `1ee3b00cb` | Original nine-body scanner fails ENOENT against a package.json+dist fixture with no src; adapted scanner passes and the full existing file passes **6/6** against that published shape. It checks all nine JS bodies plus nine declarations, retaining boundary and vocabulary assertions. |
| S4-5 | Jini `8948ff75c` | New recursive TS-AST scanner: 1 failed case exposing 12 own-barrel edges → 1 pass. All six affected implementation files use relative owning modules; the scan covers every implementation file/subfolder in connect, including type-only imports. No moved rationale or runtime body was cut. |
| S8-1 | Tovu `89397b300`; Jini contract wording `46cd558de` | Three regression cases fail → pass; full `extract-s8-x-host-operations.test.ts` **17/17**. The original rejection is classified once. Validation/egress errors schema-decorate only `callerSafeMessage`; other rejection objects retain identity. Raw internal-address text is absent. Redundant predicate removed; emitted core note agrees with this contract. |
| S8-2 | Tovu `3cdf04d0d` | Real runtime allowlist admits `credential_copy_from_project`, permits its parked exchange and refuses fresh execution. The real completeness test reproduces the two S8 unresolved entries and missing copy ID. Only the permitted additive set/map entries and explanations were added, including the exact requested comment. S8 deltas disappear; remaining **8/10** is exactly the two failures at supplied S4 pin `2585e865e`, independently rerun. Secret-form card test **4/4**. Neither remaining failure is counted green. |

Additional integration repairs, preserving both sessions' assertions:

- Jini `8a483889c`: S4's BYO origin-order test lacked S5's required callback field rules. Real test 3 fail → 3 pass after binding the existing real fixture, with every assertion unchanged.
- Tovu `3fa72e29f`: S5's unchanged hosted-error identity test imported a compatibility resolver S4 had removed. Real file red: missing ESM export. Retained the small S5 legacy export; S4's modern connect code still requires and calls the explicit classifier directly. No production caller uses the restored adapter. Hosted identity plus remaining-seam tests pass **10/10**; strict lint passes. The broad compiler's own two new integration errors are gone.

Focused raw evidence: `s5-1-{red,green,full-green}.log`, `s4-1-{red,green}.log`, `s4-3-{red,green}.log`, `s4-4-scanner-{red,green}.log`, `s4-4-green.log`, `s4-5-{red,green}.log`, `s8-1-{red,green}.log`, `s8-2-{red,green,runtime}.log`, `merge-byo-{red,green}.log`, `merge-sign-in-{red,green,lint}.log`. The S8-2 “green” filename retains the real exit 1 and two prior failures; it is not an all-green claim.

## Sweep

1. **Host vocabulary:** executable literal/AST review across the four moved scopes found the grant repair tool name fixed by S4-1 and no further product permission/tool/actor/path defaults. `content.read`/`content.extend` label the plugin SDK's own operations. `plugin:<id>`, `site-runtime` and `unknown/<id>` are the already documented plugin-domain actor/install identity grammar, not new host defaults. Original provenance/why comments remain.
2. **Second-host rules:** checked shared repository/envelope/error identity, registration identity, type envelope ownership, importer admission/freshness and install lock obligations against Jini declarations. Closed the approval authority gap in S4-2 and moved F2 notes to S5's canonical declarations. Core request rejection wording now explicitly requires classify-once/safe-message decoration. Still-host-owned credential-card/project-key orchestration retains its consumer contracts in Tovu; extracted store/request ports carry their own custody and ordering rules. No new package/import layer.
3. **Published installs:** beyond S4-4, Tovu `7c4c3e86e` fixes `portable-plugin-host.unit.test.ts` (same seven modules, now fourteen JS/declaration artifacts) and `h1b/hosted-store-seams.test.ts` (public dist suffix, separate emitted ESM instance rather than a checkout prefix/source import). Registry-shaped runs: 4 failures, then one remaining source-import failure, then **9/9 pass**. Normal linked run **9/9**. Private vault-symbol refusal remains asserted; a distinct-function assertion was added.

## Integrated gate

The final source pair above is the last green pair **apart from the documented prior debts**. After the last compatibility repair, the compiler was rerun and every earlier matrix file (indices 0–187) replayed; later files and the timed case already ran after that source commit. All selected results therefore apply to the same final implementation.

Selection: exact recovered S4 **83** T files, S5 **219** files and S8 **56** files, plus S6's named owner groups and both requested MCP-UI tests; overlaps once. **308 named files + 1 separately timed known case.** S6's original `/home/user/s6-raw/f6-run.sh` and exact scratch lists were never tracked and are unavailable. Its groups were reconstructed from report/inventory citations, with every new S6 test included. The receipt discloses all choices: its J-plugin reconstruction is **12 files /151 cases**, not a claim to recover the historical 127. This exact-list provenance limitation remains; no broad repo test suite was substituted.

| Gate | Actual final result |
| --- | --- |
| Tovu named matrix plus timed case | **309 file runs, 3,941 tests: 3,916 pass, 22 prior failures, 1 prior cancellation, 2 existing skips.** No new failure. Every nonzero file/case is listed below and in the receipt. |
| Jini named test groups + regressions | **16 groups, 123 file runs, 1,832/1,832 pass.** Includes checker 76, agent-plugins 100, new connect 5, API 385, hosted MCP 7, OAuth 755, credential HTTP 217, neutral hosts 40, S6 new 31/worker54/entry1/architecture5/reconstructed plugin151, platform3/UI2. |
| Package builds | Core, OAuth, MCP, integrations, plugins, agent-plugins and named plugin dependents all exit 0. Required cloud bootstrap emission completed. T SDK build, Jini relink and contracts build exit 0. |
| Jini type checks | All eight named packages, scripts, neutral host and excluded core/UI card pin exit 0. |
| Tovu types with Jini linked | Main, all 11 S8 pin/support files, both emitted credential contracts and provider-setting pin exit 0. Broad test compile exits **2**, exactly **13 errors /15 diagnostic lines**, byte-for-byte equal to recorded S4 baseline after its npm warning is excluded. |
| XP1–XP5 / checker | `pnpm check:cross-package` exits 0. Independent clean original `35c4961af` snapshot: 3308 mappings, 3320 declarations; manifest **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**, all recorded checksums verified, read-only throughout. Never regenerated for a gate. |
| Real full guard | Exit **1**, exactly the two prior R2/R10 violations below. HW totals **17/16/135/1/0/0/0/49/0**, every new count 0. All six R13 informational lines read; no N1/N2/R8/SI/new finding. Raw output retained in receipt. |
| Plugin guards / layers / isolation | 0 / [] / []; audit **578 closures**, only the prior **SI-c9/SI-d7** informational findings. |
| Lint | Named S4/S5/S6 strict complexity/cognitive≤10/no-inline scopes pass; normal moved production lint passes. Exact S8 J and T max-warnings-zero selections pass; T S8 Biome has zero errors. New compatibility shim strict lint passes. |
| Emitted notes | AST verifies the S4-2 method note and all three transplanted F2 notes are attached to their canonical declarations; classify-once/safe-message note emits from core. |
| Metadata / frozen data | **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6** unchanged. Original moved-tool/card/cost goldens, G-plug goldens and existing saved-data recordings unchanged. No old migration, SQL, golden or baseline JSON modified. |
| S5 new→old reader | Original T `c3801c833` + independently installed/built J `4044fe3c0`: exit 0, all five database checks, all three credentials open. Workspace/row identity, untouched envelope bytes and format columns preserved. |
| S8 new→old reader | Original C0 T `3f19a8bdb` + original J: exit 0, **3/3** rows accepted and exact summary hints. Scratch reader reconstructed from the original store/SQL facade/synthetic key; no old source/fixture modified. Final input checksums are in receipt. SQLite-only claim. |

Prior failures retained, not counted green:

| File/group | Final prior failure count |
| --- | ---: |
| external-mcp-connection-source.operator-read-only (old `tovuDefaultTools`) | 3 |
| bundled composio / GitHub Actions / GitHub / Supabase / ui-ux-design expectations | 1 /1 /2 /5 /4 |
| API vendor-neutrality source scan | 1 |
| composition deps-provider-plugin-boot EACCES | 1 |
| external-MCP OAuth desktop-loopback wiring source scan | 1 |
| plugin-host bundled publisher identity | 1 |
| MCP-UI completeness: unresolved `cli/commands/import-local.ts:151: file`; unexplained `agent_plugin_connect` | 2 |
| plugin-enable-access fourth case | 1 cancellation at native 60-second timeout; 3 other cases pass |
| J guard R2: plugin-catalog/scripts/generate.ts; R10: ChatPane.tsx | 2 violations; raw exit 1 |
| Broad T test types | 13 unchanged diagnostics; raw exit 2 |

The historical S6 CJS-hook failure is also recorded: on Node **24.22.1**, that exact test passes at both the unchanged original T pin and the integrated tip. No fix is claimed for it. Two pre-existing ui-ux-design environment-acceptance skips remain visible.

Setup/harness corrections are not baseline debts: pinned pnpm10 with workspace cache/store; emitted required dependencies before final gates; removed six verified untracked obsolete package directories; built generated Cloudflare assets; corrected a scratch smoke export's module citation and scratch tsc typeRoots. The first scratch strict lint applied S4/S5/S6's ceiling beyond its named scope to an S8-only helper; the report's actual scopes were restored without changing that helper. Source/test/type errors caused by this job were repaired and relevant gates rerun. No assertion or threshold was weakened, no baseline/fixture regenerated to fit changed output, and no checker/guard/debt waiver was added.

## Delivery and remaining work

All implementation commits are pushed; full first-parent SHAs follow. The final report/receipt commit is report-only and its pushed SHA is supplied in the task response. GitHub's one transient HTTP503 on pull was retried successfully; every final push was verified. Nothing remains to implement for the requested findings. Prior debts and the unavailable original S6 scratch-list provenance are the stated limitations.

### Tovu — cloud/extract-integ

| Full pushed SHA | Commit |
| --- | --- |
| `0c127ef681d134721e4caa7dd2b295de111462bc` | Merge remote-tracking branch 'origin/cloud/extract-s5' into cloud/extract-integ |
| `c0c2c705b9d0354011c83d4038c491a00b53d3c5` | Merge remote-tracking branch 'origin/cloud/extract-s6' into cloud/extract-integ |
| `de1fc1a81c89c6f83a873f6a2138464d25e9660a` | Merge remote-tracking branch 'origin/cloud/extract-s8' into cloud/extract-integ |
| `a309dc12b576baa7bee1658b31d496967145a949` | fix(agent-plugins): bind existing Tovu grant-repair text |
| `00028e4d1d72aee3436cee7ae17c6a4e4ea7d06b` | fix(agent-plugins): preserve positional federation compatibility wrappers |
| `1ee3b00cb793e7c05ef47fe00b199c4f6321c31e` | test(agent-plugins): scan compiled artifacts in published connect package |
| `89397b300c9908f8e943398a4998692a7f13f911` | fix(credentials): decorate classified caller-safe rejection text once |
| `3cdf04d0d00d33b76eaa00b2af2e830b19bf74e5` | test(credentials): record host-bound copy and confirmation exchanges |
| `736c9014b73f4ef1bd521d3b41a78a0e14e6dc6a` | docs: record integration commits and focused repair evidence |
| `7c4c3e86eec1f4ca5cabf987d520df25e9a70a28` | test(extraction): use published artifacts in remaining consumer seam checks |
| `b2f06677ad2c0146df527bf6030fe16a851860a3` | docs: record sweep fixes and integrated checker results |
| `bc56c883e383dc76b66907f4d0e486ad2d61339c` | test(agent-plugins): supply repair copy in remaining second-host grant fixture |
| `3fa72e29f0de96ae826eb5ef384c1e47cd74469f` | fix(integration): retain S5 legacy sign-in classifier compatibility |
| `3f3a5a19268c21992ee9b3fbe72a6f695c630978` | docs: record final-pair compatibility repair and old-reader checks |

### Jini — cloud/extract-integ

| Full pushed SHA | Commit |
| --- | --- |
| `b99109266c9bc90d5e3d6670810d1fa15fb9e016` | Merge remote-tracking branch 'origin/cloud/extract-s5' into cloud/extract-integ |
| `e15c6c0da747ac2e17ab6d4843b3226f3adadbb2` | Merge remote-tracking branch 'origin/cloud/extract-s6' into cloud/extract-integ |
| `caafcade4a139d3b4ebe3aa9d9cb19460cc3fb26` | Merge remote-tracking branch 'origin/cloud/extract-s8' into cloud/extract-integ |
| `c5762c1679d405a08cd655e1fd025977d8b7df45` | fix(oauth): allow only protocol error codes in public registration failures |
| `8948ff75ce356d94cbcf6023da9d7d3f011807bd` | fix(agent-plugins): use relative owners inside connect modules |
| `c16cb354b61d4923fbea11f94781a5a23bf18de8` | docs(agent-plugins): require active human authority at both approval boundaries |
| `8b25c23324ced6a775d237db9276f076ac544576` | fix(agent-plugins): inject combined-grant repair copy from host |
| `b022f2a5d20808bcdd1e64182379fe595346be3c` | fix(agent-plugins): take object arguments for federation projections |
| `8a483889c618f5769be915ced837c683bc80a2e4` | test(integrations): wire callback rules into integrated BYO origin regression |
| `e3121a683701b3b3524e6924954c805f274153de` | test(agent-plugins): satisfy canonical repository fixture signatures |
| `95fbcd1d0d0bb0e3bbb47a67708582445bd1b992` | test(oauth): pin plain registration refusals and recognized protocol vocabulary |
| `46cd558de9c6b4fa882b46349450ce3bcf0a378d` | docs(extraction): align host rejection contracts with caller-safe decoration |

Final cleanup at 2026-11-09T17:12:55.900554+00:00: zero active task test/build/server processes. Both tracked source trees clean before this report-only write. All lane report/manifest and frozen-data checks pass. No brief was committed.

EXTRACT-INTEG DONE
