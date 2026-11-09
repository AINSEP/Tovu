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

## Required open checks resolved

`pluginSource` is created before tools are built: Jini host/node/runtime-core.ts constructs composeSourceService before returning runtime services; Tovu composition/plugin-runtime.ts builds that core before returning; server app/deps assembly copies pluginRuntime.pluginSource into route deps. No later assignment was found in runtime/assistant wiring, so the registration snapshot preserves production behavior.

Tovu credentialed-request.ts re-exports Jini's CredentialedRequestValidationError. A direct runtime equality check confirms identity, so F1 does not change Tovu DELETE error text.

## Owner guide decision

Tovu `aa3f058a8` changes only the approved connection-card assertions at Railway/Render line36 and the Composio/Higgsfield enable wording assertion (plus its test title). All other assertions and all guides remain unchanged. The guidance file is green; all three selected files total 8/10. The two overlay failures now reach their unchanged line38 assertion requiring `deployment_ops_deploy`, which the current host-neutral guides omit. This is pre-existing test/guide drift exposed after the earlier assertion; it is retained because the brief explicitly says to keep every other assertion. It is not counted green and no guide was changed to satisfy it.

## Setup and baseline

Node24.22.1; pnpm10.33.2 pinned in the workspace; Vitest workers max2/min1. Existing node_modules had stale/missing emitted artifacts and dependency links. Setup rebuilt linked dependencies and cloudflare assets, restored only links to already-declared dependencies, and removed six verified untracked obsolete package directories. No manifest, lockfile, guard baseline or fixture was altered for setup. Initial golden failure due missing UI artifact is a setup failure, not behavior evidence.

The real post-setup guard was personally read: exactly the prior R2 plugin-catalog deep source import and R10 ChatPane Icon public-surface violations remain. Neither is described as a green guard. S7 worker reproduced three plugin-identity warning expectation failures at original Jini46cd558de with the same 10pass/3fail result; these are prior, not caused by the new event identity/dedupe fix.

## Integrated gates and delivery

Final integrated gate execution and delivery receipt pending; no completion marker has been written.
