# EXTRACT-INTEG2

Owner-authorized integration and remediation on `cloud/extract-integ` in both public repositories. Conservative accounting start: 2026-11-09 19:05 UTC (earlier than the first recorded clock observation at 19:16:03 UTC); hard deadline 22:05 UTC. No main change, cloud/combine merge, publication, deployment or force-push. The private brief is not committed. Jini's AI-Dev-Shop bootstrap governs this job because its absence from Tovu is expected.

## Integration and history

Verified starting pins: Tovu `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa`; Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`.

S7 (`272ec9d09` / `d00b1c025`) was merged first, then S9 (`09612adbf` / `c744b6e68`). Both content merges were clean, with no conflict resolutions or assertion changes. The first required pull-before-push accidentally flattened the merge topology: the S7 branch became direct ancestry and the S9 commits were replayed. This was corrected additively without rewriting pushed history: Tovu `7d18f3915` / Jini `bc433840e` retain S9 ancestry; Tovu `65250dac1` / Jini `a9fc3e4ad` explicitly record the already-integrated S7 parent. Thus the final history has one explicit merge record for each requested branch, although the additive records occur S9 then S7; source integration occurred S7 then S9. Subsequent pulls use `--rebase=merges`. This history deviation is disclosed rather than claimed as the originally requested topology.

All requested lane reports are preserved. The manifest `exports` and `jini.entries` unions are retained in core, plugins, integrations and devops; final value and report-byte checks are recorded below.

## Findings and focused evidence

Each finding has its own commit; cross-repository changes necessarily have one commit in each affected repository. New behavior regressions were run red before fixes. Raw session logs live under `/workspace/work/integ2/`; final command/count receipts will be committed alongside this report.

| Finding | Tovu commit | Jini commit | Evidence / resulting behavior |
| --- | --- | --- | --- |
| S7 R1 High | `29f1d0843` | `cccac333e` | Exact OFF row used the long description before the fix; after carrying summary through safe metadata, the exact summary-derived row passes 1/1 and plugins build passes. |
| S7 R2 High | `ab3e0c3fd` | `7aaaf6cd3` | Removed generated notes and private-member boilerplate; emitted-contract test checks named security/ordering obligations rather than every member or a member count. Contract and management parsed noncomment code were identical before/after; build and focused declaration test pass. |
| S7 R3 High | `b92f5bedb` | `82e520ca7` | Added exact input keys, approval flag/ask/declined and construction timing, list isolation, restart-only pending code, and canonical installer/source error obligations; emitted-note test and build pass. |
| S7 R4 Medium | `032f80dc5` | `0fae55245` | Moved failure-isolation, privacy, two-array and family/risk rationale beside implementation in host-neutral words; deleted host orphans and obsolete path references. Parsed noncomment code is identical. |
| S7 R5 Medium | — | `ff1c73a2c` | Peer-blocked import was red on semver, then green after canonical error leaf and removal of the remaining claims→manifest→semver constant edge. Old node entries re-export identical classes. Six public/import tests and 134 owning regressions pass; build passes. |
| S7 R6 Medium / recommended | `b15795d74` | — | Catalog blocks moved byte-identically to dependency-free leaves; runtime graph has 17 modules/20 edges and zero cycles. |
| S7 R7 Medium | `ceb3a8d65` | `1b6216cef` | Unchanged uninstall suite red 15/17 (warning counts 2/3 versus 1), then green 17/17; new two-package, three-index, two-binding process-dedupe test red then green 1/1. Diagnostic events now carry package identity; host warns once per package per process. |
| S9 1 Medium | `a0aff9258` | — | New explicit-label/invalid-unrelated-origin regression red with Invalid URL, then green with lazy allowedOrigins; no-label path still validates and no extra HTTP is issued. Deployment group 48/48. |
| S9 2 Medium | — | `20550ab90` | Vitest first reported no suite/0 tests; import-only change runs the same four assertions green through the package runner. |
| S9 3 Medium | — | `b7b339b9c` | Canonical DELETE validation-class obligation documented; runtime identity probe confirms Tovu's re-export is the same Jini class; DELETE/port group 9/9. |
| S9 4 Medium | `9616631fa` | — | Site-key helpers moved into run-ops and re-exported from secrets; removed run-ops→secrets value edge; deployment tests pass. The repository has an active no-circular rule. |
| S9 5 Medium | `34caff527` | `e7f8a53db` | ToolInputError, surface/custody, DELETE and rotation rationale moved with the implementation; host binding comments retain only their current responsibilities. |
| S9 6 Low | — | `ab7c0ba82` | Contract notes name exact HTTPS origins, catalog/tool-id agreement and required handler input fields. |

## Excess cuts and small findings

S7 E1: Tovu `24d99e367` removes the surplus isUnconfigured predicate and its redundant test, retaining canonical instanceof classification. E2: Jini `04230a9e5` removes three redundant aliases. E3: Jini `750392e2a` reuses the public toolIds type. E4: Tovu `20ca38fd8` and Jini `50f2106cc`, with Tovu `b01d09373`, require confirmation surfaces for registration and retain a narrow identity-only shim without unreachable error strings. E6: Tovu `36bbbbc43` removes the one-use family declaration. E7: Jini `54c510c62` restores four literal em dashes with parsed JSON equality. E9: Tovu `f4c6fd156` consolidates imports without assertion changes. S7 L2: Jini `f8605ddb4` states the private-console logging obligation rather than adding an unnecessary log port.

E5 remains because frozen tests still import the identity shim. E8's conditional provenance convention is retained consistently with the other extracted packages. S7 L1 (injecting two existing host strings) and L3 (object callback adapters across hosts) need more than a one-line change and are listed, per the brief's Low rule. L4 is moot after the peer-free R5 fix.

S9 exact cuts: Tovu `d66039ba6` and `d8d877f5e` reuse the canonical credential classifier with the required two-object public signature; Jini `a8fc30e99` removes the optional aliases and empty zero-argument factory parameters. Jini `385520de0` and Tovu `8246f3672` replace repeated S9 notes and declaration-count sensors with specific host obligations. Declaration existence and the two-object argument assertions remain. Jini `ed5cf396a` and `74d40263c` make the credential privacy and surface-emitter wording precise. Jini `dfaa1b494` makes the one-line vendor example neutral. The explicitly deferred frozen-test shims remain. Injecting the two remaining S9 model/card phrases (`this site's key` and restart wording) needs more than one line and remains listed under the Low rule.

Final note corrections: Jini `e7deedfad`, `835b0e7b2`, and `4de40e0bb` distinguish runtime uninstall timing, scope list privacy correctly, require fresh consent even for previously approved revisions, and require a shared preview/install owner. Tovu `d968cd682` and `aab35f81b` pin these precise obligations. The S7 contract shrank from 269 notes / 54,140 bytes to 30 notes / 14,810 bytes; management/install/source have zero private implementation notes.

The previous S7 report's claim that the frozen uninstall warning counts were “proved wrong” is withdrawn and superseded by R7's behavioral fix. The original report remains byte-identical as requested; neither frozen uninstall assertion was edited.

## Required open checks resolved

`pluginSource` is created before tools are built: Jini host/node/runtime-core.ts constructs composeSourceService before returning runtime services; Tovu composition/plugin-runtime.ts builds that core before returning; server app/deps assembly copies pluginRuntime.pluginSource into route deps. No later assignment was found in runtime/assistant wiring, so the registration snapshot preserves production behavior.

Live-reach inventory covers 33 bundled manifests (31 selected package payloads plus two local manifests): none currently uses the legacy identity namespace or MCP aliases, and 29 summaries differ from descriptions. R1 therefore protects shipped public purposes. R7 still protects retained legacy compatibility; this inventory does not claim that user-installed packages have no legacy metadata.

Tovu credentialed-request.ts re-exports Jini's CredentialedRequestValidationError. A direct runtime equality check confirms identity, so F1 does not change Tovu DELETE error text.

## Owner guide decision

Tovu `aa3f058a8` changes only the approved connection-card assertions at Railway/Render line36 and the Composio/Higgsfield enable wording assertion (plus its test title). All other assertions and all guides remain unchanged. The guidance file is green; all three selected files total 8/10. The two overlay failures now reach their unchanged line38 assertion requiring `deployment_ops_deploy`, which the current host-neutral guides omit. This is pre-existing test/guide drift exposed after the earlier assertion; it is retained because the brief explicitly says to keep every other assertion. It is not counted green and no guide was changed to satisfy it.

## Setup and baseline

Node24.22.1; pnpm10.33.2 pinned in the workspace; Vitest workers max2/min1. Existing node_modules had stale/missing emitted artifacts and dependency links. Setup rebuilt linked dependencies and cloudflare assets, restored only links to already-declared dependencies, and removed six verified untracked obsolete package directories. No manifest, lockfile, guard baseline or fixture was altered for setup. Initial golden failure due missing UI artifact is a setup failure, not behavior evidence.

The real post-setup guard was personally read: exactly the prior R2 plugin-catalog deep source import and R10 ChatPane Icon public-surface violations remain. Neither is described as a green guard. S7 worker reproduced three plugin-identity warning expectation failures at original Jini46cd558de with the same 10pass/3fail result; these are prior, not caused by the new event identity/dedupe fix.

## Integrated gates and delivery

The gate selection is the union of the final S7, S9 and earlier integrated named gates, plus conservative repository source/layout readers and this job's regressions. It contains 377 historical named Node files inside a 1,080-file primary selection. A separate audit of omitted readers added 14 files: ten Node files / 34 passing cases and four admin files / 35 cases, with 34 passing and one reproduced prior CSS stacking failure. The audit checked 417 filesystem-reader candidates and 3,181 omitted files for helper aliases; its criteria and limits are retained in the receipt rather than presented as a proof that arbitrary dynamic readers cannot exist.

Production logic was frozen at Tovu `b014553b4b22e1dccaa839d611f3253016393c21` / Jini `e7deedfad285f4bdb6307f56f9ded39848c2f245`. Final tested contract/test pair: Tovu `aab35f81b1c825f5be55ee7d520cc69711651902` / Jini `4de40e0bb766b56118d0335e2c464d679340070d`. Later Jini changes are comments only, verified by parsed noncomment equality; later Tovu changes are one declaration-test typing correction and one documentation assertion. Fresh plugin build, all 19 new-test type files and the affected declaration tests pass on those descendants. Tovu `3c6db135a` fixes this job's own TypeScript AST narrowing error without changing any assertion; it is not classified as prior debt.

The non-test union has 75 requested labels mapped to 47 concrete executions, with the original labels and commands retained. `pnpm check:cross-package` passes XP1–XP5. Touched package builds/types, eight dependent builds, Tovu's linked production type-check, strict production lint and the named SDK/contracts/core/OAuth/MCP/UI checks pass. Missing historical scratch commands were reconstructed with the original selected files and immutable declaration inputs. The original declaration baseline was not regenerated from the tip: its 3,320 declarations / 3,308 mappings were rebuilt from immutable Jini `35c4961af`, SHA-256 `d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459`.

`pnpm guard` exits 1 with the two prior findings: R2 in plugin-catalog/scripts/generate.ts (deep import of agent-plugins/src/core/identity-namespace.js), and R10 in ChatPane (Icon outside its public barrel). HW1–HW9 report zero new findings. The actual layer/isolation API audit reports no layer or blocking isolation findings across 580 closures; 16 existing SI-c/SI-d advisories remain. The broad Tovu test type-check exits 2 with the exact prior 13 errors / 15 diagnostic lines, SHA-256 `3755005668997fe884a56aa7ff8cc1c84de10c7a0ea775656602daf7075a8e0c`. These raw red exits are retained.

Jini's ten selected groups pass 2,011/2,011 cases over 153 file runs; supplemental owning-package checks pass 95/95 over three files. Admin passes 1,522/1,522 over 85 files. Installed Vitest4 rejects the required minWorkers flag, so the work-only runner uses Vitest3.2.4 with exactly maxWorkers=2/minWorkers=1. Its restoreAllMocks behavior erased an existing manual matchMedia default in one file; a work-only compatibility setup restores only that captured default if erased. The unchanged four-case file passes with that setup, and also passed on native Vitest4 as a diagnostic. No repository test/config was changed for the runner.

All 43 actual PostgreSQL cases pass using an isolated PostgreSQL17 Unix-socket cluster; that cluster was stopped after the run. Browser cases use stock Chromium155. POSIX child lifecycle checks run under an official tini subreaper because the environment's PID1 does not reap orphaned children. The close-store check passes 13/13 with real PGlite, sockets, locks and SIGINT, using a private work-directory OS profile because the stock profile lacks its runtime directory. Coverage and native assertions/timeouts remain enabled. Earlier setup/outer-harness timeouts are retained as superseded attempts, not called behavior failures or silently removed.

Saved data and compatibility: current custody/card/deploy pins pass 37/37. Exact archived old Tovu/Jini readers open the current S5 SQLite database (five checks / three credentials) and accept current S8 rows (3/3 with exact summary hints). A resolution guard blocks current production source from those readers, and 12,479 archived files match their git blobs. This proves old-reader SQLite compatibility; current PGlite and PostgreSQL checks are separate evidence. No fixture, golden, baseline, guide or saved input was rewritten.

The tool-metadata golden remains SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`. Final integrity verifies every base/S7/S9 manifest union key and value, six original lane report files, 427 Tovu plus 169 Jini preexisting fixtures/goldens/baselines, and 31 Tovu plus 38 Jini guides. The S9 recording and entire R7 uninstall test are unchanged.

| Final gate lane | Cases | Passed | Retained failures / other outcomes |
| --- | ---: | ---: | --- |
| Primary Node: all 1,080 files completed | 12,784 | 12,683 | 80 verified prior failures, one verified prior cancellation, 20 native skips |
| Historical named subset: 377 files | 4,563 | 4,534 | 24 prior failures, one prior cancellation, four native skips |
| Required admin: 85 files | 1,522 | 1,522 | None |
| Additional source readers: 14 files | 69 | 68 | One prior CSS stacking failure |
| Selected Jini: 153 file runs / ten groups | 2,011 | 2,011 | None |
| Supplemental Jini owners: three files | 95 | 95 | None |

These lanes overlap; their counts are not a unique-test grand total. The primary selection has 1,043 green files and 37 files with verified prior outcomes, with zero unclassified/new failures. An additional Jini plugin-identity probe retains three prior warning assertions (10/13 pass), reproduced at original Jini46cd558de; its separate receipt is included rather than concealed by the green selected Jini groups.

The last two unclassified primary failures were 30-second CLI fixture-init timeouts before telemetry/auth assertions ran. Exact filtered original/current checks both passed 2/2. The full unchanged serve file then passed 17/17 in 525.18 seconds with coverage, flags, native timeouts and assertions intact. Export, site-key, browser, PostgreSQL, backup and close-store setup retries also reached terminal results; no outer timeout is left silently counted green.

The complete prior failure names, commands and original/baseline provenance are in [the gate receipt](extract-integ2-gates.json). They include frozen host-wording/manifest sensors, existing MCP composition and approval debt, desktop fixture lifecycle mocks, a CLI adopt readiness timeout also reproduced at the initial pin, existing site-preview/title expectations, stale source/debt/worker-import sensors, vendor-overlay schema fixtures and old SDK/version expectations. The source secret-scan failure reports four PAT-shaped strings already in the tracked S4 report; their values are not copied into this report or receipt. Two unchanged overlay deployment-tool assertions remain as described above. Native skips were preserved; no skip/exclude, guard baseline, debt allowlist, package lock or fixture was added to obtain these results.

Last green pair for focused repairs and non-regression checks is Tovu `aab35f81b1c825f5be55ee7d520cc69711651902` / Jini `4de40e0bb766b56118d0335e2c464d679340070d`. **There is no fully green union pair** (`last_fully_green_union_pair: null`): prior test outcomes, the two guard findings and 13 broad test-type errors remain red. All required High/Medium findings are fixed; the listed Low items and explicitly deferred frozen-test/provenance cuts remain.

The receipt retains every pushed first-parent SHA through its delivery parent, all merge records, exact commands/counts/log hashes, final integrity, red/green evidence, baseline reproductions and runner qualifications. Its own final report commit is identified by branch history and the final response. All 1,232 command-log hashes in the aggregate were reverified. The delivered receipt SHA-256 is `55f528d77873e65851ca7ec842e8e646253f5c01b368b7175f0e626b966456f4`.

Completed before the 22:05 UTC cap. Final independent process inventories find zero live test, Node, browser, PostgreSQL or gate-controller processes; the private cluster's PID file is absent. The environment retains 1,685 exited StateZ records under its non-reaping PID1; these are not running processes. The sole generated untracked marker was removed after verification. Only the two requested report artifacts are staged for final delivery; Jini is clean. No main/combine, force-push, publication or deployment action occurred. Remaining work is limited to the explicitly listed prior failures and deferred Low/conditional items, with the merge-history deviation disclosed above.

EXTRACT-INTEG2 DONE
